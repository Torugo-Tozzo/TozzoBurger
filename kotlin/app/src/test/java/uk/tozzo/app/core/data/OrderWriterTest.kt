package uk.tozzo.app.core.data

import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import uk.tozzo.app.core.session.DeviceBinding
import uk.tozzo.app.domain.ItemStatus
import uk.tozzo.app.domain.KitchenStage
import uk.tozzo.app.domain.PaymentMethod
import uk.tozzo.app.testing.MemoryStore
import uk.tozzo.app.testing.RobolectricSql
import uk.tozzo.app.testing.foodOwnerBinding
import uk.tozzo.app.testing.seedItem
import uk.tozzo.app.testing.seedOrder
import uk.tozzo.app.testing.seedProduct
import uk.tozzo.app.testing.seedUser
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
                existing,
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

            writer.updateOrder(
                id,
                "Mesa 1",
                false,
                null,
                existing,
                listOf(existing[0].copy(quantity = 3), existing[1]),
            )

            val rows = itemRows(id).associateBy { it.productId }
            assertEquals(3L, rows.getValue("p1").quantity)
            assertEquals("IN_PREPARATION", rows.getValue("p1").status)
            assertEquals("READY", rows.getValue("p2").status)
        }

    @Test
    fun aQuantityChangeTakesAReadyItemOutOfTheKitchenReadyTab() =
        runTest {
            val (id, existing) = seeded()
            sql.execute(
                "UPDATE order_items SET status = 'READY', kitchen_ready_at = '2026-10-20 12:00:00.000' " +
                    "WHERE order_id = ?",
                listOf(id),
            )

            writer.updateOrder(
                id,
                "Mesa 1",
                false,
                null,
                existing,
                listOf(existing[0].copy(quantity = 3), existing[1]),
            )

            val board = KitchenRepository(sql).board().first()
            val preparing = board[KitchenStage.IN_PREPARATION].orEmpty()
            assertEquals(listOf("p1"), preparing.map { it.productId })
            assertEquals(3, preparing.single().quantity)
            assertEquals(listOf("p2"), board[KitchenStage.READY].orEmpty().map { it.productId })
        }

    @Test
    fun savingWithoutChangesWritesNothing() =
        runTest {
            val (id, existing) = seeded()
            sql.execute("UPDATE orders SET updated_at = '2026-01-01 00:00:00.000' WHERE id = ?", listOf(id))

            writer.updateOrder(id, "Mesa 1", false, null, existing, existing)

            assertEquals("2026-01-01 00:00:00.000", column(id, "updated_at"))
        }

    @Test
    fun updateOrderRefusesDeliveryWithoutAddressAndTooManyOrZeroQuantity() =
        runTest {
            val (id, existing) = seeded()
            assertThrows(IllegalArgumentException::class.java) {
                kotlinx.coroutines.runBlocking { writer.updateOrder(id, null, true, "  ", existing, existing) }
            }
            assertThrows(IllegalArgumentException::class.java) {
                kotlinx.coroutines.runBlocking {
                    writer.updateOrder(id, null, false, null, existing, listOf(existing[0].copy(quantity = 0)))
                }
            }
            assertEquals(2, itemRows(id).size)
        }

    @Test
    fun updateOrderCanEmptyTheOrder() =
        runTest {
            val (id, existing) = seeded()

            writer.updateOrder(id, "Mesa 1", false, null, existing, emptyList())

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
                kotlinx.coroutines.runBlocking { writer.updateOrder(id, "X", false, null, existing, existing) }
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
    fun setItemsStatusWritesEveryItemAndBackToPreparationClearsKitchenReadyAt() =
        runTest {
            val (id, existing) = seeded()
            val ids = existing.map { it.id }
            sql.execute(
                "UPDATE order_items SET kitchen_ready_at = '2026-10-20 12:00:00.000' WHERE order_id = ?",
                listOf(id),
            )

            writer.setItemsStatus(ids, ItemStatus.READY)
            assertEquals(listOf("READY", "READY"), itemRows(id).map { it.status })
            assertEquals(2, readyAtCount(id))

            writer.setItemsStatus(ids, ItemStatus.IN_PREPARATION)
            assertEquals(listOf("IN_PREPARATION", "IN_PREPARATION"), itemRows(id).map { it.status })
            assertEquals(0, readyAtCount(id))
        }

    @Test
    fun setItemsStatusChangesNothingWhenOneItemIsRefused() =
        runTest {
            val (id, existing) = seeded()

            assertThrows(IllegalStateException::class.java) {
                kotlinx.coroutines.runBlocking {
                    writer.setItemsStatus(listOf(existing[0].id, "missing"), ItemStatus.READY)
                }
            }
            assertEquals(listOf("IN_PREPARATION", "IN_PREPARATION"), itemRows(id).map { it.status })
        }

    private suspend fun readyAtCount(orderId: String) =
        sql
            .getAll(
                "SELECT COUNT(*) AS n FROM order_items WHERE order_id = ? AND kitchen_ready_at IS NOT NULL",
                listOf(orderId),
            ) { it.long("n")?.toInt() }
            .single()

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

    // --- deliveries ---

    private suspend fun deliveryOrder(
        startedAt: String? = null,
        status: String = "READY",
        driverId: String? = null,
    ): String {
        sql.seedProduct("p1", "X-Burger", "12.50")
        sql.seedOrder("d1", isDelivery = 1, address = "Rua A", deliveryStartedAt = startedAt, driverId = driverId)
        sql.seedItem("di1", "d1", "p1", 2, status = status)
        return "d1"
    }

    private suspend fun deliveryJson(id: String) = Json.parseToJsonElement(column(id, "delivery_json")!!).jsonObject

    @Test
    fun assignWritesDeliveryJsonAndDriverColumn() =
        runTest {
            sql.seedUser("dr1", "Beto", role = "DRIVER")
            val id = deliveryOrder()

            writer.assignDriver(id, "dr1")

            assertEquals("""{"action":"ASSIGN","driver_id":"dr1"}""", column(id, "delivery_json"))
            assertEquals("dr1", column(id, "driver_id"))
            assertNull(column(id, "external_driver_name"))
            assertNull(column(id, "delivery_started_at"))
        }

    @Test
    fun assignExternalWritesNameAndOptionalPhone() =
        runTest {
            val id = deliveryOrder(driverId = "old")

            writer.assignExternal(id, "  Joao iFood ", " 119 ")
            assertEquals(
                """{"action":"ASSIGN","external_driver_name":"Joao iFood","external_driver_phone":"119"}""",
                column(id, "delivery_json"),
            )
            assertNull(column(id, "driver_id"))
            assertEquals("Joao iFood", column(id, "external_driver_name"))
            assertEquals("119", column(id, "external_driver_phone"))

            writer.assignExternal(id, "Maria", " ")
            assertEquals("""{"action":"ASSIGN","external_driver_name":"Maria"}""", column(id, "delivery_json"))
            assertNull(column(id, "external_driver_phone"))
        }

    @Test
    fun externalNameRequired() =
        runTest {
            val id = deliveryOrder()

            listOf(
                { runBlocking { writer.assignExternal(id, "  ", "119") } },
                { runBlocking { writer.assignExternal(id, "a".repeat(121), null) } },
                { runBlocking { writer.assignExternal(id, "Joao", "1".repeat(41)) } },
            ).forEach { assertThrows(IllegalArgumentException::class.java, it) }
            assertNull(column(id, "delivery_json"))
            writer.assignExternal(id, "a".repeat(120), "1".repeat(40))
            assertEquals("ASSIGN", deliveryJson(id)["action"]?.jsonPrimitive?.content)
        }

    @Test
    fun aBusyDriverCannotBeAssigned() =
        runTest {
            sql.seedUser("dr1", "Beto", role = "DRIVER")
            sql.seedUser("e1", "Ana", role = "EMPLOYEE")
            sql.seedOrder("out", isDelivery = 1, driverId = "dr1", deliveryStartedAt = "2026-10-20 12:40:00.000")
            val id = deliveryOrder()

            val busy =
                assertThrows(DeliveryRefused::class.java) { runBlocking { writer.assignDriver(id, "dr1") } }
            assertEquals(DeliveryRefusal.DRIVER_BUSY, busy.reason)
            assertThrows(DeliveryRefused::class.java) { runBlocking { writer.assignDriver(id, "e1") } }
            assertThrows(DeliveryRefused::class.java) { runBlocking { writer.assignDriver(id, "nobody") } }
            assertNull(column(id, "delivery_json"))
        }

    @Test
    fun unassignClearsBothDriversAndSendsOnlyTheAction() =
        runTest {
            val id = deliveryOrder(driverId = "dr1")

            writer.unassign(id)

            assertEquals("""{"action":"UNASSIGN"}""", column(id, "delivery_json"))
            assertNull(column(id, "driver_id"))
            assertNull(column(id, "external_driver_name"))
        }

    @Test
    fun assignAndUnassignOnlyBeforeTheDeliveryLeaves() =
        runTest {
            val id = deliveryOrder(startedAt = "2026-10-20 12:40:00.000")
            sql.seedUser("dr1", "Beto", role = "DRIVER")

            val refused =
                listOf(
                    { runBlocking { writer.unassign(id) } },
                    { runBlocking { writer.assignDriver(id, "dr1") } },
                    { runBlocking { writer.assignExternal(id, "Joao", null) } },
                ).map { assertThrows(DeliveryRefused::class.java, it).reason }
            assertEquals(List(3) { DeliveryRefusal.CONFLICT }, refused)
            assertNull(column(id, "delivery_json"))
        }

    @Test
    fun startWithConfirmLeavesItemsAlone() =
        runTest {
            val id = deliveryOrder(status = "IN_PREPARATION")
            sql.db.execSQL(
                "CREATE TRIGGER no_item_writes BEFORE UPDATE ON order_items " +
                    "BEGIN SELECT RAISE(ABORT, 'order_items written'); END",
            )

            writer.startDelivery(id, confirmReady = true)

            assertEquals("""{"action":"START","confirm_ready":true}""", column(id, "delivery_json"))
            assertEquals("2026-10-20 15:30:00.250", column(id, "delivery_started_at"))
            assertEquals(
                listOf("IN_PREPARATION"),
                sql.getAll("SELECT status FROM order_items") { it.string("status") },
            )
        }

    @Test
    fun startWithoutPendingItemsOmitsConfirmReady() =
        runTest {
            val id = deliveryOrder(status = "DELIVERED")

            writer.startDelivery(id, confirmReady = false)

            assertEquals("""{"action":"START"}""", column(id, "delivery_json"))
            assertNotNull(column(id, "delivery_started_at"))
        }

    @Test
    fun startRefusesPendingItemsWithoutConfirmationAndEmptyOrders() =
        runTest {
            val pending = deliveryOrder(status = "IN_PREPARATION")
            sql.seedOrder("empty", isDelivery = 1, address = "Rua B")

            val notReady =
                assertThrows(DeliveryRefused::class.java) { runBlocking { writer.startDelivery(pending, false) } }
            assertEquals(DeliveryRefusal.NOT_READY, notReady.reason)
            assertThrows(DeliveryRefused::class.java) { runBlocking { writer.startDelivery("empty", true) } }
            assertNull(column(pending, "delivery_started_at"))
            assertNull(column("empty", "delivery_started_at"))
        }

    @Test
    fun startRefusesABusyDriverAndAnAlreadyStartedDelivery() =
        runTest {
            sql.seedUser("dr1", "Beto", role = "DRIVER")
            sql.seedOrder("out", isDelivery = 1, driverId = "dr1", deliveryStartedAt = "2026-10-20 12:40:00.000")
            val id = deliveryOrder(driverId = "dr1")

            val busy = assertThrows(DeliveryRefused::class.java) { runBlocking { writer.startDelivery(id, false) } }
            assertEquals(DeliveryRefusal.DRIVER_BUSY, busy.reason)
            val started =
                assertThrows(DeliveryRefused::class.java) { runBlocking { writer.startDelivery("out", false) } }
            assertEquals(DeliveryRefusal.CONFLICT, started.reason)
        }

    @Test
    fun waitOnlyWhileDelivering() =
        runTest {
            val id = deliveryOrder(startedAt = "2026-10-20 12:40:00.000")
            sql.seedOrder("waiting", isDelivery = 1)

            writer.waitDelivery(id)

            assertEquals("""{"action":"WAIT"}""", column(id, "delivery_json"))
            assertNull(column(id, "delivery_started_at"))
            val refused = assertThrows(DeliveryRefused::class.java) { runBlocking { writer.waitDelivery("waiting") } }
            assertEquals(DeliveryRefusal.CONFLICT, refused.reason)
        }

    @Test
    fun deliveryActionsRefuseClosedMissingAndNonDeliveryOrders() =
        runTest {
            sql.seedOrder("closed", isDelivery = 1, isOpen = 0)
            sql.seedOrder("table", isDelivery = 0)

            listOf("closed", "table", "missing").forEach { id ->
                assertThrows(DeliveryRefused::class.java) { runBlocking { writer.unassign(id) } }
            }
        }

    @Test
    fun aDeliveringDeliveryOrderClosesAndAWaitingOneDoesNot() =
        runTest {
            val out = deliveryOrder(startedAt = "2026-10-20 12:40:00.000")
            sql.seedOrder("waiting", isDelivery = 1, address = "Rua B")

            writer.closeOrder(out, PaymentMethod.CASH)

            assertEquals("0", column(out, "is_open"))
            assertEquals("""{"payment_method":"CASH"}""", column(out, "close_json"))
            assertThrows(IllegalStateException::class.java) { runBlocking { writer.closeOrder("waiting", null) } }
            assertEquals("1", column("waiting", "is_open"))
            assertThrows(IllegalStateException::class.java) { runBlocking { writer.closeOrder(out, null) } }
        }
}
