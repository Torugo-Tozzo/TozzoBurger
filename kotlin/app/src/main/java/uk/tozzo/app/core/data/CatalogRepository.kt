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

        /**
         * Products for the management list, by name, with the web's rule: the products of an inactive type
         * are left out (`GET /v1/products` omits them). Unlike [products], one whose price is not a valid
         * decimal stays (with a null price) so it can be opened and fixed. [limit] is the page size
         * that grows with the scroll; [search] ignores case and accents.
         */
        fun manageProducts(
            search: String,
            limit: Int,
        ): Flow<List<ManagedProduct>> {
            val needle = fold(search)
            return sql
                .watch(
                    "SELECT $PRODUCT_COLUMNS $PRODUCT_FROM ORDER BY p.name COLLATE NOCASE, p.id LIMIT ?",
                    listOf(READ_CAP),
                    ::toManaged,
                ).map { rows ->
                    rows.filter { needle.isEmpty() || fold(it.name).contains(needle) }.take(limit)
                }
        }

        /** One live product for the edit form, whatever its type and price (a null price is to be fixed). */
        suspend fun productForEdit(id: String): ManagedProduct? =
            sql
                .getAll(
                    "SELECT $PRODUCT_COLUMNS FROM products p WHERE p.id = ? AND p.deleted_at IS NULL",
                    listOf(id),
                    ::toManaged,
                ).firstOrNull()

        private fun toManaged(row: SqlRow) =
            ManagedProduct(
                id = row.string("id").orEmpty(),
                name = row.string("name").orEmpty(),
                priceCents = Money.parseDecimalToCents(row.string("price")),
                ingredients = row.string("ingredients"),
                typeId = row.string("product_type_id"),
                imageKey = row.string("image_key"),
            )

        private fun toProduct(row: SqlRow): Product? {
            val managed = toManaged(row)
            val price = managed.priceCents ?: return null
            return Product(managed.id, managed.name, price, managed.ingredients, managed.typeId, managed.imageKey)
        }

        private fun fold(text: String): String = foldForSearch(text)
    }

/** Lower case without accents, for the searches that SQLite's ASCII-only folding cannot do. */
internal fun foldForSearch(text: String): String =
    Normalizer
        .normalize(text.trim(), Normalizer.Form.NFD)
        .replace(ACCENTS, "")
        .lowercase(Locale.ROOT)

private const val READ_CAP = 5000
private val ACCENTS = Regex("\\p{InCombiningDiacriticalMarks}+")

/** A product as the management screen sees it: [priceCents] is null when the stored price is not valid. */
data class ManagedProduct(
    val id: String,
    val name: String,
    val priceCents: Long?,
    val ingredients: String?,
    val typeId: String?,
    val imageKey: String?,
)
