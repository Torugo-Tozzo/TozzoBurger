package uk.tozzo.app.feature.orders

import androidx.lifecycle.SavedStateHandle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import uk.tozzo.app.core.data.CatalogRepository
import uk.tozzo.app.core.data.OrderRepository
import uk.tozzo.app.core.data.OrderWriter
import uk.tozzo.app.core.session.DeviceBinding
import uk.tozzo.app.domain.ItemStatus
import uk.tozzo.app.domain.PaymentMethod
import uk.tozzo.app.domain.Product
import uk.tozzo.app.testing.MemoryStore
import uk.tozzo.app.testing.RobolectricSql
import uk.tozzo.app.testing.foodOwnerBinding
import uk.tozzo.app.testing.seedItem
import uk.tozzo.app.testing.seedOrder
import uk.tozzo.app.testing.seedProduct
import java.time.Clock

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class OrderEditViewModelTest {
    private lateinit var sql: RobolectricSql

    @Before
    fun setUp() {
        Dispatchers.setMain(UnconfinedTestDispatcher())
        sql = RobolectricSql()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
        sql.close()
    }

    private suspend fun viewModel(orderId: String): OrderEditViewModel {
        val binding = DeviceBinding(MemoryStore())
        binding.save(foodOwnerBinding())
        return OrderEditViewModel(
            SavedStateHandle(mapOf("orderId" to orderId)),
            OrderRepository(sql),
            CatalogRepository(sql),
            OrderWriter(sql, binding, Clock.systemUTC()),
        )
    }

    private suspend fun seedPlain(id: String = "o1") {
        sql.seedProduct("p1", "X-Burger", "12.50")
        sql.seedOrder(id, customer = "Mesa 1")
        sql.seedItem("i1", id, "p1", 2, "12.50")
    }

    private suspend fun status(itemId: String) =
        sql.getAll("SELECT status FROM order_items WHERE id = ?", listOf(itemId)) { it.string("status") }.single()

    private fun kotlinx.coroutines.test.TestScope.collectExits(vm: OrderEditViewModel): List<OrderEditExit> {
        val exits = mutableListOf<OrderEditExit>()
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { vm.exits.collect { exits += it } }
        return exits
    }

    @Test
    fun loadsTheOrderIntoTheDraft() =
        runTest {
            seedPlain()
            val state = viewModel("o1").state.value

            assertTrue(state.loaded)
            assertEquals("Mesa 1", state.customer)
            assertEquals(listOf(2), state.lines.map { it.quantity })
            assertEquals(2500L, state.totalCents)
            assertTrue(state.canSave)
            assertFalse(state.dirty)
        }

    @Test
    fun deliveringBlocksSaveDeleteAndStatus() =
        runTest {
            sql.seedProduct("p1", "X-Burger", "12.50")
            sql.seedOrder("o1", isDelivery = 1, address = "Rua A", deliveryStartedAt = "2026-10-20 13:00:00.000")
            sql.seedItem("i1", "o1", "p1", 1)
            val vm = viewModel("o1")
            val exits = collectExits(vm)

            val state = vm.state.value
            assertTrue(state.delivering)
            assertFalse(state.canSave)
            assertFalse(state.canDelete)
            assertFalse(state.canChangeStatus)
            vm.setStatus("i1", ItemStatus.READY)
            vm.save()
            vm.delete()

            assertEquals("IN_PREPARATION", status("i1"))
            assertEquals(1, sql.getAll("SELECT id FROM orders", emptyList()) { it.string("id") }.size)
            assertTrue(exits.isEmpty())
        }

    @Test
    fun aDeliveryOrderShowsNoCloseButton() =
        runTest {
            sql.seedOrder("d", isDelivery = 1, address = "Rua A")
            sql.seedItem("i9", "d", "p1", 1)
            seedPlain()

            assertFalse(viewModel("d").state.value.showClose)
            assertTrue(viewModel("o1").state.value.showClose)
        }

    @Test
    fun closingNeedsItemsAndNoUnsavedChanges() =
        runTest {
            sql.seedOrder("empty")
            val empty = viewModel("empty")
            assertTrue(empty.state.value.showClose)
            assertFalse(empty.state.value.canClose)

            seedPlain()
            val vm = viewModel("o1")
            assertTrue(vm.state.value.canClose)
            vm.increase(
                vm.state.value.lines[0]
                    .id,
            )
            assertTrue(vm.state.value.dirty)
            assertFalse(vm.state.value.canClose)
        }

    @Test
    fun closedOnTheServerEmitsTheLeaveEvent() =
        runTest {
            seedPlain()
            val vm = viewModel("o1")
            val exits = collectExits(vm)

            sql.execute("UPDATE orders SET is_open = 0 WHERE id = 'o1'")

            assertEquals(listOf(OrderEditExit.ALREADY_CLOSED), exits)
        }

    @Test
    fun deletedOnTheServerEmitsTheLeaveEvent() =
        runTest {
            seedPlain()
            val vm = viewModel("o1")
            val exits = collectExits(vm)

            sql.execute("DELETE FROM orders WHERE id = 'o1'")

            assertEquals(listOf(OrderEditExit.ALREADY_CLOSED), exits)
        }

    @Test
    fun anOrderThatDoesNotExistLeavesRightAway() =
        runTest {
            val vm = viewModel("nope")
            val exits = collectExits(vm)

            assertEquals(listOf(OrderEditExit.ALREADY_CLOSED), exits)
        }

    @Test
    fun closingHereLeavesWithoutTheClosedWarning() =
        runTest {
            seedPlain()
            val vm = viewModel("o1")
            val exits = collectExits(vm)

            vm.setPayment(PaymentMethod.PIX)
            vm.close()

            assertEquals(listOf(OrderEditExit.CLOSED), exits)
            assertEquals(
                """{"payment_method":"PIX"}""",
                sql
                    .getAll(
                        "SELECT close_json FROM orders WHERE id = 'o1'",
                        emptyList(),
                    ) { it.string("close_json") }
                    .single(),
            )
        }

    @Test
    fun deletingHereLeavesWithoutTheClosedWarning() =
        runTest {
            seedPlain()
            val vm = viewModel("o1")
            val exits = collectExits(vm)

            vm.delete()

            assertEquals(listOf(OrderEditExit.DELETED), exits)
            assertEquals(0, sql.getAll("SELECT id FROM orders", emptyList()) { it.string("id") }.size)
        }

    @Test
    fun savingWritesTheDraftAndLeaves() =
        runTest {
            seedPlain()
            val vm = viewModel("o1")
            val exits = collectExits(vm)

            vm.setCustomer("Mesa 2")
            vm.decrease(
                vm.state.value.lines[0]
                    .id,
            )
            vm.add(Product("p2", "Coke", 600, null, null, null))
            vm.save()

            assertEquals(listOf(OrderEditExit.SAVED), exits)
            val items =
                sql.getAll("SELECT product_id, quantity FROM order_items ORDER BY product_id", emptyList()) {
                    it.string("product_id") to it.long("quantity")
                }
            assertEquals(listOf("p1" to 1L, "p2" to 1L), items)
            assertEquals(
                "Mesa 2",
                sql.getAll("SELECT customer_name FROM orders", emptyList()) { it.string("customer_name") }.single(),
            )
        }

    @Test
    fun savingADeliveryWithoutAddressAsksForIt() =
        runTest {
            seedPlain()
            val vm = viewModel("o1")
            val exits = collectExits(vm)

            vm.setDelivery(true)
            vm.save()

            assertEquals(OrderEditMessage.ADDRESS_REQUIRED, vm.message.value)
            assertTrue(exits.isEmpty())
            vm.consumeMessage()
            assertNull(vm.message.value)
        }

    @Test
    fun theStatusSelectorWritesAtOnce() =
        runTest {
            seedPlain()
            val vm = viewModel("o1")

            vm.setStatus("i1", ItemStatus.DELIVERED)

            assertEquals("DELIVERED", status("i1"))
            assertEquals(
                ItemStatus.DELIVERED,
                vm.state.value.order
                    ?.items
                    ?.single()
                    ?.status,
            )
        }
}
