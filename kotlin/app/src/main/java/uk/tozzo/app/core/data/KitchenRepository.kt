package uk.tozzo.app.core.data

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import uk.tozzo.app.domain.DbTime
import uk.tozzo.app.domain.ItemStatus
import uk.tozzo.app.domain.KitchenStage
import java.time.Instant
import javax.inject.Inject

/** Items of one product and stage in one order, merged into the card the cook moves at once. */
data class KitchenCard(
    val orderId: String,
    val customerName: String?,
    val openedAt: Instant?,
    val productId: String,
    val productName: String?,
    val quantity: Int,
    val stage: KitchenStage,
    val itemIds: List<String>,
)

private const val KITCHEN_CAP = 5000

// Open orders not out for delivery, oldest first; the cap is on item rows.
private const val KITCHEN_SQL =
    "SELECT o.id, o.customer_name, o.opened_at, i.id AS item_id, i.product_id, i.quantity, i.status, " +
        "i.kitchen_ready_at, p.name AS product_name " +
        "FROM orders o JOIN order_items i ON i.order_id = o.id AND i.deleted_at IS NULL " +
        "LEFT JOIN products p ON p.id = i.product_id " +
        "WHERE o.is_open = 1 AND o.deleted_at IS NULL " +
        "AND (o.delivery_started_at IS NULL OR o.delivery_started_at = '') " +
        "ORDER BY julianday(o.opened_at), o.id, i.id LIMIT ?"

/** The kitchen board read from the local database. */
class KitchenRepository
    @Inject
    constructor(
        private val sql: LocalSql,
    ) {
        /**
         * Open orders not out for delivery, oldest first; items IN_PREPARATION/REQUESTED or READY merged per
         * order + product + stage (DELIVERED left out). Both stages are always present.
         */
        fun board(): Flow<Map<KitchenStage, List<KitchenCard>>> =
            sql.watch(KITCHEN_SQL, listOf(KITCHEN_CAP), ::toRow).map { rows ->
                val cards =
                    rows
                        .mapNotNull { row ->
                            val status = ItemStatus.parse(row.status)
                            if (status == ItemStatus.DELIVERED) null else row to KitchenStage.of(status, row.readyAt)
                        }.groupBy { (row, stage) -> Triple(row.orderId, row.productId, stage) }
                        .map { (key, group) ->
                            val head = group.first().first
                            KitchenCard(
                                orderId = key.first,
                                customerName = head.customer?.trim()?.takeIf { it.isNotEmpty() },
                                openedAt = DbTime.parse(head.openedAt),
                                productId = key.second,
                                productName = head.productName,
                                quantity = group.sumOf { it.first.quantity },
                                stage = key.third,
                                itemIds = group.map { it.first.itemId },
                            )
                        }
                KitchenStage.entries.associateWith { stage -> cards.filter { it.stage == stage } }
            }

        private fun toRow(row: SqlRow) =
            Row(
                orderId = row.string("id").orEmpty(),
                customer = row.string("customer_name"),
                openedAt = row.string("opened_at"),
                itemId = row.string("item_id").orEmpty(),
                productId = row.string("product_id").orEmpty(),
                quantity = row.long("quantity")?.toInt() ?: 0,
                status = row.string("status"),
                readyAt = row.string("kitchen_ready_at"),
                productName = row.string("product_name"),
            )

        private class Row(
            val orderId: String,
            val customer: String?,
            val openedAt: String?,
            val itemId: String,
            val productId: String,
            val quantity: Int,
            val status: String?,
            val readyAt: String?,
            val productName: String?,
        )
    }
