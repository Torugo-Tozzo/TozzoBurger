package uk.tozzo.app.core.data

import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import uk.tozzo.app.core.session.DeviceBinding
import uk.tozzo.app.domain.PaymentMethod
import uk.tozzo.app.testing.MemoryStore
import uk.tozzo.app.testing.RobolectricSql
import uk.tozzo.app.testing.foodOwnerBinding
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

@RunWith(RobolectricTestRunner::class)
class SaleWriterTest {
    private lateinit var sql: RobolectricSql
    private lateinit var writer: SaleWriter
    private val clock = Clock.fixed(Instant.parse("2026-10-20T15:30:00.250Z"), ZoneOffset.UTC)
    private val lines =
        listOf(
            CartLine("p1", "X-Burger", 1250, 2),
            CartLine("p2", "Coke", 600, 1),
        )

    @Before
    fun setUp() =
        runTest {
            sql = RobolectricSql()
            val binding = DeviceBinding(MemoryStore())
            binding.save(foodOwnerBinding())
            writer = SaleWriter(sql, binding, clock)
        }

    @After
    fun tearDown() = sql.close()

    private suspend fun saleRow(id: String) =
        sql
            .getAll(
                "SELECT total, sold_at, customer_name, payment_method, seller_id, is_cancelled, items_json " +
                    "FROM sales WHERE id = ?",
                listOf(id),
            ) {
                listOf(
                    it.string("total"),
                    it.string("sold_at"),
                    it.string("customer_name"),
                    it.string("payment_method"),
                    it.string("seller_id"),
                    it.long("is_cancelled"),
                    it.string("items_json"),
                )
            }.single()

    @Test
    fun writesTheSaleAndItsItemsInOneTransaction() =
        runTest {
            val id = writer.createSale(lines, "  Mesa 4 ", PaymentMethod.PIX)

            val row = saleRow(id)
            assertEquals("31.00", row[0])
            assertEquals("2026-10-20 15:30:00.250", row[1])
            assertEquals("Mesa 4", row[2])
            assertEquals("PIX", row[3])
            assertEquals(0L, row[5])
            val items =
                sql.getAll(
                    "SELECT product_id, quantity, unit_price FROM sale_items WHERE sale_id = ? ORDER BY product_id",
                    listOf(id),
                ) { listOf(it.string("product_id"), it.long("quantity"), it.string("unit_price")) }
            assertEquals(listOf(listOf("p1", 2L, "12.50"), listOf("p2", 1L, "6.00")), items)
        }

    @Test
    fun totalIsTheExactDecimalSum() =
        runTest {
            val id = writer.createSale(listOf(CartLine("p1", "X", 1250, 2)), null, null)

            assertEquals("25.00", saleRow(id)[0])
        }

    @Test
    fun itemsJsonCarriesTheCents() =
        runTest {
            val id = writer.createSale(lines, null, null)

            val json: JsonArray = Json.parseToJsonElement(saleRow(id)[6] as String).jsonArray
            val first: JsonObject = json[0].jsonObject
            assertEquals(2, json.size)
            assertEquals("p1", first.getValue("product_id").jsonPrimitive.content)
            assertEquals(2, first.getValue("quantity").jsonPrimitive.int)
            assertEquals(1250L, first.getValue("unit_price_cents").jsonPrimitive.long)
        }

    @Test
    fun sellerIsTheBoundUserAndOptionalFieldsAreNull() =
        runTest {
            val id = writer.createSale(lines, "   ", null)

            val row = saleRow(id)
            assertEquals("u1", row[4])
            assertNull(row[2])
            assertNull(row[3])
        }

    @Test(expected = IllegalArgumentException::class)
    fun anEmptyCartIsRefused() =
        runTest {
            writer.createSale(emptyList(), null, null)
            Unit
        }

    @Test
    fun cancelSaleMarksItCancelled() =
        runTest {
            val id = writer.createSale(lines, null, null)

            writer.cancelSale(id)

            assertEquals(1L, saleRow(id)[5])
        }
}
