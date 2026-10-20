package uk.tozzo.app.core.sync

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.put
import uk.tozzo.app.core.network.ApiJson
import uk.tozzo.app.core.network.SyncApi
import uk.tozzo.app.core.network.UploadRequest
import uk.tozzo.app.core.network.UploadResult
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
    private const val SALES = "sales"
    private const val SALE_ITEMS = "sale_items"
    private const val ITEMS_JSON = "items_json"
    private const val BOOLEAN_PREFIX = "is_"

    /** Stable across retries and unique per device: UUID v3 of `deviceId:clientId`. */
    fun opId(
        deviceId: String,
        clientId: Int,
    ): String = UUID.nameUUIDFromBytes("$deviceId:$clientId".toByteArray()).toString()

    /** The op to upload, or null for `sale_items` (the server creates them from the sales PUT). */
    fun toJson(
        op: PendingOp,
        deviceId: String,
    ): JsonObject? {
        if (op.table == SALE_ITEMS) return null
        val values = op.data.orEmpty()
        val data =
            buildJsonObject {
                for ((key, value) in values) {
                    if (key == ITEMS_JSON) continue
                    // SQLite keeps booleans as 0/1; the is_* columns are the booleans of the schema.
                    val isBoolean = key.startsWith(BOOLEAN_PREFIX) && value != null
                    put(key, if (isBoolean) JsonPrimitive(value.toString() != "0") else value.toJson())
                }
                if (op.table == SALES && op.op == "PUT") {
                    val items = values[ITEMS_JSON] as? String
                    put("items", items?.let { ApiJson.parseToJsonElement(it).jsonArray } ?: JsonArray(emptyList()))
                }
            }
        return buildJsonObject {
            put("opId", opId(deviceId, op.clientId))
            put("op", op.op)
            put("table", op.table)
            put("id", op.id)
            put("data", data)
        }
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
    /** Must be durable when it returns: the caller then completes the batch, which deletes the op. */
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
     * Uploads [ops] and records each rejected one in the [sink] before returning. Throws when the
     * request fails; the caller then must not complete the batch, so the same ops (and op ids) go again.
     */
    suspend fun process(ops: List<PendingOp>) {
        val device = deviceId()
        val uploads = ops.mapNotNull { op -> UploadMapper.toJson(op, device)?.let { op to it } }
        if (uploads.isEmpty()) return
        val response = api.upload(UploadRequest(device, uploads.map { it.second }))
        val byOpId = uploads.associate { (op, _) -> UploadMapper.opId(device, op.clientId) to op }
        for (result in response.results.filter { it.status == REJECTED }) {
            val op = byOpId[result.opId] ?: continue
            sink.record(op, result.opId, result)
        }
    }

    private companion object {
        const val REJECTED = "rejected"
    }
}
