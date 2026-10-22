package uk.tozzo.app.core.data

import kotlinx.serialization.json.JsonObjectBuilder
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import uk.tozzo.app.core.session.DeviceBinding
import uk.tozzo.app.domain.DbTime
import uk.tozzo.app.domain.ItemStatus
import uk.tozzo.app.domain.Money
import uk.tozzo.app.domain.PaymentMethod
import java.time.Clock
import java.util.UUID
import javax.inject.Inject

/** The API refuses a delivery address longer than this. */
const val MAX_DELIVERY_ADDRESS = 500

/** The API takes quantities from 1 to this. */
private const val MAX_LINE_QUANTITY = 10_000

/**
 * A line of the order being edited. An existing item keeps its [id]; a new line has the id the caller made
 * for it, or a blank one that gets a fresh UUID. The price is only used for the total and for the row of a new item.
 */
data class EditLine(
    val id: String,
    val productId: String,
    val name: String,
    val unitPriceCents: Long,
    val quantity: Int,
)

/** The API refuses a driver name or phone longer than these. */
private const val MAX_DRIVER_NAME = 120
private const val MAX_DRIVER_PHONE = 40

/** Why a delivery action is refused locally, the way the server would refuse it. */
enum class DeliveryRefusal {
    /** Items not READY or DELIVERED and not confirmed, or no items (ORDER_NOT_READY). */
    NOT_READY,

    /** The driver is out with another order, or is not a driver (DRIVER_BUSY, DRIVER_NOT_FOUND). */
    DRIVER_BUSY,

    /** The order is gone, closed, not a delivery, or in the wrong stage for the action. */
    CONFLICT,
}

class DeliveryRefused(
    val reason: DeliveryRefusal,
    message: String,
) : IllegalStateException(message)

private data class DeliveryState(
    val isOpen: Boolean,
    val isDelivery: Boolean,
    val started: Boolean,
    val driverId: String?,
)

private data class OrderState(
    val isOpen: Boolean,
    val isDelivery: Boolean,
    val delivering: Boolean,
    val customer: String,
    val address: String?,
)

private data class StoredItem(
    val id: String,
    val productId: String,
    val quantity: Int,
    val priceCents: Long,
)

/** What the user changed in the lines of an order against the lines the screen loaded. */
private data class LineEdit(
    val added: List<EditLine>,
    val removed: Set<String>,
    /** The new quantity of each loaded line whose quantity the user changed. */
    val quantities: Map<String, Int>,
) {
    fun isEmpty() = added.isEmpty() && removed.isEmpty() && quantities.isEmpty()

    companion object {
        fun of(
            snapshot: List<EditLine>,
            lines: List<EditLine>,
        ): LineEdit {
            val before = snapshot.associate { it.id to it.quantity }
            return LineEdit(
                added = lines.filterNot { it.id in before },
                removed = before.keys - lines.map { it.id }.toSet(),
                quantities =
                    lines
                        .filter { it.id in before && before[it.id] != it.quantity }
                        .associate { it.id to it.quantity },
            )
        }
    }
}

/** Writes orders (comandas) and their delivery actions to the local database. */
@Suppress("TooManyFunctions")
class OrderWriter
    @Inject
    constructor(
        private val sql: LocalSql,
        private val binding: DeviceBinding,
        private val clock: Clock,
    ) {
        /**
         * One transaction: the open `orders` row (`opened_at` and `updated_at` now, total, seller, `items_json`
         * with the device ids) and its `order_items` rows (IN_PREPARATION) under those same ids, so the server
         * creates the items with the ids the device already holds. Returns the id of the order.
         *
         * @throws IllegalArgumentException when there is no item, or a delivery has no address or one over 500.
         */
        suspend fun createOrder(
            lines: List<CartLine>,
            customerName: String?,
            isDelivery: Boolean,
            deliveryAddress: String?,
        ): String {
            require(lines.isNotEmpty()) { "an order needs at least one item" }
            val address = if (isDelivery) deliveryAddress.trimmedOrNull() else null
            require(!isDelivery || address != null) { "a delivery needs an address" }
            require(address == null || address.length <= MAX_DELIVERY_ADDRESS) { "the address is too long" }
            val id = UUID.randomUUID().toString()
            val itemIds = lines.map { UUID.randomUUID().toString() }
            val items =
                itemsJson(
                    lines.mapIndexed {
                        index,
                        line,
                        ->
                        Triple(itemIds[index], line.productId, line.quantity)
                    },
                )
            val now = DbTime.format(clock.instant())
            val sellerId = binding.requireUserId()
            sql.writeTransaction { tx ->
                tx.execute(
                    "INSERT INTO orders (id, customer_name, is_open, is_delivery, delivery_address, opened_at, " +
                        "updated_at, total, seller_id, items_json) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?)",
                    listOf(
                        id,
                        customerName.trimmedOrNull(),
                        if (isDelivery) 1 else 0,
                        address,
                        now,
                        now,
                        Money.centsToDecimal(lines.totalCents()),
                        sellerId,
                        items,
                    ),
                )
                lines.forEachIndexed { index, line ->
                    tx.execute(
                        "INSERT INTO order_items (id, order_id, product_id, quantity, status, unit_price) " +
                            "VALUES (?, ?, ?, ?, ?, ?)",
                        listOf(
                            itemIds[index],
                            id,
                            line.productId,
                            line.quantity,
                            ItemStatus.IN_PREPARATION.name,
                            Money.centsToDecimal(line.unitPriceCents),
                        ),
                    )
                }
            }
            return id
        }

        /**
         * Saves the edit of an open order that is not out for delivery, in one transaction. The items are a diff
         * of [lines] against [snapshot] (the items as the screen loaded them): the lines the user added, removed
         * or whose quantity they changed are applied to the items stored now, so an item another device added
         * meanwhile stays and one it removed is not inserted again (a quantity change on it is dropped). A
         * changed quantity sends the item back to preparation (IN_PREPARATION, `kitchen_ready_at` cleared, as
         * on the server). `items_json` (the complete list now stored) and `order_items` are written only when
         * the user changed a line; the customer and delivery only when they changed. A save that changes
         * nothing writes nothing, so no empty op is queued.
         *
         * @throws IllegalArgumentException for a delivery without address, an address over 500 or a quantity
         * outside 1..10000.
         * @throws IllegalStateException when the order is closed, gone or out for delivery.
         */
        @Suppress("LongParameterList")
        suspend fun updateOrder(
            id: String,
            customerName: String?,
            isDelivery: Boolean,
            deliveryAddress: String?,
            snapshot: List<EditLine>,
            lines: List<EditLine>,
        ) {
            val address = if (isDelivery) deliveryAddress.trimmedOrNull() else null
            require(!isDelivery || address != null) { "a delivery needs an address" }
            require(address == null || address.length <= MAX_DELIVERY_ADDRESS) { "the address is too long" }
            require(lines.all { it.quantity in 1..MAX_LINE_QUANTITY }) { "a quantity must be from 1 to 10000" }
            val state = editableState(id)
            val edit = LineEdit.of(snapshot, lines.map { if (it.id.isBlank()) it.copy(id = newId()) else it })
            val customer = customerName?.trim().orEmpty()
            val orderChanged = customer != state.customer || isDelivery != state.isDelivery || address != state.address
            if (edit.isEmpty() && !orderChanged) return
            val now = DbTime.format(clock.instant())
            sql.writeTransaction { tx ->
                // Only what changed is written, so the queued op carries only that.
                val sets = mutableListOf("updated_at = ?")
                val params = mutableListOf<Any?>(now)
                if (orderChanged) {
                    sets += listOf("customer_name = ?", "is_delivery = ?", "delivery_address = ?")
                    params.addAll(listOf(customer, if (isDelivery) 1 else 0, address))
                }
                if (!edit.isEmpty()) {
                    val items = writeItems(tx, id, edit)
                    sets += listOf("total = ?", "items_json = ?")
                    params.add(Money.centsToDecimal(items.sumOf { it.priceCents * it.quantity }))
                    params.add(itemsJson(items.map { Triple(it.id, it.productId, it.quantity) }))
                }
                tx.execute("UPDATE orders SET ${sets.joinToString()} WHERE id = ?", params + id)
            }
        }

        /**
         * Applies [edit] to the items stored now: deletes the removed ones, resets those whose quantity
         * changed and inserts the new ones. Returns the items of the order afterwards (the stored ones by id,
         * then the new ones).
         */
        private suspend fun writeItems(
            tx: SqlTx,
            orderId: String,
            edit: LineEdit,
        ): List<StoredItem> {
            val stored =
                tx.getAll(
                    "SELECT i.id, i.product_id, i.quantity, i.unit_price, p.price AS product_price " +
                        "FROM order_items i LEFT JOIN products p ON p.id = i.product_id " +
                        "WHERE i.order_id = ? AND i.deleted_at IS NULL ORDER BY i.id",
                    listOf(orderId),
                ) {
                    StoredItem(
                        id = it.string("id").orEmpty(),
                        productId = it.string("product_id").orEmpty(),
                        quantity = it.long("quantity")?.toInt() ?: 0,
                        // As the order screens price it.
                        priceCents =
                            Money.parseDecimalToCents(it.string("unit_price"))
                                ?: Money.parseDecimalToCents(it.string("product_price"))
                                ?: 0L,
                    )
                }
            val kept = mutableListOf<StoredItem>()
            for (item in stored) {
                val quantity = edit.quantities[item.id]
                when {
                    item.id in edit.removed -> tx.execute("DELETE FROM order_items WHERE id = ?", listOf(item.id))
                    quantity != null && quantity != item.quantity -> {
                        tx.execute(
                            "UPDATE order_items SET quantity = ?, status = ?, kitchen_ready_at = NULL WHERE id = ?",
                            listOf(quantity, ItemStatus.IN_PREPARATION.name, item.id),
                        )
                        kept += item.copy(quantity = quantity)
                    }
                    else -> kept += item
                }
            }
            val storedIds = stored.map { it.id }.toSet()
            edit.added.filterNot { it.id in storedIds }.forEach { line ->
                tx.execute(
                    "INSERT INTO order_items (id, order_id, product_id, quantity, status, unit_price) " +
                        "VALUES (?, ?, ?, ?, ?, ?)",
                    listOf(
                        line.id,
                        orderId,
                        line.productId,
                        line.quantity,
                        ItemStatus.IN_PREPARATION.name,
                        Money.centsToDecimal(line.unitPriceCents),
                    ),
                )
                kept += StoredItem(line.id, line.productId, line.quantity, line.unitPriceCents)
            }
            return kept
        }

        /** The kitchen status of one item, written at once; the upload sends `{status}` of the `order_items` row. */
        suspend fun setItemStatus(
            itemId: String,
            status: ItemStatus,
        ) = setItemsStatus(listOf(itemId), status)

        /**
         * The kitchen status of every item in [ids], in one transaction, under the same guard as [setItemStatus]
         * (each item exists and its order is open and not out for delivery); nothing is written otherwise.
         * Back to IN_PREPARATION also clears the local `kitchen_ready_at`, as the server does, so the card
         * leaves "Pronto". The upload still sends only `{status}`.
         */
        suspend fun setItemsStatus(
            ids: List<String>,
            status: ItemStatus,
        ) {
            if (ids.isEmpty()) return
            val orderIds =
                ids.map { itemId ->
                    sql
                        .getAll(
                            "SELECT order_id FROM order_items WHERE id = ? AND deleted_at IS NULL",
                            listOf(itemId),
                        ) {
                            it.string("order_id")
                        }.firstOrNull()
                        .also { checkNotNull(it) { "the item does not exist" } }
                }
            orderIds.filterNotNull().distinct().forEach { editableState(it) }
            val clearReady = if (status == ItemStatus.IN_PREPARATION) ", kitchen_ready_at = NULL" else ""
            sql.writeTransaction { tx ->
                ids.forEach {
                    tx.execute(
                        "UPDATE order_items SET status = ?$clearReady WHERE id = ?",
                        listOf(status.name, it),
                    )
                }
            }
        }

        /**
         * Closes the order into a sale: `is_open` 0 and `close_json` (`{"payment_method":"PIX"}`, or `{}`
         * without payment), which the upload sends alone as the close. As on the server, the order must be open
         * and a delivery order closes only while out for delivery (a waiting one is refused).
         */
        suspend fun closeOrder(
            id: String,
            payment: PaymentMethod?,
        ) {
            val state = deliveryState(id)
            check(state.isOpen) { "the order is closed" }
            check(state.isDelivery == state.started) {
                if (state.isDelivery) "the delivery has not started" else "the order is out for delivery"
            }
            val close =
                buildJsonObject { payment?.let { put("payment_method", it.name) } }.toString()
            sql.execute(
                "UPDATE orders SET is_open = 0, close_json = ?, updated_at = ? WHERE id = ?",
                listOf(close, DbTime.format(clock.instant()), id),
            )
        }

        /**
         * Gives the order an internal driver, who must be a DRIVER with no other order out for delivery. Writes
         * `delivery_json` (the only thing the upload sends) and the visible driver columns, in one transaction.
         *
         * @throws DeliveryRefused when the order cannot take it or the driver is busy.
         */
        suspend fun assignDriver(
            orderId: String,
            driverId: String,
        ) {
            requireNotStarted(orderId)
            checkDriverIsDriver(driverId)
            checkDriverFree(driverId, orderId)
            writeDelivery(orderId, deliveryJson("ASSIGN") { put("driver_id", driverId) }, driverId, null, null)
        }

        /**
         * Gives the order an external driver: a name of 1..120 characters and an optional phone of up to 40.
         *
         * @throws IllegalArgumentException for a blank name or a name or phone over the limit.
         * @throws DeliveryRefused when the delivery already left.
         */
        suspend fun assignExternal(
            orderId: String,
            name: String,
            phone: String?,
        ) {
            val cleanName = name.trim()
            val cleanPhone = phone.trimmedOrNull()
            require(cleanName.isNotEmpty()) { "the driver needs a name" }
            require(cleanName.length <= MAX_DRIVER_NAME) { "the driver name is too long" }
            require(cleanPhone == null || cleanPhone.length <= MAX_DRIVER_PHONE) { "the driver phone is too long" }
            requireNotStarted(orderId)
            val json =
                deliveryJson("ASSIGN") {
                    put("external_driver_name", cleanName)
                    cleanPhone?.let { put("external_driver_phone", it) }
                }
            writeDelivery(orderId, json, null, cleanName, cleanPhone)
        }

        /** Removes the driver, internal or external; only before the delivery leaves. */
        suspend fun unassign(orderId: String) {
            requireNotStarted(orderId)
            writeDelivery(orderId, deliveryJson("UNASSIGN"), null, null, null)
        }

        /**
         * Sends the order out: `delivery_started_at` now. Only `orders` is written: the server marks the pending
         * items READY and the download brings that (an `order_items` PATCH from a DRIVER would be refused).
         *
         * @throws DeliveryRefused when the order has no item, an item is not ready and [confirmReady] is false,
         * the assigned driver is busy, or the delivery already left.
         */
        suspend fun startDelivery(
            orderId: String,
            confirmReady: Boolean,
        ) {
            val state = requireNotStarted(orderId)
            val statuses =
                sql.getAll(
                    "SELECT status FROM order_items WHERE order_id = ? AND deleted_at IS NULL",
                    listOf(orderId),
                ) { ItemStatus.parse(it.string("status")) }
            val pending = statuses.any { it != ItemStatus.READY && it != ItemStatus.DELIVERED }
            if (statuses.isEmpty() || (pending && !confirmReady)) {
                throw DeliveryRefused(DeliveryRefusal.NOT_READY, "the items are not ready")
            }
            state.driverId?.let { checkDriverFree(it, orderId) }
            val json =
                deliveryJson("START") { if (pending) put("confirm_ready", true) }
            val now = DbTime.format(clock.instant())
            sql.execute(
                "UPDATE orders SET delivery_json = ?, delivery_started_at = ?, updated_at = ? WHERE id = ?",
                listOf(json, now, now, orderId),
            )
        }

        /** Brings the order back to waiting; only while it is out for delivery. */
        suspend fun waitDelivery(orderId: String) {
            val state = deliveryState(orderId)
            requireDeliverable(state)
            if (!state.started) throw DeliveryRefused(DeliveryRefusal.CONFLICT, "the delivery has not started")
            sql.execute(
                "UPDATE orders SET delivery_json = ?, delivery_started_at = NULL, updated_at = ? WHERE id = ?",
                listOf(deliveryJson("WAIT"), DbTime.format(clock.instant()), orderId),
            )
        }

        /** Deletes the order and its items; the upload sends a DELETE of the order (the items' are skipped). */
        suspend fun deleteOrder(id: String) {
            editableState(id)
            sql.writeTransaction { tx ->
                tx.execute("DELETE FROM order_items WHERE order_id = ?", listOf(id))
                tx.execute("DELETE FROM orders WHERE id = ?", listOf(id))
            }
        }

        private suspend fun editableState(id: String): OrderState {
            val state =
                sql
                    .getAll(
                        "SELECT customer_name, is_open, is_delivery, delivery_address, delivery_started_at " +
                            "FROM orders WHERE id = ? AND deleted_at IS NULL",
                        listOf(id),
                    ) {
                        OrderState(
                            isOpen = it.long("is_open") == 1L,
                            isDelivery = it.long("is_delivery") == 1L,
                            delivering = !it.string("delivery_started_at").isNullOrBlank(),
                            customer = it.string("customer_name").orEmpty().trim(),
                            address = it.string("delivery_address").trimmedOrNull(),
                        )
                    }.firstOrNull()
            checkNotNull(state) { "the order does not exist" }
            check(state.isOpen) { "the order is closed" }
            check(!state.delivering) { "the order is out for delivery" }
            return state
        }

        private suspend fun deliveryState(id: String): DeliveryState {
            val state =
                sql
                    .getAll(
                        "SELECT is_open, is_delivery, delivery_started_at, driver_id " +
                            "FROM orders WHERE id = ? AND deleted_at IS NULL",
                        listOf(id),
                    ) {
                        DeliveryState(
                            isOpen = it.long("is_open") == 1L,
                            isDelivery = it.long("is_delivery") == 1L,
                            started = !it.string("delivery_started_at").isNullOrBlank(),
                            driverId = it.string("driver_id")?.takeIf { driver -> driver.isNotBlank() },
                        )
                    }.firstOrNull()
            return state ?: throw DeliveryRefused(DeliveryRefusal.CONFLICT, "the order does not exist")
        }

        private fun requireDeliverable(state: DeliveryState) {
            if (!state.isOpen || !state.isDelivery) {
                throw DeliveryRefused(DeliveryRefusal.CONFLICT, "the order is closed or not a delivery")
            }
        }

        private suspend fun requireNotStarted(orderId: String): DeliveryState {
            val state = deliveryState(orderId)
            requireDeliverable(state)
            if (state.started) throw DeliveryRefused(DeliveryRefusal.CONFLICT, "the delivery already started")
            return state
        }

        // Only a manager role syncs `users`, so the role lookup belongs to assigning; a START from a DRIVER
        // device has no users row and the server decides.
        private suspend fun checkDriverIsDriver(driverId: String) {
            val isDriver =
                sql
                    .getAll("SELECT 1 AS x FROM users WHERE id = ? AND role = 'DRIVER'", listOf(driverId)) {
                        it.long("x")
                    }.isNotEmpty()
            if (!isDriver) throw DeliveryRefused(DeliveryRefusal.DRIVER_BUSY, "the user is not a driver")
        }

        // No other open order of the driver may be out for delivery (the orders table is enough).
        private suspend fun checkDriverFree(
            driverId: String,
            orderId: String,
        ) {
            val busy =
                sql
                    .getAll(
                        "SELECT 1 AS x FROM orders WHERE driver_id = ? AND id <> ? AND is_open = 1 " +
                            "AND deleted_at IS NULL AND delivery_started_at IS NOT NULL AND delivery_started_at <> ''",
                        listOf(driverId, orderId),
                    ) { it.long("x") }
                    .isNotEmpty()
            if (busy) throw DeliveryRefused(DeliveryRefusal.DRIVER_BUSY, "the driver is out with another order")
        }

        private fun deliveryJson(
            action: String,
            extra: JsonObjectBuilder.() -> Unit = {},
        ): String =
            buildJsonObject {
                put("action", action)
                extra()
            }.toString()

        // The upload sends only `delivery_json`; the driver columns are for the screen until the download.
        private suspend fun writeDelivery(
            orderId: String,
            json: String,
            driverId: String?,
            externalName: String?,
            externalPhone: String?,
        ) {
            sql.writeTransaction { tx ->
                tx.execute(
                    "UPDATE orders SET delivery_json = ?, driver_id = ?, external_driver_name = ?, " +
                        "external_driver_phone = ?, updated_at = ? WHERE id = ?",
                    listOf(
                        json,
                        driverId,
                        externalName,
                        externalPhone,
                        DbTime.format(clock.instant()),
                        orderId,
                    ),
                )
            }
        }

        private fun newId() = UUID.randomUUID().toString()

        /** The complete item list the orders upload sends: `id`, `product_id` and `quantity` of each. */
        private fun itemsJson(items: List<Triple<String, String, Int>>): String =
            buildJsonArray {
                items.forEach { (id, productId, quantity) ->
                    add(
                        buildJsonObject {
                            put("id", id)
                            put("product_id", productId)
                            put("quantity", quantity)
                        },
                    )
                }
            }.toString()
    }
