package uk.tozzo.app.feature.deliveries

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
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import uk.tozzo.app.core.data.DeliveryRepository
import uk.tozzo.app.core.data.DeliveryStage
import uk.tozzo.app.core.data.OrderView
import uk.tozzo.app.core.data.OrderWriter
import uk.tozzo.app.core.session.DeviceBinding
import uk.tozzo.app.domain.PaymentMethod
import uk.tozzo.app.domain.Role
import uk.tozzo.app.testing.MemoryStore
import uk.tozzo.app.testing.RobolectricSql
import uk.tozzo.app.testing.foodOwnerBinding
import uk.tozzo.app.testing.seedItem
import uk.tozzo.app.testing.seedOrder
import uk.tozzo.app.testing.seedProduct
import uk.tozzo.app.testing.seedUser
import java.time.Clock

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class DeliveriesViewModelTest {
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

    private suspend fun viewModel(role: Role = Role.MANAGER): DeliveriesViewModel {
        val binding = DeviceBinding(MemoryStore())
        binding.save(foodOwnerBinding(role))
        return DeliveriesViewModel(DeliveryRepository(sql), OrderWriter(sql, binding, Clock.systemUTC()), binding)
    }

    private suspend fun seed(itemStatus: String) {
        sql.seedProduct("p1", "X-Burger", "12.50")
        sql.seedOrder("o1", isDelivery = 1, address = "Rua A")
        sql.seedItem("i1", "o1", "p1", 2, status = itemStatus)
    }

    private suspend fun started() =
        sql.getAll("SELECT delivery_started_at AS s FROM orders WHERE id = 'o1'") { it.string("s") }.single()

    private fun kotlinx.coroutines.test.TestScope.watch(vm: DeliveriesViewModel): OrderView {
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { vm.board.collect {} }
        backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { vm.drivers.collect {} }
        return vm.board.value!!
            .getValue(DeliveryStage.WAITING)
            .single()
    }

    @Test
    fun startWithAPendingItemAsksForConfirmation() =
        runTest {
            seed("IN_PREPARATION")
            val vm = viewModel()
            val order = watch(vm)

            vm.start(order)

            assertEquals(order, vm.confirmStart.value)
            assertNull(started())

            vm.confirmStart()

            assertNotNull(started())
            assertNull(vm.confirmStart.value)
            assertEquals(
                1,
                vm.board.value!!
                    .getValue(DeliveryStage.DELIVERING)
                    .size,
            )
            assertEquals(
                listOf("IN_PREPARATION"),
                sql.getAll("SELECT status FROM order_items") { it.string("status") },
            )
        }

    @Test
    fun startWithEveryItemReadyWritesAtOnce() =
        runTest {
            seed("READY")
            val vm = viewModel()
            val order = watch(vm)

            vm.start(order)

            assertNull(vm.confirmStart.value)
            assertNotNull(started())
            assertNull(vm.error.value)
        }

    @Test
    fun anOrderWithoutItemsDoesNotStart() =
        runTest {
            sql.seedOrder("o1", isDelivery = 1, address = "Rua A")
            val vm = viewModel()
            val order = watch(vm)

            vm.start(order)

            assertNull(vm.confirmStart.value)
            assertNull(started())
        }

    @Test
    fun aDriverHasNoManagementActions() =
        runTest {
            seed("READY")
            val vm = viewModel(Role.DRIVER)
            val order = watch(vm)
            assertFalse(vm.canManage)

            vm.openAssign(order)
            vm.openFinish(order)
            vm.unassign(order)
            vm.assignExternal(order, "Joao", null)

            assertNull(vm.assignTarget.value)
            assertNull(vm.finishTarget.value)
            assertEquals(
                listOf(null),
                sql.getAll("SELECT delivery_json AS j FROM orders") { it.string("j") },
            )

            vm.start(order)
            assertNotNull(started())
            vm.back(order)
            assertNotNull(started())
        }

    @Test
    fun aBusyDriverCannotBeChosen() =
        runTest {
            seed("READY")
            sql.seedUser("dr1", "Beto", role = "DRIVER")
            sql.seedUser("dr2", "Ana", role = "DRIVER")
            sql.seedOrder("o2", isDelivery = 1, driverId = "dr1", deliveryStartedAt = "2026-10-20 12:40:00.000")
            val vm = viewModel()
            val order = watch(vm)
            assertEquals(listOf(true, false), vm.drivers.value.map { it.available })

            vm.openAssign(order)
            vm.assignDriver(order, "dr1")

            assertEquals(DeliveryError.DRIVER_BUSY, vm.error.value)
            assertNotNull(vm.assignTarget.value)
            assertEquals(
                null,
                sql.getAll("SELECT driver_id AS d FROM orders WHERE id = 'o1'") { it.string("d") }.single(),
            )

            vm.assignDriver(order, "dr2")

            assertNull(vm.error.value)
            assertNull(vm.assignTarget.value)
            assertEquals(
                "dr2",
                sql.getAll("SELECT driver_id AS d FROM orders WHERE id = 'o1'") { it.string("d") }.single(),
            )
        }

    @Test
    fun finishClosesTheDeliveringOrderWithThePayment() =
        runTest {
            seed("READY")
            val vm = viewModel()
            val order = watch(vm)
            vm.start(order)
            val delivering =
                vm.board.value!!
                    .getValue(DeliveryStage.DELIVERING)
                    .single()

            vm.openFinish(delivering)
            assertEquals(delivering, vm.finishTarget.value)
            vm.finish(delivering, PaymentMethod.PIX)

            assertNull(vm.finishTarget.value)
            assertTrue(
                vm.board.value!!
                    .values
                    .all { it.isEmpty() },
            )
            assertEquals(
                """{"payment_method":"PIX"}""",
                sql.getAll("SELECT close_json AS c FROM orders") { it.string("c") }.single(),
            )
        }
}
