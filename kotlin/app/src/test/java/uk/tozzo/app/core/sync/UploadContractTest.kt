package uk.tozzo.app.core.sync

import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import uk.tozzo.app.core.data.CartLine
import uk.tozzo.app.core.data.EditLine
import uk.tozzo.app.core.data.OrderWriter
import uk.tozzo.app.core.session.DeviceBinding
import uk.tozzo.app.domain.ItemStatus
import uk.tozzo.app.domain.PaymentMethod
import uk.tozzo.app.testing.CrudRecorder
import uk.tozzo.app.testing.MemoryStore
import uk.tozzo.app.testing.RobolectricSql
import uk.tozzo.app.testing.UNCHANGED_ROW
import uk.tozzo.app.testing.foodOwnerBinding
import uk.tozzo.app.testing.seedItem
import uk.tozzo.app.testing.seedOrder
import uk.tozzo.app.testing.seedUser
import java.time.Clock

/**
 * The real writers' output, queued the way PowerSync queues it ([CrudRecorder]), read back by the SDK's
 * `CrudEntry` and the connector's [toPendingOp], and turned into the upload JSON by [UploadMapper].
 */
@RunWith(RobolectricTestRunner::class)
class UploadContractTest {
    private lateinit var db: RobolectricSql
    private lateinit var queue: CrudRecorder
    private lateinit var writer: OrderWriter
    private val lines = listOf(CartLine("p1", "X-Burger", 1250, 2), CartLine("p2", "Coke", 600, 1))

    @Before
    fun setUp() =
        runTest {
            db = RobolectricSql()
            queue = CrudRecorder(db)
            val binding = DeviceBinding(MemoryStore())
            binding.save(foodOwnerBinding())
            writer = OrderWriter(queue, binding, Clock.systemUTC())
        }

    @After
    fun tearDown() = db.close()

    /** What goes up for the queue so far, `table op id -> data` (null: not uploaded), then clears it. */
    private fun upload(): List<Pair<String, JsonObject?>> {
        val ops = queue.entries.map { it.toPendingOp() }
        queue.clear()
        ops.forEach { assertTrue("an UPDATE that changed nothing: ${it.table}", it.id != UNCHANGED_ROW) }
        return ops.map { op ->
            "${op.table} ${op.op}" to UploadMapper.toJson(op, DEVICE)?.get("data")?.jsonObject
        }
    }

    private suspend fun itemIds(orderId: String) =
        db.getAll("SELECT id FROM order_items WHERE order_id = ? ORDER BY product_id", listOf(orderId)) {
            it.string("id").orEmpty()
        }

    private fun assertNoEmptyOrBlankOps(uploads: List<Pair<String, JsonObject?>>) {
        uploads.forEach { (op, data) ->
            if (op.startsWith("orders PATCH")) assertTrue("empty $op", data!!.isNotEmpty())
            assertTrue("status null in $op", data?.get("status")?.toString() != "null")
        }
    }

    @Test
    fun createEditAndKitchenMoves() =
        runTest {
            val id = writer.createOrder(lines, "Mesa 1", false, null)
            val created = upload()
            assertEquals(listOf("order_items PUT", "order_items PUT", "orders PUT"), created.map { it.first }.sorted())
            val put = created.single { it.first == "orders PUT" }.second!!
            assertEquals(2, put.getValue("items").jsonArray.size)
            assertEquals(setOf("customer_name", "is_delivery", "delivery_address", "items"), put.keys)
            created.filter { it.first == "order_items PUT" }.forEach { assertNull(it.second) }

            val (burger, coke) = itemIds(id)
            writer.setItemsStatus(listOf(burger), ItemStatus.READY)
            assertEquals(listOf("order_items PATCH" to JsonObject(mapOf("status" to status("READY")))), upload())

            // Quantity change on the READY item and a new line.
            val snapshot = listOf(EditLine(burger, "p1", "X-Burger", 1250, 2), EditLine(coke, "p2", "Coke", 600, 1))
            writer.updateOrder(
                id,
                "Mesa 1",
                false,
                null,
                snapshot,
                listOf(snapshot[0].copy(quantity = 3), snapshot[1], EditLine("", "p3", "Fries", 800, 1)),
            )
            val edited = upload()
            assertNoEmptyOrBlankOps(edited)
            assertEquals(
                listOf("order_items PATCH", "order_items PUT", "orders PATCH"),
                edited.map { it.first }.sorted(),
            )
            edited.filter { it.first.startsWith("order_items") }.forEach { assertNull(it.first, it.second) }
            val patch = edited.single { it.first == "orders PATCH" }.second!!
            assertEquals(setOf("items"), patch.keys)
            val sent =
                patch.getValue("items").jsonArray.associate {
                    it.jsonObject
                        .getValue("id")
                        .jsonPrimitive.content to
                        it.jsonObject
                            .getValue("quantity")
                            .jsonPrimitive.content
                            .toInt()
                }
            assertEquals(3, sent.size)
            assertEquals(3, sent[burger])
            assertEquals(1, sent[coke])

            // READY and back.
            writer.setItemsStatus(listOf(coke), ItemStatus.READY)
            writer.setItemsStatus(listOf(coke), ItemStatus.IN_PREPARATION)
            assertEquals(
                listOf(
                    "order_items PATCH" to JsonObject(mapOf("status" to status("READY"))),
                    "order_items PATCH" to JsonObject(mapOf("status" to status("IN_PREPARATION"))),
                ),
                upload(),
            )

            writer.closeOrder(id, PaymentMethod.PIX)
            val closed = upload()
            assertEquals(listOf("orders PATCH"), closed.map { it.first })
            assertEquals("""{"close":{"payment_method":"PIX"}}""", closed.single().second.toString())
        }

    @Test
    fun aLegacyReadyCardMovedBackUploadsItsStatus() =
        runTest {
            // An older client marks READY as IN_PREPARATION + kitchen_ready_at; the download wrote it.
            db.seedOrder("o1")
            db.seedItem("i1", "o1", "p1", 1, kitchenReadyAt = "2026-10-20 12:30:00.000")

            writer.setItemsStatus(listOf("i1"), ItemStatus.IN_PREPARATION)

            assertEquals(
                listOf("order_items PATCH" to JsonObject(mapOf("status" to status("IN_PREPARATION")))),
                upload(),
            )
        }

    @Test
    fun deliveryActionsGoAlone() =
        runTest {
            db.seedUser("d1", "Driver", role = "DRIVER")
            val id = writer.createOrder(lines, "Ana", true, "Rua A, 1")
            upload()

            writer.assignDriver(id, "d1")
            val assigned = upload()
            assertEquals(listOf("orders PATCH"), assigned.map { it.first })
            assertEquals("""{"delivery":{"action":"ASSIGN","driver_id":"d1"}}""", assigned.single().second.toString())

            writer.setItemsStatus(itemIds(id), ItemStatus.READY)
            upload()
            writer.startDelivery(id, confirmReady = false)
            val started = upload()
            assertNoEmptyOrBlankOps(started)
            assertEquals(listOf("orders PATCH"), started.map { it.first })
            assertEquals("""{"delivery":{"action":"START"}}""", started.single().second.toString())
        }

    private fun status(value: String) = kotlinx.serialization.json.JsonPrimitive(value)

    private companion object {
        const val DEVICE = "device-1"
    }
}
