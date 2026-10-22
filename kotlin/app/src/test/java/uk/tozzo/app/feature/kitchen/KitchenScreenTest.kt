package uk.tozzo.app.feature.kitchen

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import uk.tozzo.app.core.data.KitchenRepository
import uk.tozzo.app.core.data.LocalSql
import uk.tozzo.app.core.data.OrderWriter
import uk.tozzo.app.core.data.SqlTx
import uk.tozzo.app.core.session.DeviceBinding
import uk.tozzo.app.testing.MemoryStore
import uk.tozzo.app.testing.RobolectricSql
import uk.tozzo.app.testing.foodOwnerBinding
import uk.tozzo.app.testing.seedItem
import uk.tozzo.app.testing.seedOrder
import uk.tozzo.app.testing.seedProduct
import uk.tozzo.app.ui.theme.TozzoTheme
import java.time.Clock

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "pt-rBR-w411dp-h2400dp")
class KitchenScreenTest {
    @get:Rule
    val rule = createComposeRule()

    private lateinit var sql: RobolectricSql

    @Before
    fun setUp() =
        runBlocking {
            sql = RobolectricSql()
            sql.seedProduct("p1", "X-Burger", "12.50")
            sql.seedProduct("p2", "Coke", "6.00")
            sql.seedOrder("abcdef123", customer = null)
            sql.seedItem("i1", "abcdef123", "p1", 2)
            sql.seedItem("i2", "abcdef123", "p2", 1)
            sql.seedItem("i3", "abcdef123", "p2", 1, status = "READY")
        }

    @After
    fun tearDown() = sql.close()

    private fun show(writes: LocalSql = sql): KitchenViewModel {
        val binding = DeviceBinding(MemoryStore())
        runBlocking { binding.save(foodOwnerBinding()) }
        val viewModel = KitchenViewModel(KitchenRepository(sql), OrderWriter(writes, binding, Clock.systemUTC()))
        rule.setContent { TozzoTheme { KitchenRoute(viewModel = viewModel) } }
        return viewModel
    }

    @Test
    fun tabCountersAndMarkReadyCallTheViewModel() {
        show()
        rule.onNodeWithText("Em preparo (2)").assertIsDisplayed()
        rule.onNodeWithText("Pronto (1)").assertIsDisplayed()
        rule.onNodeWithText("2x X-Burger").assertIsDisplayed()
        rule.onAllNodesWithText("Pedido abcdef").assertCountEquals(2)

        rule.onAllNodesWithText("Marcar pronto")[0].performClick()
        rule.waitForIdle()

        val statuses =
            runBlocking { sql.getAll("SELECT status FROM order_items ORDER BY id") { it.string("status") } }
        assertEquals(listOf("READY", "IN_PREPARATION", "READY"), statuses)
        rule.onNodeWithText("Em preparo (1)").assertIsDisplayed()
        rule.onNodeWithText("Pronto (2)").assertIsDisplayed()
    }

    @Test
    fun backToPreparationAndInfoDialog() {
        show()
        rule.onNodeWithText("Pronto (1)").performClick()
        rule.onNodeWithText("Voltar para preparo").assertIsDisplayed()

        rule.onNodeWithContentDescription("Ver informações do item").performClick()

        rule.onNodeWithText("Informações do pedido").assertIsDisplayed()
        rule.onNodeWithText("abcdef123").assertIsDisplayed()
    }

    @Test
    fun aRefusedMoveShowsTheWebTextOnceAndClears() {
        // The order changed on the server meanwhile: the write is refused and the card stays on screen.
        val refusing =
            object : LocalSql by sql {
                override suspend fun <T> writeTransaction(block: suspend (SqlTx) -> T): T =
                    throw IllegalStateException("the order is closed")
            }
        val viewModel = show(refusing)

        rule.onAllNodesWithText("Marcar pronto")[0].performClick()
        rule.waitForIdle()

        rule.onNodeWithText("A comanda mudou. A fila será atualizada em breve.").assertIsDisplayed()
        assertFalse(viewModel.moveFailed.value)
    }
}
