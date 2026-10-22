package uk.tozzo.app.core.data

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import uk.tozzo.app.domain.DbTime
import uk.tozzo.app.domain.Money
import uk.tozzo.app.domain.PaymentMethod
import java.time.Instant
import javax.inject.Inject

/** [from] and [to] are instants (inclusive); [to] null means no upper limit, so new sales keep appearing. */
data class SaleFilter(
    val from: Instant,
    val to: Instant? = null,
    val customer: String = "",
    val seller: String = "",
    val minCents: Long? = null,
    val maxCents: Long? = null,
)

data class SaleLineView(
    val productName: String?,
    val quantity: Int,
    /** The price of the sale, never the current price of the product. */
    val unitPriceCents: Long,
)

data class SaleView(
    val id: String,
    val soldAt: Instant?,
    val customerName: String?,
    val sellerName: String?,
    val payment: PaymentMethod?,
    val totalCents: Long,
    val isCancelled: Boolean,
    val lines: List<SaleLineView>,
)

data class SalesSummary(
    val count: Int,
    val totalCents: Long,
)

// `sold_at` is UTC text, `YYYY-MM-DD hh:mm:ss.sss` from the sync and from the device (`DbTime`), but an ISO
// form with `T` or `Z` also reads: `julianday` turns every one of them into an instant, so the period compares
// instants and never the text (nor a local date).
private const val SOLD_AT = "julianday(s.sold_at)"

// The total as integer cents, rounded per row: `numeric` text has two decimals, so no float error survives.
private const val TOTAL_CENTS = "CAST(ROUND(CAST(s.total AS REAL) * 100) AS INTEGER)"

private const val SALES_SQL =
    "SELECT s.id, s.sold_at, s.customer_name, s.payment_method, s.total, s.is_cancelled, u.name AS seller_name, " +
        "i.quantity AS item_quantity, i.unit_price AS item_price, p.name AS product_name " +
        "FROM sales s LEFT JOIN users u ON u.id = s.seller_id " +
        "LEFT JOIN sale_items i ON i.sale_id = s.id AND i.deleted_at IS NULL " +
        "LEFT JOIN products p ON p.id = i.product_id " +
        "WHERE s.id IN (SELECT s.id FROM sales s LEFT JOIN users u ON u.id = s.seller_id WHERE %s " +
        "ORDER BY $SOLD_AT DESC, s.id DESC LIMIT ?) " +
        "ORDER BY $SOLD_AT DESC, s.id DESC, i.id"

private const val SUMMARY_SQL =
    "SELECT COUNT(*) AS n, COALESCE(SUM($TOTAL_CENTS), 0) AS cents " +
        "FROM sales s LEFT JOIN users u ON u.id = s.seller_id WHERE %s"

private const val ONE_SALE_SQL =
    "SELECT s.id, s.sold_at, s.customer_name, s.payment_method, s.total, s.is_cancelled, u.name AS seller_name, " +
        "i.quantity AS item_quantity, i.unit_price AS item_price, p.name AS product_name " +
        "FROM sales s LEFT JOIN users u ON u.id = s.seller_id " +
        "LEFT JOIN sale_items i ON i.sale_id = s.id AND i.deleted_at IS NULL " +
        "LEFT JOIN products p ON p.id = i.product_id WHERE s.id = ? ORDER BY i.id"

/** The sales of the local database, with their lines. */
class SaleRepository
    @Inject
    constructor(
        private val sql: LocalSql,
    ) {
        /** Not cancelled, sold_at in [from, to], newest first, at most [limit] sales. */
        fun sales(
            filter: SaleFilter,
            limit: Int,
        ): Flow<List<SaleView>> {
            val (where, params) = where(filter)
            return sql
                .watch(SALES_SQL.format(where), params + limit, ::toRow)
                .map { group(it) }
        }

        /** Count and sum of every sale of the filter, not only the loaded ones. */
        fun summary(filter: SaleFilter): Flow<SalesSummary> {
            val (where, params) = where(filter)
            return sql
                .watch(
                    SUMMARY_SQL.format(where),
                    params,
                ) { SalesSummary(it.long("n")?.toInt() ?: 0, it.long("cents") ?: 0L) }
                .map { it.firstOrNull() ?: SalesSummary(0, 0L) }
        }

        /** The sale even when cancelled (the detail may still be open while the cancel is written); null if unknown. */
        fun sale(id: String): Flow<SaleView?> =
            sql.watch(ONE_SALE_SQL, listOf(id), ::toRow).map { group(it).firstOrNull() }

        private fun where(filter: SaleFilter): Pair<String, List<Any?>> {
            val clauses = mutableListOf("COALESCE(s.is_cancelled, 0) = 0", "$SOLD_AT >= julianday(?)")
            val params = mutableListOf<Any?>(DbTime.format(filter.from))
            filter.to?.let {
                clauses += "$SOLD_AT <= julianday(?)"
                params += DbTime.format(it)
            }
            filter.customer.trimmedOrNull()?.let {
                clauses += "s.customer_name LIKE ? ESCAPE '\\'"
                params += likePattern(it)
            }
            filter.seller.trimmedOrNull()?.let {
                clauses += "u.name LIKE ? ESCAPE '\\'"
                params += likePattern(it)
            }
            filter.minCents?.let {
                clauses += "$TOTAL_CENTS >= ?"
                params += it
            }
            filter.maxCents?.let {
                clauses += "$TOTAL_CENTS <= ?"
                params += it
            }
            return clauses.joinToString(" AND ") to params
        }

        private fun likePattern(text: String): String =
            "%" + text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"

        private fun group(rows: List<Row>): List<SaleView> =
            rows.groupBy { it.id }.values.map { group ->
                val head = group.first()
                val lines =
                    group.mapNotNull { row ->
                        row.itemQuantity?.let {
                            SaleLineView(row.productName, it, Money.parseDecimalToCents(row.itemPrice) ?: 0L)
                        }
                    }
                SaleView(
                    id = head.id,
                    soldAt = DbTime.parse(head.soldAt),
                    customerName = head.customer?.takeIf { it.isNotBlank() },
                    sellerName = head.sellerName,
                    payment = PaymentMethod.entries.firstOrNull { it.name == head.payment },
                    totalCents =
                        Money.parseDecimalToCents(head.total) ?: lines.sumOf { it.unitPriceCents * it.quantity },
                    isCancelled = head.isCancelled,
                    lines = lines,
                )
            }

        private fun toRow(row: SqlRow) =
            Row(
                id = row.string("id").orEmpty(),
                soldAt = row.string("sold_at"),
                customer = row.string("customer_name"),
                payment = row.string("payment_method"),
                total = row.string("total"),
                isCancelled = (row.long("is_cancelled") ?: 0L) != 0L,
                sellerName = row.string("seller_name"),
                itemQuantity = row.long("item_quantity")?.toInt(),
                itemPrice = row.string("item_price"),
                productName = row.string("product_name"),
            )

        @Suppress("LongParameterList")
        private class Row(
            val id: String,
            val soldAt: String?,
            val customer: String?,
            val payment: String?,
            val total: String?,
            val isCancelled: Boolean,
            val sellerName: String?,
            val itemQuantity: Int?,
            val itemPrice: String?,
            val productName: String?,
        )
    }
