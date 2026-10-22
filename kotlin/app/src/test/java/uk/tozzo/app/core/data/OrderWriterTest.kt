package uk.tozzo.app.core.data

import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import uk.tozzo.app.core.session.DeviceBinding
import uk.tozzo.app.testing.MemoryStore
import uk.tozzo.app.testing.RobolectricSql
import uk.tozzo.app.testing.foodOwnerBinding
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

@RunWith(RobolectricTestRunner::class)
class OrderWriterTest {
    private lateinit var sql: RobolectricSql
    private lateinit var writer: OrderWriter
    private val clock = Clock.fixed(Instant.parse("2026-10-20T15:30:00.250Z"), ZoneOffset.UTC)
    private val lines = listOf(CartLine("p1", "X-Burger", 1250, 2), CartLine("p2", "Coke", 600, 1))

    @Before
    fun setUp() =
        runTest {
            sql = RobolectricSql()
            val binding = DeviceBinding(MemoryStore())
            binding.save(foodOwnerBinding())
            writer = OrderWriter(sql, binding, clock)
        }

    @After
    fun tearDown() = sql.close()

    private suspend fun orderRow(id: String) =
        sql
            .getAll(
                "SELECT customer_name, is_open, is_delivery, delivery_address, opened_at, updated_at, total, " +
                    "seller_id, items_json FROM orders WHERE id = ?",
                listOf(id),
            ) {
                listOf(
                    it.string("customer_name"),
                    it.long("is_open"),
                    it.long("is_delivery"),
                    it.string("delivery_address"),
                    it.string("opened_at"),
                    it.string("updated_at"),
                    it.string("total"),
                    it.string("seller_id"),
                    it.string("items_json"),
                )
            }.single()

    @Test
    fun writesAnOpenOrderWithTheDeviceItemIds() =
        runTest {
            val id = writer.createOrder(lines, " Mesa 10 ", false, null)

            val row = orderRow(id)
            assertEquals(listOf("Mesa 10", 1L, 0L, null), row.take(4))
            assertEquals("2026-10-20 15:30:00.250", row[4])
            assertEquals("2026-10-20 15:30:00.250", row[5])
            assertEquals("31.00", row[6])
            assertEquals("u1", row[7])
            val json = Json.parseToJsonElement(row[8] as String).jsonArray.map { it.jsonObject }
            val items =
                sql.getAll(
                    "SELECT id, product_id, quantity, status, unit_price FROM order_items WHERE order_id = ?",
                    listOf(id),
                ) { listOf(it.string("id"), it.string("product_id"), it.long("quantity"), it.string("status")) }
            assertEquals(json.map { it.getValue("id").jsonPrimitive.content }.toSet(), items.map { it[0] }.toSet())
            assertEquals(
                listOf(listOf("p1", "2", "IN_PREPARATION"), listOf("p2", "1", "IN_PREPARATION")),
                items.sortedBy { it[1] as String }.map { listOf(it[1], it[2].toString(), it[3]) },
            )
            assertEquals(setOf("id", "product_id", "quantity"), json[0].keys)
        }

    @Test
    fun aDeliveryOrderKeepsTheTrimmedAddress() =
        runTest {
            val id = writer.createOrder(lines, null, true, " Rua A, 10 ")

            val row = orderRow(id)
            assertEquals(1L, row[2])
            assertEquals("Rua A, 10", row[3])
            assertNull(row[0])
        }

    @Test
    fun aDeliveryOrderWithoutAddressIsRefused() =
        runTest {
            assertThrows(IllegalArgumentException::class.java) {
                kotlinx.coroutines.runBlocking { writer.createOrder(lines, null, true, "   ") }
            }
            assertThrows(IllegalArgumentException::class.java) {
                kotlinx.coroutines.runBlocking { writer.createOrder(lines, null, true, null) }
            }
            assertEquals(0, sql.getAll("SELECT id FROM orders", emptyList()) { it.string("id") }.size)
        }

    @Test
    fun anAddressOver500CharactersIsRefused() =
        runTest {
            assertThrows(IllegalArgumentException::class.java) {
                kotlinx.coroutines.runBlocking { writer.createOrder(lines, null, true, "a".repeat(501)) }
            }
            assertEquals(0, sql.getAll("SELECT id FROM orders", emptyList()) { it.string("id") }.size)
        }
}
