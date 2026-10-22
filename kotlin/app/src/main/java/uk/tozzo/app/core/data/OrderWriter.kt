package uk.tozzo.app.core.data

import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import uk.tozzo.app.core.session.DeviceBinding
import uk.tozzo.app.domain.DbTime
import uk.tozzo.app.domain.ItemStatus
import uk.tozzo.app.domain.Money
import java.time.Clock
import java.util.UUID
import javax.inject.Inject

/** The API refuses a delivery address longer than this. */
const val MAX_DELIVERY_ADDRESS = 500

/** Writes orders (comandas) to the local database. */
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
                buildJsonArray {
                    lines.forEachIndexed { index, line ->
                        add(
                            buildJsonObject {
                                put("id", itemIds[index])
                                put("product_id", line.productId)
                                put("quantity", line.quantity)
                            },
                        )
                    }
                }.toString()
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
    }
