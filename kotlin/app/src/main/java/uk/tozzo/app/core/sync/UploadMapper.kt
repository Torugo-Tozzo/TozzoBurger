package uk.tozzo.app.core.sync

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.put
import uk.tozzo.app.core.network.ApiJson
import uk.tozzo.app.core.network.SyncApi
import uk.tozzo.app.core.network.UploadRequest
import uk.tozzo.app.core.network.UploadResult
import uk.tozzo.app.domain.DbTime
import uk.tozzo.app.domain.Money
import java.util.UUID

/** One entry of the local upload queue (a PowerSync `CrudEntry`), with its typed values in [data]. */
data class PendingOp(
    val clientId: Int,
    val op: String,
    val table: String,
    val id: String,
    val data: Map<String, Any?>?,
)

/** Turns [PendingOp]s into the ops of `POST /v1/sync/upload`. */
object UploadMapper {
    private const val PRODUCTS = "products"
    private const val PRICE = "price"
    private const val PRICE_CENTS = "price_cents"
    private const val SALES = "sales"
    private const val SALE_ITEMS = "sale_items"
    private const val ORDERS = "orders"
    private const val ORDER_ITEMS = "order_items"
    private const val PUT = "PUT"
    private const val PATCH = "PATCH"
    private const val ITEMS_JSON = "items_json"
    private const val CLOSE_JSON = "close_json"
    private const val DELIVERY_JSON = "delivery_json"
    private const val BOOLEAN_PREFIX = "is_"

    // The other orders columns belong to the server (totals, dates, driver) and never go up.
    private val ORDER_WRITABLE = setOf("customer_name", "is_delivery", "delivery_address")
    private val TIMESTAMPS = setOf("sold_at", "printed_at")

    /** Stable across retries and unique per device: UUID v3 of `deviceId:clientId`. */
    fun opId(
        deviceId: String,
        clientId: Int,
    ): String = UUID.nameUUIDFromBytes("$deviceId:$clientId".toByteArray()).toString()

    /**
     * The op to upload, or null for what the server creates by itself (`sale_items`, and the
     * `order_items` the orders upload embeds). Throws [IllegalArgumentException] when the op's data
     * cannot be sent (a JSON column that is not valid, a boolean or a date out of format).
     */
    fun toJson(
        op: PendingOp,
        deviceId: String,
    ): JsonObject? {
        val data = dataOf(op) ?: return null
        return buildJsonObject {
            put("opId", opId(deviceId, op.clientId))
            put("op", op.op)
            put("table", op.table)
            put("id", op.id)
            put("data", data)
        }
    }

    private fun dataOf(op: PendingOp): JsonObject? {
        val values = op.data.orEmpty()
        return when (op.table) {
            SALE_ITEMS -> null
            ORDER_ITEMS -> orderItemData(op, values)
            ORDERS -> orderData(op, values)
            else ->
                buildJsonObject {
                    putColumns(op.table, values.filterKeys { it != ITEMS_JSON })
                    if (op.table == SALES && op.op == PUT) putItems(values, always = true)
                }
        }
    }

    /** Only a kitchen status change goes up; a quantity change travels in the orders `items`. */
    private fun orderItemData(
        op: PendingOp,
        values: Map<String, Any?>,
    ): JsonObject? {
        if (op.op != PATCH || "quantity" in values || "status" !in values) return null
        return buildJsonObject { put("status", values["status"].toJson()) }
    }

    private fun orderData(
        op: PendingOp,
        values: Map<String, Any?>,
    ): JsonObject {
        val close = values[CLOSE_JSON] as? String
        val delivery = values[DELIVERY_JSON] as? String
        require(close == null || delivery == null) { "an order op cannot close and change the delivery at once" }
        return buildJsonObject {
            when {
                op.op == PATCH && close != null -> put("close", ApiJson.parseToJsonElement(close))
                op.op == PATCH && delivery != null -> put("delivery", ApiJson.parseToJsonElement(delivery))
                op.op == PUT || op.op == PATCH -> {
                    putColumns(ORDERS, values.filterKeys { it in ORDER_WRITABLE })
                    putItems(values, always = op.op == PUT)
                }
            }
        }
    }

    private fun JsonObjectBuilder.putItems(
        values: Map<String, Any?>,
        always: Boolean,
    ) {
        val items = values[ITEMS_JSON] as? String
        if (items != null) {
            put("items", ApiJson.parseToJsonElement(items).jsonArray)
        } else if (always) {
            put("items", JsonArray(emptyList()))
        }
    }

    private fun JsonObjectBuilder.putColumns(
        table: String,
        values: Map<String, Any?>,
    ) {
        for ((key, value) in values) {
            if (table == PRODUCTS && key == PRICE) {
                // The database holds decimal text; the API takes integer cents.
                put(PRICE_CENTS, JsonPrimitive(value.toCents()))
                continue
            }
            put(
                key,
                when {
                    key.startsWith(BOOLEAN_PREFIX) -> value.toBoolean(key)
                    key in TIMESTAMPS -> value.toRfc3339(key)
                    else -> value.toJson()
                },
            )
        }
    }

    // SQLite keeps booleans as 0/1; anything else is a bug that must not reach the API as "true".
    private fun Any?.toBoolean(column: String): JsonElement =
        when (this) {
            null -> JsonNull
            true, 1, 1L, "1", "true" -> JsonPrimitive(true)
            false, 0, 0L, "0", "false" -> JsonPrimitive(false)
            else -> throw IllegalArgumentException("$column is not a boolean: $this")
        }

    private fun Any?.toCents(): Long =
        Money.parseDecimalToCents(this?.toString()) ?: throw IllegalArgumentException("price is not an amount: $this")

    private fun Any?.toRfc3339(column: String): JsonElement =
        when (this) {
            null -> JsonNull
            else ->
                JsonPrimitive(
                    DbTime.toRfc3339(toString()) ?: throw IllegalArgumentException("$column is not a date: $this"),
                )
        }

    private fun Any?.toJson(): JsonElement =
        when (this) {
            null -> JsonNull
            is Number -> JsonPrimitive(this)
            is Boolean -> JsonPrimitive(this)
            else -> JsonPrimitive(toString())
        }
}

/** Keeps the ops the server rejected. */
interface RejectionSink {
    /**
     * Must be durable when it returns: the caller then completes the batch, which deletes the op.
     * Recording an [opId] that is already kept must not add a second row.
     */
    suspend fun record(
        op: PendingOp,
        opId: String,
        result: UploadResult,
    )
}

/** Uploads a batch of the local queue and records its rejections. */
class UploadProcessor(
    private val api: SyncApi,
    private val sink: RejectionSink,
    private val deviceId: suspend () -> String,
) {
    /**
     * Uploads [ops] and records each rejected one in the [sink] before returning. An op whose data
     * cannot be sent is recorded as [LOCAL_INVALID_DATA] and left out, so it never blocks the queue.
     * Throws when the request fails; the caller then must not complete the batch, so the same ops
     * (and op ids) go again.
     */
    suspend fun process(ops: List<PendingOp>) {
        val device = deviceId()
        val uploads = mutableListOf<Pair<PendingOp, JsonObject>>()
        for (op in ops) {
            try {
                UploadMapper.toJson(op, device)?.let { uploads += op to it }
            } catch (e: IllegalArgumentException) {
                // Also covers SerializationException, a subclass.
                val opId = UploadMapper.opId(device, op.clientId)
                sink.record(op, opId, UploadResult(opId, REJECTED, LOCAL_INVALID_DATA, e.message ?: e.toString()))
            }
        }
        if (uploads.isEmpty()) return
        val response = api.upload(UploadRequest(device, uploads.map { it.second }))
        val byOpId = uploads.associate { (op, _) -> UploadMapper.opId(device, op.clientId) to op }
        for (result in response.results.filter { it.isRejection() }) {
            val op = byOpId[result.opId] ?: continue
            sink.record(op, result.opId, result)
        }
    }

    /** A duplicate carries the code of the original rejection, whose answer may have been lost. */
    private fun UploadResult.isRejection() = status == REJECTED || (status == DUPLICATE && code != null)

    companion object {
        /** Code of an op rejected on the device, before reaching the API. */
        const val LOCAL_INVALID_DATA = "LOCAL_INVALID_DATA"
        private const val REJECTED = "rejected"
        private const val DUPLICATE = "duplicate"
    }
}
