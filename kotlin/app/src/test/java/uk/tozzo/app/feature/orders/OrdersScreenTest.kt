package uk.tozzo.app.feature.orders

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import uk.tozzo.app.core.data.OrderRepository
import uk.tozzo.app.testing.RobolectricSql
import uk.tozzo.app.testing.seedItem
import uk.tozzo.app.testing.seedOrder
import uk.tozzo.app.testing.seedProduct
import uk.tozzo.app.testing.seedUser
import uk.tozzo.app.ui.theme.TozzoTheme

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "pt-rBR-w411dp-h2400dp")
class OrdersScreenTest {
    @get:Rule
    val rule = createComposeRule()

    private lateinit var sql: RobolectricSql

    @Before
    fun setUp() =
        runBlocking {
            sql = RobolectricSql()
            sql.seedUser("u1", "Ana")
            sql.seedProduct("p1", "X-Burger", "12.50")
            sql.seedProduct("p2", "Coke", "6.00")
            sql.seedOrder("a", customer = "Mesa 10", updatedAt = "2026-10-20 14:00:00.000")
            sql.seedItem("ia", "a", "p1", 2, "12.50")
            sql.seedItem("ib", "a", "p2", 1, "6.00")
            sql.seedOrder("b", customer = "Joao", isDelivery = 1, address = "Rua A, 10")
            sql.seedItem("ic", "b", "p1", 1, "12.50")
            sql.seedOrder(
                "c",
                customer = null,
                isDelivery = 1,
                address = "Rua B",
                deliveryStartedAt = "2026-10-20 13:00:00.000",
            )
        }

    @After
    fun tearDown() = sql.close()

    private fun show(
        onNew: () -> Unit = {},
        onEdit: (String) -> Unit = {},
    ) {
        val viewModel = OrdersViewModel(OrderRepository(sql))
        rule.setContent {
            TozzoTheme { OrdersRoute(onNewOrder = onNew, onEdit = onEdit, viewModel = viewModel) }
        }
    }

    @Test
    fun filtersOnlyApplyAfterSearch() {
        show()
        rule.onNodeWithText("Mesa 10").assertExists()
        rule.onNodeWithText("Joao").assertExists()

        rule.onNodeWithText("Cliente / Mesa").performTextInput("joao")
        rule.waitForIdle()
        rule.onNodeWithText("Mesa 10").assertExists()

        rule.onNodeWithText("Buscar").performClick()
        rule.waitForIdle()
        rule.onNodeWithText("Mesa 10").assertDoesNotExist()
        rule.onNodeWithText("Joao").assertExists()
    }

    @Test
    fun aRowShowsCustomerDeliveryLineSummarySellerAndTotal() {
        show()

        rule.onNodeWithText("2x X-Burger, 1x Coke").assertExists()
        rule.onNodeWithText("Pedido para entrega: Rua A, 10").assertExists()
        rule.onNodeWithText("Entregando: Rua B").assertExists()
        rule.onNodeWithText("Não informado").assertExists()
        rule.onAllNodesWithText("Criado por Ana").assertCountEquals(3)
    }

    @Test
    fun theNewOrderButtonAndRowsNavigate() {
        val events = mutableListOf<String>()
        show(onNew = { events += "new" }, onEdit = { events += "edit:$it" })

        rule.onNodeWithText("Novo pedido").performClick()
        rule.onNodeWithText("Mesa 10").performClick()

        assertEquals(listOf("new", "edit:a"), events)
    }
}
