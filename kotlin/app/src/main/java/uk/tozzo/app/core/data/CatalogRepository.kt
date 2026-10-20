package uk.tozzo.app.core.data

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import uk.tozzo.app.domain.Money
import uk.tozzo.app.domain.Product
import uk.tozzo.app.domain.ProductType
import java.text.Normalizer
import java.util.Locale
import javax.inject.Inject

private const val PRODUCT_COLUMNS = "p.id, p.name, p.price, p.ingredients, p.product_type_id, p.image_key"

// A product shows when its type is active, not deleted, or when it has none.
private const val PRODUCT_FROM =
    "FROM products p LEFT JOIN product_types t ON t.id = p.product_type_id " +
        "WHERE p.deleted_at IS NULL AND (p.product_type_id IS NULL OR (t.is_active = 1 AND t.deleted_at IS NULL))"

/** Read-only catalog of the local database; the writes go up through the sync. */
class CatalogRepository
    @Inject
    constructor(
        private val sql: LocalSql,
    ) {
        /** Live types, by description; [includeInactive] for the Products screen. */
        fun types(includeInactive: Boolean): Flow<List<ProductType>> {
            val active = if (includeInactive) "" else " AND is_active = 1"
            return sql.watch(
                "SELECT id, description, color, is_active FROM product_types " +
                    "WHERE deleted_at IS NULL$active ORDER BY description COLLATE NOCASE, id",
            ) {
                ProductType(
                    id = it.string("id").orEmpty(),
                    description = it.string("description").orEmpty(),
                    color = it.string("color"),
                    isActive = it.long("is_active") == 1L,
                )
            }
        }

        /**
         * Live products, by name, whose type is active or absent; [search] matches the name ignoring case and
         * accents ("pao" finds "PÃO"): SQLite folds only ASCII, so the match runs here on a capped read.
         * A product whose price is not a valid decimal is left out (it would sell for a wrong amount), and
         * [limit] counts the products that remain.
         */
        fun products(
            search: String,
            typeId: String?,
            limit: Int,
        ): Flow<List<Product>> {
            val params = mutableListOf<Any?>()
            var where = ""
            if (typeId != null) {
                where += " AND p.product_type_id = ?"
                params += typeId
            }
            params += READ_CAP
            val needle = fold(search)
            return sql
                .watch(
                    "SELECT $PRODUCT_COLUMNS $PRODUCT_FROM$where ORDER BY p.name COLLATE NOCASE, p.id LIMIT ?",
                    params,
                    ::toProduct,
                ).map { rows ->
                    rows
                        .asSequence()
                        .filterNotNull()
                        .filter { needle.isEmpty() || fold(it.name).contains(needle) }
                        .take(limit)
                        .toList()
                }
        }

        /** One live product by id, whatever its type (an order keeps showing the items it already has). */
        fun product(id: String): Flow<Product?> =
            sql
                .watch(
                    "SELECT $PRODUCT_COLUMNS FROM products p WHERE p.id = ? AND p.deleted_at IS NULL",
                    listOf(id),
                    ::toProduct,
                ).map { it.firstOrNull() }

        private fun toProduct(row: SqlRow): Product? {
            val price = Money.parseDecimalToCents(row.string("price")) ?: return null
            return Product(
                id = row.string("id").orEmpty(),
                name = row.string("name").orEmpty(),
                priceCents = price,
                ingredients = row.string("ingredients"),
                typeId = row.string("product_type_id"),
                imageKey = row.string("image_key"),
            )
        }

        private fun fold(text: String): String =
            Normalizer
                .normalize(text.trim(), Normalizer.Form.NFD)
                .replace(ACCENTS, "")
                .lowercase(Locale.ROOT)
    }

private const val READ_CAP = 5000
private val ACCENTS = Regex("\\p{InCombiningDiacriticalMarks}+")
