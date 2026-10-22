package uk.tozzo.app.core.data

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import uk.tozzo.app.domain.DbTime
import uk.tozzo.app.domain.ItemStatus
import uk.tozzo.app.domain.Money
import java.time.Instant
import javax.inject.Inject

data class OrderItemView(
    val id: String,
    val productId: String,
    val productName: String?,
    val quantity: Int,
    /** 0 when neither the item nor its product has a readable price. */
    val unitPriceCents: Long,
    val status: ItemStatus,
)

data class OrderView(
    val id: String,
    val customerName: String?,
    val isDelivery: Boolean,
    val deliveryAddress: String?,
    /** The delivery has started: the order can no longer be edited, deleted or have its items changed. */
    val delivering: Boolean,
    val openedAt: Instant?,
    val updatedAt: Instant?,
    /** Sum of `unit_price x quantity` of the local items, not the server's `total`. */
    val totalCents: Long,
    val sellerName: String?,
    val driverId: String?,
    val externalDriverName: String?,
    val externalDriverPhone: String?,
    val items: List<OrderItemView>,
    /** Name of the internal driver, when the `users` row is known. */
    val driverName: String? = null,
)

/** The filters of the list, as the user typed them; all optional, applied together. */
data class OrderFilter(
    val customer: String = "",
    val seller: String = "",
    val minCents: Long? = null,
    val maxCents: Long? = null,
)

private const val ORDER_CAP = 2000

// One row per item (an order without items still gives one row). The orders are capped in the sub-select,
// so the cap never cuts an order in the middle of its items.
private const val ORDERS_SQL =
    "SELECT o.id, o.customer_name, o.is_delivery, o.delivery_address, o.delivery_started_at, o.opened_at, " +
        "o.updated_at, o.driver_id, o.external_driver_name, o.external_driver_phone, u.name AS seller_name, " +
        "d.name AS driver_name, " +
        "i.id AS item_id, i.product_id AS item_product_id, i.quantity AS item_quantity, i.status AS item_status, " +
        "i.unit_price AS item_price, p.name AS product_name, p.price AS product_price " +
        "FROM orders o LEFT JOIN users u ON u.id = o.seller_id LEFT JOIN users d ON d.id = o.driver_id " +
        "LEFT JOIN order_items i ON i.order_id = o.id AND i.deleted_at IS NULL " +
        "LEFT JOIN products p ON p.id = i.product_id " +
        "WHERE o.id IN (SELECT id FROM orders WHERE is_open = 1 AND deleted_at IS NULL %s LIMIT ?) " +
        "ORDER BY o.id, i.id"

/** Open orders of the local database, with their items. */
class OrderRepository
    @Inject
    constructor(
        private val sql: LocalSql,
    ) {
        /** Open, not deleted, newest updated first; items not deleted. */
        fun openOrders(filter: OrderFilter): Flow<List<OrderView>> {
            val customer = foldForSearch(filter.customer)
            val seller = foldForSearch(filter.seller)
            return sql
                .watch(ORDERS_SQL.format(""), listOf(ORDER_CAP), ::toRow)
                .map { rows ->
                    group(rows)
                        .filter { customer.isEmpty() || foldForSearch(it.customerName.orEmpty()).contains(customer) }
                        .filter { seller.isEmpty() || foldForSearch(it.sellerName.orEmpty()).contains(seller) }
                        .filter { filter.minCents == null || it.totalCents >= filter.minCents }
                        .filter { filter.maxCents == null || it.totalCents <= filter.maxCents }
                        .sortedWith(
                            compareByDescending<OrderView> { it.updatedAt ?: it.openedAt ?: Instant.EPOCH }
                                .thenBy { it.id },
                        )
                }
        }

        /** The order while it is open and not deleted; null once it is closed, deleted or gone. */
        fun order(id: String): Flow<OrderView?> =
            sql
                .watch(ORDERS_SQL.format("AND id = ?"), listOf(id, ORDER_CAP), ::toRow)
                .map { group(it).firstOrNull() }

        /** Open delivery orders (waiting and out for delivery), oldest first. */
        internal fun deliveryOrders(): Flow<List<OrderView>> =
            sql
                .watch(ORDERS_SQL.format("AND is_delivery = 1"), listOf(ORDER_CAP), ::toRow)
                .map { rows ->
                    group(rows).sortedWith(compareBy<OrderView> { it.openedAt ?: Instant.EPOCH }.thenBy { it.id })
                }

        private fun group(rows: List<Row>): List<OrderView> =
            rows.groupBy { it.id }.values.map { group ->
                val head = group.first()
                val items =
                    group.mapNotNull { row ->
                        row.itemId?.let {
                            val price =
                                Money.parseDecimalToCents(row.itemPrice)
                                    ?: Money.parseDecimalToCents(row.productPrice)
                                    ?: 0L
                            OrderItemView(
                                id = it,
                                productId = row.itemProductId.orEmpty(),
                                productName = row.productName,
                                quantity = row.itemQuantity,
                                unitPriceCents = price,
                                status = ItemStatus.parse(row.itemStatus),
                            )
                        }
                    }
                OrderView(
                    id = head.id,
                    customerName = head.customer?.takeIf { it.isNotBlank() },
                    isDelivery = head.isDelivery,
                    deliveryAddress = head.address,
                    delivering = !head.deliveryStartedAt.isNullOrBlank(),
                    openedAt = DbTime.parse(head.openedAt),
                    updatedAt = DbTime.parse(head.updatedAt),
                    totalCents = items.sumOf { it.unitPriceCents * it.quantity },
                    sellerName = head.sellerName,
                    driverId = head.driverId,
                    externalDriverName = head.externalDriverName,
                    externalDriverPhone = head.externalDriverPhone,
                    items = items,
                    driverName = head.driverName,
                )
            }

        private fun toRow(row: SqlRow) =
            Row(
                id = row.string("id").orEmpty(),
                customer = row.string("customer_name"),
                isDelivery = row.long("is_delivery") == 1L,
                address = row.string("delivery_address"),
                deliveryStartedAt = row.string("delivery_started_at"),
                openedAt = row.string("opened_at"),
                updatedAt = row.string("updated_at"),
                driverId = row.string("driver_id"),
                externalDriverName = row.string("external_driver_name"),
                externalDriverPhone = row.string("external_driver_phone"),
                sellerName = row.string("seller_name"),
                driverName = row.string("driver_name"),
                itemId = row.string("item_id"),
                itemProductId = row.string("item_product_id"),
                itemQuantity = row.long("item_quantity")?.toInt() ?: 0,
                itemStatus = row.string("item_status"),
                itemPrice = row.string("item_price"),
                productName = row.string("product_name"),
                productPrice = row.string("product_price"),
            )

        @Suppress("LongParameterList")
        private class Row(
            val id: String,
            val customer: String?,
            val isDelivery: Boolean,
            val address: String?,
            val deliveryStartedAt: String?,
            val openedAt: String?,
            val updatedAt: String?,
            val driverId: String?,
            val externalDriverName: String?,
            val externalDriverPhone: String?,
            val sellerName: String?,
            val driverName: String?,
            val itemId: String?,
            val itemProductId: String?,
            val itemQuantity: Int,
            val itemStatus: String?,
            val itemPrice: String?,
            val productName: String?,
            val productPrice: String?,
        )
    }
