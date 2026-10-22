package uk.tozzo.app.feature.sales

import androidx.compose.ui.test.filter
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onLast
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.lifecycle.SavedStateHandle
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import uk.tozzo.app.core.data.SaleRepository
import uk.tozzo.app.core.data.SaleWriter
import uk.tozzo.app.core.session.DeviceBinding
import uk.tozzo.app.testing.MemoryStore
import uk.tozzo.app.testing.RobolectricSql
import uk.tozzo.app.testing.foodOwnerBinding
import uk.tozzo.app.testing.seedProduct
import uk.tozzo.app.testing.seedSale
import uk.tozzo.app.testing.seedSaleItem
import uk.tozzo.app.testing.seedUser
import uk.tozzo.app.ui.theme.TozzoTheme
import java.time.Clock

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "pt-rBR-w411dp-h2400dp")
class SaleDetailScreenTest {
    @get:Rule
    val rule = createComposeRule()

    private lateinit var sql: RobolectricSql

    @Before
    fun setUp() =
        runBlocking {
            sql = RobolectricSql()
            sql.seedUser("u1", "Ana")
            sql.seedProduct("p1", "X-Burger", "99.00")
            sql.seedSale("a", total = "25.00", customer = "Mesa 10", payment = "PIX")
            sql.seedSaleItem("ia", "a", "p1", 2, "12.50")
        }

    @After
    fun tearDown() = sql.close()

    @Test
    fun showsTheLinesAtTheSalePriceAndCancelsAfterConfirming() {
        val binding = DeviceBinding(MemoryStore())
        runBlocking { binding.save(foodOwnerBinding()) }
        val viewModel =
            SaleDetailViewModel(
                SavedStateHandle(mapOf(SALE_ID_ARG to "a")),
                SaleRepository(sql),
                SaleWriter(sql, binding, Clock.systemUTC()),
            )
        var exits = 0
        rule.setContent { TozzoTheme { SaleDetailRoute(onExit = { exits++ }, viewModel = viewModel) } }
        rule.waitUntil(timeoutMillis = 10_000) { rule.onAllNodesWithText("Mesa 10").fetchSemanticsNodes().isNotEmpty() }

        rule.onNodeWithText("X-Burger").assertExists()
        rule.onNodeWithText("2 unidades × ", substring = true).assertExists()
        rule.onNodeWithText("Pix").assertExists()

        rule.onNodeWithText("Cancelar venda").performClick()
        rule.onNodeWithText("Tem certeza que deseja cancelar esta venda?").assertExists()
        rule
            .onAllNodesWithText("Cancelar venda")
            .filter(hasClickAction())
            .onLast()
            .performClick()
        rule.waitUntil(timeoutMillis = 10_000) { exits > 0 }

        val cancelled =
            runBlocking { sql.getAll("SELECT is_cancelled FROM sales WHERE id = 'a'") { it.long("is_cancelled") } }
        assertEquals(listOf(1L), cancelled)
    }
}
