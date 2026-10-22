package uk.tozzo.app.feature.sell

import androidx.lifecycle.SavedStateHandle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import uk.tozzo.app.core.data.CartLine
import uk.tozzo.app.core.data.CatalogRepository
import uk.tozzo.app.core.data.OrderWriter
import uk.tozzo.app.core.data.SaleWriter
import uk.tozzo.app.core.session.Binding
import uk.tozzo.app.core.session.DeviceBinding
import uk.tozzo.app.domain.BusinessModule
import uk.tozzo.app.domain.BusinessProfile
import uk.tozzo.app.domain.EstablishmentModules
import uk.tozzo.app.domain.PaymentMethod
import uk.tozzo.app.domain.Product
import uk.tozzo.app.testing.MemoryStore
import uk.tozzo.app.testing.RobolectricSql
import uk.tozzo.app.testing.foodOwnerBinding
import java.time.Clock

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class SellViewModelTest {
    private lateinit var sql: RobolectricSql
    private val burger = Product("p1", "X-Burger", 1250, null, null, null)
    private val coke = Product("p2", "Coke", 600, null, null, null)

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

    private suspend fun viewModel(
        handle: SavedStateHandle = SavedStateHandle(),
        binding: Binding = foodOwnerBinding(),
    ): SellViewModel {
        val deviceBinding = DeviceBinding(MemoryStore())
        deviceBinding.save(binding)
        val clock = Clock.systemUTC()
        return SellViewModel(
            handle,
            CatalogRepository(sql),
            SaleWriter(sql, deviceBinding, clock),
            OrderWriter(sql, deviceBinding, clock),
            deviceBinding,
        )
    }

    private suspend fun count(table: String) = sql.getAll("SELECT id FROM $table", emptyList()) { it.string("id") }.size

    @Test
    fun theSameProductAddsToTheQuantity() =
        runTest {
            val vm = viewModel()

            vm.add(burger)
            vm.add(burger)
            vm.add(coke)

            assertEquals(listOf(CartLine("p1", "X-Burger", 1250, 2), CartLine("p2", "Coke", 600, 1)), vm.cart.value)
            assertEquals(3, vm.cartCount.value)
            assertEquals(3100L, vm.totalCents.value)
        }

    @Test
    fun decreasingAtOneRemovesTheLine() =
        runTest {
            val vm = viewModel()
            vm.add(burger)
            vm.add(burger)

            vm.decrease("p1")
            assertEquals(
                1,
                vm.cart.value
                    .single()
                    .quantity,
            )
            vm.decrease("p1")

            assertTrue(vm.cart.value.isEmpty())
        }

    @Test
    fun quantityStopsAt10000() =
        runTest {
            val vm =
                viewModel(
                    SavedStateHandle(
                        mapOf(
                            "cart" to """[{"productId":"p1","name":"X","unitPriceCents":1,"quantity":10000}]""",
                        ),
                    ),
                )

            vm.increase("p1")
            vm.add(Product("p1", "X", 1, null, null, null))

            assertEquals(
                10_000,
                vm.cart.value
                    .single()
                    .quantity,
            )
        }

    @Test
    fun theCartSurvivesARecreatedSavedStateHandle() =
        runTest {
            val handle = SavedStateHandle()
            val first = viewModel(handle)
            first.add(burger)
            first.add(burger)
            first.setCustomerName("Mesa 3")

            // The process dies: the handle's content is all that is left.
            val restored = SavedStateHandle(handle.keys().associateWith { handle.get<Any>(it) })
            val second = viewModel(restored)

            assertEquals(listOf(CartLine("p1", "X-Burger", 1250, 2)), second.cart.value)
            assertEquals("Mesa 3", second.customerName.value)
        }

    @Test
    fun generateOrderIsHiddenWithoutTheOrdersModule() =
        runTest {
            val withoutOrders =
                foodOwnerBinding().copy(
                    modules =
                        EstablishmentModules(
                            "restaurant",
                            listOf(BusinessProfile.FOOD),
                            listOf(BusinessModule.KITCHEN),
                        ),
                )

            assertFalse(viewModel(binding = withoutOrders).canGenerateOrder.value)
            assertTrue(viewModel().canGenerateOrder.value)
        }

    @Test
    fun directSaleWritesClearsTheCartAndReportsIt() =
        runTest {
            val vm = viewModel()
            vm.add(burger)
            vm.setPayment(PaymentMethod.CASH)

            vm.sellDirect()

            assertEquals(1, count("sales"))
            assertTrue(vm.cart.value.isEmpty())
            assertEquals(SellResult.SALE_SAVED, vm.result.value)
        }

    @Test
    fun newOrderWritesAndClears() =
        runTest {
            val vm = viewModel()
            vm.add(burger)
            vm.setDelivery(true)
            vm.setAddress("Rua A, 10")

            vm.createOrder()

            assertEquals(1, count("orders"))
            assertEquals(1, count("order_items"))
            assertTrue(vm.cart.value.isEmpty())
            assertEquals(SellResult.ORDER_CREATED, vm.result.value)
        }

    @Test
    fun deliveryWithoutAddressDoesNotWrite() =
        runTest {
            val vm = viewModel()
            vm.add(burger)
            vm.setDelivery(true)
            vm.setAddress("   ")

            assertFalse(vm.canCreateOrder.value)
            vm.createOrder()

            assertEquals(0, count("orders"))
            assertEquals(1, vm.cart.value.size)
        }

    @Test
    fun aZeroTotalCartCannotBeSubmitted() =
        runTest {
            val vm = viewModel()
            vm.add(Product("free", "Brinde", 0, null, null, null))

            assertFalse(vm.canSell.value)
            assertFalse(vm.canCreateOrder.value)
            vm.sellDirect()

            assertEquals(0, count("sales"))
        }

    @Test
    fun clearEmptiesTheCartAndTheForm() =
        runTest {
            val vm = viewModel()
            vm.add(burger)
            vm.setCustomerName("x")

            vm.clear()

            assertTrue(vm.cart.value.isEmpty())
            assertEquals("", vm.customerName.value)
        }
}
