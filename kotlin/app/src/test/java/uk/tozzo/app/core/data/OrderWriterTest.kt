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
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import uk.tozzo.app.core.session.DeviceBinding
import uk.tozzo.app.domain.ItemStatus
import uk.tozzo.app.domain.PaymentMethod
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

    // --- editing ---

    private data class ItemRow(
        val id: String,
        val productId: String,
        val quantity: Long,
        val status: String,
    )

    private suspend fun itemRows(orderId: String) =
        sql
            .getAll(
                "SELECT id, product_id, quantity, status FROM order_items WHERE order_id = ? ORDER BY product_id, id",
                listOf(orderId),
            ) {
                ItemRow(
                    it.string("id").orEmpty(),
                    it.string("product_id").orEmpty(),
                    it.long("quantity") ?: 0,
                    it.string("status").orEmpty(),
                )
            }

    private suspend fun column(
        id: String,
        column: String,
    ) = sql.getAll("SELECT $column AS c FROM orders WHERE id = ?", listOf(id)) { it.string("c") }.single()

    private suspend fun seeded(): Pair<String, List<EditLine>> {
        val id = writer.createOrder(lines, "Mesa 1", false, null)
        val items = itemRows(id)
        return id to
            listOf(
                EditLine(items[0].id, "p1", "X-Burger", 1250, 2),
                EditLine(items[1].id, "p2", "Coke", 600, 1),
            )
    }

    @Test
    fun updateOrderKeepsIdsAndAddsNew() =
        runTest {
            val (id, existing) = seeded()
            val coke = existing[1]

            writer.updateOrder(
                id,
                " Mesa 2 ",
                false,
                null,
                listOf(existing[0], EditLine("", "p3", "Fries", 800, 2)),
            )

            val rows = itemRows(id)
            assertEquals(listOf("p1", "p3"), rows.map { it.productId })
            assertEquals(existing[0].id, rows[0].id)
            assertTrue(rows.none { it.id == coke.id })
            val json = Json.parseToJsonElement(column(id, "items_json")!!).jsonArray.map { it.jsonObject }
            assertEquals(rows.map { it.id }, json.map { it.getValue("id").jsonPrimitive.content })
            assertEquals(listOf("p1", "p3"), json.map { it.getValue("product_id").jsonPrimitive.content })
            assertEquals(setOf("id", "product_id", "quantity"), json[1].keys)
            assertEquals("Mesa 2", column(id, "customer_name"))
            assertEquals("41.00", column(id, "total"))
            assertEquals("2026-10-20 15:30:00.250", column(id, "updated_at"))
            assertEquals("IN_PREPARATION", rows[1].status)
        }

    @Test
    fun quantityChangeResetsStatus() =
        runTest {
            val (id, existing) = seeded()
            sql.execute("UPDATE order_items SET status = 'READY' WHERE order_id = ?", listOf(id))

            writer.updateOrder(id, "Mesa 1", false, null, listOf(existing[0].copy(quantity = 3), existing[1]))

            val rows = itemRows(id).associateBy { it.productId }
            assertEquals(3L, rows.getValue("p1").quantity)
            assertEquals("IN_PREPARATION", rows.getValue("p1").status)
            assertEquals("READY", rows.getValue("p2").status)
        }

    @Test
    fun savingWithoutChangesWritesNothing() =
        runTest {
            val (id, existing) = seeded()
            sql.execute("UPDATE orders SET updated_at = '2026-01-01 00:00:00.000' WHERE id = ?", listOf(id))

            writer.updateOrder(id, "Mesa 1", false, null, existing)

            assertEquals("2026-01-01 00:00:00.000", column(id, "updated_at"))
        }

    @Test
    fun updateOrderRefusesDeliveryWithoutAddressAndTooManyOrZeroQuantity() =
        runTest {
            val (id, existing) = seeded()
            assertThrows(IllegalArgumentException::class.java) {
                kotlinx.coroutines.runBlocking { writer.updateOrder(id, null, true, "  ", existing) }
            }
            assertThrows(IllegalArgumentException::class.java) {
                kotlinx.coroutines.runBlocking {
                    writer.updateOrder(id, null, false, null, listOf(existing[0].copy(quantity = 0)))
                }
            }
            assertEquals(2, itemRows(id).size)
        }

    @Test
    fun updateOrderCanEmptyTheOrder() =
        runTest {
            val (id, _) = seeded()

            writer.updateOrder(id, "Mesa 1", false, null, emptyList())

            assertEquals(0, itemRows(id).size)
            assertEquals("[]", column(id, "items_json"))
            assertEquals("0.00", column(id, "total"))
        }

    @Test
    fun anOrderOutForDeliveryOrClosedRefusesEverything() =
        runTest {
            val (id, existing) = seeded()
            sql.execute("UPDATE orders SET delivery_started_at = '2026-10-20 13:00:00.000' WHERE id = ?", listOf(id))

            assertThrows(IllegalStateException::class.java) {
                kotlinx.coroutines.runBlocking { writer.updateOrder(id, "X", false, null, existing) }
            }
            assertThrows(IllegalStateException::class.java) {
                kotlinx.coroutines.runBlocking { writer.setItemStatus(existing[0].id, ItemStatus.READY) }
            }
            assertThrows(
                IllegalStateException::class.java,
            ) { kotlinx.coroutines.runBlocking { writer.deleteOrder(id) } }
            assertEquals("1", column(id, "is_open"))
        }

    @Test
    fun setItemStatusWritesStatus() =
        runTest {
            val (id, existing) = seeded()

            writer.setItemStatus(existing[0].id, ItemStatus.READY)

            assertEquals(listOf("READY", "IN_PREPARATION"), itemRows(id).map { it.status })
        }

    @Test
    fun closeWritesCloseJsonOnly() =
        runTest {
            val (id, _) = seeded()
            val other = writer.createOrder(lines, null, false, null)

            writer.closeOrder(id, PaymentMethod.PIX)
            writer.closeOrder(other, null)

            assertEquals("0", column(id, "is_open"))
            assertEquals("""{"payment_method":"PIX"}""", column(id, "close_json"))
            assertEquals("{}", column(other, "close_json"))
            assertEquals("2026-10-20 15:30:00.250", column(id, "updated_at"))
        }

    @Test
    fun aDeliveryOrderCannotBeClosedHere() =
        runTest {
            val id = writer.createOrder(lines, null, true, "Rua A")

            assertThrows(IllegalStateException::class.java) {
                kotlinx.coroutines.runBlocking { writer.closeOrder(id, null) }
            }
            assertEquals("1", column(id, "is_open"))
        }

    @Test
    fun deleteRemovesTheOrderAndItsItems() =
        runTest {
            val (id, _) = seeded()
            val other = writer.createOrder(lines, null, false, null)

            writer.deleteOrder(id)

            assertEquals(0, itemRows(id).size)
            assertEquals(listOf(other), sql.getAll("SELECT id FROM orders", emptyList()) { it.string("id") })
            assertEquals(2, itemRows(other).size)
        }
}
