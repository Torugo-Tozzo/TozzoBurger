package uk.tozzo.app.feature.kitchen

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
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import uk.tozzo.app.core.data.KitchenRepository
import uk.tozzo.app.core.data.OrderWriter
import uk.tozzo.app.core.session.DeviceBinding
import uk.tozzo.app.domain.KitchenStage
import uk.tozzo.app.testing.MemoryStore
import uk.tozzo.app.testing.RobolectricSql
import uk.tozzo.app.testing.foodOwnerBinding
import uk.tozzo.app.testing.seedItem
import uk.tozzo.app.testing.seedOrder
import uk.tozzo.app.testing.seedProduct
import java.time.Clock

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class KitchenViewModelTest {
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

    private suspend fun viewModel(): KitchenViewModel {
        val binding = DeviceBinding(MemoryStore())
        binding.save(foodOwnerBinding())
        return KitchenViewModel(KitchenRepository(sql), OrderWriter(sql, binding, Clock.systemUTC()))
    }

    private suspend fun statuses() = sql.getAll("SELECT status FROM order_items ORDER BY id") { it.string("status") }

    private suspend fun seed() {
        sql.seedProduct("p1", "X-Burger", "12.50")
        sql.seedOrder("o1")
        sql.seedItem("i1", "o1", "p1", 2)
        sql.seedItem("i2", "o1", "p1", 1)
    }

    @Test
    fun moveWritesEveryItemOfTheCard() =
        runTest {
            seed()
            val vm = viewModel()
            backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { vm.board.collect {} }
            val card =
                vm.board.value!!
                    .getValue(KitchenStage.IN_PREPARATION)
                    .single()
            assertEquals(listOf("i1", "i2"), card.itemIds)

            vm.move(card, KitchenStage.READY)

            assertEquals(listOf("READY", "READY"), statuses())
            assertEquals(
                3,
                vm.board.value!!
                    .getValue(KitchenStage.READY)
                    .single()
                    .quantity,
            )
            assertTrue(
                vm.board.value!!
                    .getValue(KitchenStage.IN_PREPARATION)
                    .isEmpty(),
            )

            vm.move(
                vm.board.value!!
                    .getValue(KitchenStage.READY)
                    .single(),
                KitchenStage.IN_PREPARATION,
            )

            assertEquals(listOf("IN_PREPARATION", "IN_PREPARATION"), statuses())
            assertFalse(vm.moveFailed.value)
        }

    @Test
    fun aRefusedMoveShowsTheErrorAndInfoOpensAndCloses() =
        runTest {
            seed()
            val vm = viewModel()
            backgroundScope.launch(UnconfinedTestDispatcher(testScheduler)) { vm.board.collect {} }
            val card =
                vm.board.value!!
                    .getValue(KitchenStage.IN_PREPARATION)
                    .single()
            sql.execute("UPDATE orders SET is_open = 0")

            vm.move(card, KitchenStage.READY)

            assertTrue(vm.moveFailed.value)
            assertEquals(listOf("IN_PREPARATION", "IN_PREPARATION"), statuses())
            vm.dismissError()
            assertFalse(vm.moveFailed.value)
            vm.showInfo(card)
            assertEquals(card, vm.info.value)
            vm.dismissInfo()
            assertEquals(null, vm.info.value)
        }
}
