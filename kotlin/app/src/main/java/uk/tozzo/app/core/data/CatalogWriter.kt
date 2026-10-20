package uk.tozzo.app.core.data

import uk.tozzo.app.domain.Money
import java.util.UUID
import javax.inject.Inject

/**
 * Writes products and product types to the local database. The PowerSync triggers turn each write into
 * a PUT, PATCH or DELETE of the upload queue, which the server already accepts. The price goes to the
 * `price` column as decimal text; the upload translates it to `price_cents`.
 */
class CatalogWriter
    @Inject
    constructor(
        private val sql: LocalSql,
    ) {
        /** Returns the id of the new product (generated here, kept by the server). */
        suspend fun createProduct(
            name: String,
            priceCents: Long,
            ingredients: String,
            typeId: String?,
        ): String {
            val id = UUID.randomUUID().toString()
            sql.execute(
                "INSERT INTO products (id, name, price, ingredients, product_type_id) VALUES (?, ?, ?, ?, ?)",
                listOf(id, name.trim(), Money.centsToDecimal(priceCents), ingredients.trim(), typeId),
            )
            return id
        }

        suspend fun updateProduct(
            id: String,
            name: String,
            priceCents: Long,
            ingredients: String,
            typeId: String?,
        ) = sql.execute(
            "UPDATE products SET name = ?, price = ?, ingredients = ?, product_type_id = ? WHERE id = ?",
            listOf(name.trim(), Money.centsToDecimal(priceCents), ingredients.trim(), typeId, id),
        )

        suspend fun deleteProduct(id: String) = sql.execute("DELETE FROM products WHERE id = ?", listOf(id))

        /** Returns the id of the new type; a new type is active. */
        suspend fun createType(
            description: String,
            color: String,
        ): String {
            val id = UUID.randomUUID().toString()
            sql.execute(
                "INSERT INTO product_types (id, description, color, is_active) VALUES (?, ?, ?, 1)",
                listOf(id, description.trim(), color),
            )
            return id
        }

        suspend fun updateType(
            id: String,
            description: String,
            color: String,
        ) = sql.execute(
            "UPDATE product_types SET description = ?, color = ? WHERE id = ?",
            listOf(description.trim(), color, id),
        )

        /** Leaves the products of the type alone: the server deletes them with it and the sync brings that back. */
        suspend fun deleteType(id: String) = sql.execute("DELETE FROM product_types WHERE id = ?", listOf(id))
    }
