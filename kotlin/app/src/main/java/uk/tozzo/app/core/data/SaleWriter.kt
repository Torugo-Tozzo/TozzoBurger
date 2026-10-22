package uk.tozzo.app.core.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import uk.tozzo.app.core.session.DeviceBinding
import uk.tozzo.app.domain.DbTime
import uk.tozzo.app.domain.Money
import uk.tozzo.app.domain.PaymentMethod
import java.time.Clock
import java.util.UUID
import javax.inject.Inject

/** A line of the counter's cart: the name and price are the ones the user saw when adding it. */
@Serializable
data class CartLine(
    val productId: String,
    val name: String,
    val unitPriceCents: Long,
    val quantity: Int,
)

fun List<CartLine>.totalCents(): Long = sumOf { it.unitPriceCents * it.quantity }

/** The user bound to this device; a write without one is a bug (the app is signed out). */
internal fun DeviceBinding.requireUserId(): String =
    checkNotNull(current.value) { "no user bound to this device" }.userId

internal fun String?.trimmedOrNull(): String? = this?.trim()?.takeIf { it.isNotEmpty() }

/** Writes direct sales to the local database; the upload turns the `sales` PUT into `POST /v1/sync/upload`. */
class SaleWriter
    @Inject
    constructor(
        private val sql: LocalSql,
        private val binding: DeviceBinding,
        private val clock: Clock,
    ) {
        /**
         * One transaction: the `sales` row (total, `sold_at` now, customer, payment, seller, `items_json` with
         * the cents the API takes) and its `sale_items` rows. Returns the id of the sale.
         */
        suspend fun createSale(
            lines: List<CartLine>,
            customerName: String?,
            payment: PaymentMethod?,
        ): String {
            require(lines.isNotEmpty()) { "a sale needs at least one item" }
            val id = UUID.randomUUID().toString()
            val items =
                buildJsonArray {
                    lines.forEach {
                        add(
                            buildJsonObject {
                                put("product_id", it.productId)
                                put("quantity", it.quantity)
                                put("unit_price_cents", it.unitPriceCents)
                            },
                        )
                    }
                }.toString()
            val sellerId = binding.requireUserId()
            sql.writeTransaction { tx ->
                tx.execute(
                    "INSERT INTO sales (id, total, sold_at, customer_name, is_cancelled, payment_method, seller_id, " +
                        "items_json) VALUES (?, ?, ?, ?, 0, ?, ?, ?)",
                    listOf(
                        id,
                        Money.centsToDecimal(lines.totalCents()),
                        DbTime.format(clock.instant()),
                        customerName.trimmedOrNull(),
                        payment?.name,
                        sellerId,
                        items,
                    ),
                )
                lines.forEach {
                    tx.execute(
                        "INSERT INTO sale_items (id, sale_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?, ?)",
                        listOf(
                            UUID.randomUUID().toString(),
                            id,
                            it.productId,
                            it.quantity,
                            Money.centsToDecimal(it.unitPriceCents),
                        ),
                    )
                }
            }
            return id
        }

        suspend fun cancelSale(id: String) = sql.execute("UPDATE sales SET is_cancelled = 1 WHERE id = ?", listOf(id))
    }
