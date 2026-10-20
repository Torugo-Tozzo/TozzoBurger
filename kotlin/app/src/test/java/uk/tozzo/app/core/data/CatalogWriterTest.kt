package uk.tozzo.app.core.data

import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import uk.tozzo.app.testing.RobolectricSql
import java.util.UUID

/** Wraps [inner] and keeps every statement written, in order. */
private class RecordingSql(
    private val inner: LocalSql,
) : LocalSql by inner {
    val statements = mutableListOf<String>()

    override suspend fun execute(
        sql: String,
        params: List<Any?>,
    ) {
        statements += sql
        inner.execute(sql, params)
    }
}

@RunWith(RobolectricTestRunner::class)
class CatalogWriterTest {
    private lateinit var sql: RobolectricSql
    private lateinit var recording: RecordingSql
    private lateinit var writer: CatalogWriter

    @Before
    fun setUp() {
        sql = RobolectricSql()
        recording = RecordingSql(sql)
        writer = CatalogWriter(recording)
    }

    @After
    fun tearDown() = sql.close()

    private suspend fun productRow(id: String) =
        sql
            .getAll("SELECT name, price, ingredients, product_type_id FROM products WHERE id = ?", listOf(id)) {
                listOf(it.string("name"), it.string("price"), it.string("ingredients"), it.string("product_type_id"))
            }.singleOrNull()

    @Test
    fun createProductWritesTheRowWithTheDecimalPrice() =
        runTest {
            val id = writer.createProduct("  X-Burger ", 1250, "bread, cheese", "t1")

            assertEquals(id, UUID.fromString(id).toString())
            assertEquals(listOf("X-Burger", "12.50", "bread, cheese", "t1"), productRow(id))
        }

    @Test
    fun createProductKeepsSmallAndLargePricesExact() =
        runTest {
            val cheap = writer.createProduct("A", 5, "", null)
            val big = writer.createProduct("B", 9_999_999_999, "", null)

            assertEquals("0.05", productRow(cheap)!![1])
            assertEquals("99999999.99", productRow(big)!![1])
            assertNull(productRow(cheap)!![3])
            assertNotEquals(cheap, big)
        }

    @Test
    fun updateProductChangesTheColumnsAndCanClearTheType() =
        runTest {
            val id = writer.createProduct("A", 100, "x", "t1")

            writer.updateProduct(id, "B", 250, "y", null)

            assertEquals(listOf("B", "2.50", "y", null), productRow(id))
        }

    @Test
    fun deleteProductIssuesADeleteSoTheSyncUploadsOne() =
        runTest {
            val id = writer.createProduct("A", 100, "", null)

            writer.deleteProduct(id)

            // PowerSync turns a local DELETE into the DELETE op of the upload queue.
            assertTrue(recording.statements.last().startsWith("DELETE FROM products WHERE id"))
            assertNull(productRow(id))
        }

    @Test
    fun createAndUpdateTypeWriteDescriptionColorAndActive() =
        runTest {
            val id = writer.createType("Burgers", "#EF4444")

            suspend fun read() =
                sql
                    .getAll("SELECT description, color, is_active FROM product_types WHERE id = ?", listOf(id)) {
                        listOf(it.string("description"), it.string("color"), it.long("is_active"))
                    }.single()

            assertEquals(listOf("Burgers", "#EF4444", 1L), read())

            writer.updateType(id, "Lanches", "#3B82F6")

            assertEquals(listOf("Lanches", "#3B82F6", 1L), read())
        }

    @Test
    fun deleteTypeLeavesTheProductsAloneLocally() =
        runTest {
            val typeId = writer.createType("Burgers", "#000000")
            val productId = writer.createProduct("A", 100, "", typeId)

            writer.deleteType(typeId)

            // The server decides what happens to the products of the type.
            assertTrue(recording.statements.last().startsWith("DELETE FROM product_types WHERE id"))
            assertEquals(0, sql.getAll("SELECT id FROM product_types", emptyList()) { it.string("id") }.size)
            assertEquals(typeId, productRow(productId)!![3])
            assertTrue(recording.statements.none { it.contains("products") && it.startsWith("DELETE") })
        }
}
