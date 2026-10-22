package uk.tozzo.app.feature.deliveries

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import uk.tozzo.app.core.data.DeliveryRepository
import uk.tozzo.app.core.data.OrderWriter
import uk.tozzo.app.core.session.DeviceBinding
import uk.tozzo.app.domain.Role
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
class DeliveriesScreenTest {
    @get:Rule
    val rule = createComposeRule()

    private lateinit var sql: RobolectricSql
    private val viewed = mutableListOf<String>()

    @Before
    fun setUp() =
        runBlocking {
            sql = RobolectricSql()
            sql.seedProduct("p1", "X-Burger", "12.50")
            sql.seedProduct("p2", "Coke", "6.00")
            sql.seedOrder(
                "abcdef123",
                customer = "Maria",
                isDelivery = 1,
                address = "Rua A, 10",
                externalDriverName = "Joao iFood",
                externalDriverPhone = "11999",
            )
            sql.seedItem("i1", "abcdef123", "p1", 2, status = "READY")
            sql.seedItem("i2", "abcdef123", "p2", 1)
            sql.seedOrder(
                "zzzzzz999",
                customer = null,
                isDelivery = 1,
                address = "Rua B",
                deliveryStartedAt = "2026-10-20 12:40:00.000",
                openedAt = "2026-10-20 12:05:00.000",
            )
        }

    @After
    fun tearDown() = sql.close()

    private fun show(role: Role = Role.MANAGER) {
        val binding = DeviceBinding(MemoryStore())
        runBlocking { binding.save(foodOwnerBinding(role)) }
        val viewModel =
            DeliveriesViewModel(DeliveryRepository(sql), OrderWriter(sql, binding, Clock.systemUTC()), binding)
        rule.setContent { TozzoTheme { DeliveriesRoute(onView = { viewed += it }, viewModel = viewModel) } }
    }

    @Test
    fun theCardShowsTheExternalDriverWithPhone() {
        show()

        rule.onNodeWithText("Aguardando (1)").assertIsDisplayed()
        rule.onNodeWithText("Entregando (1)").assertIsDisplayed()
        rule.onNodeWithText("Maria").assertIsDisplayed()
        rule.onNodeWithText("Rua A, 10").assertIsDisplayed()
        rule.onNodeWithText("Entregador: Joao iFood · 11999").assertIsDisplayed()
        rule.onNodeWithText("2x X-Burger · Pronto").assertIsDisplayed()
        rule.onNodeWithText("1x Coke · Em preparo").assertIsDisplayed()
        rule.onNodeWithText("Editar entregador").assertIsDisplayed()
    }

    @Test
    fun startAsksToConfirmPendingItemsAndTheDeliveringTabHasFinish() {
        show()

        rule.onNodeWithText("Saiu para entrega").performClick()
        rule.onNodeWithText("Itens ainda não estão prontos").assertIsDisplayed()
        rule.onNodeWithText("1x Coke").assertIsDisplayed()
        rule.onNodeWithText("Confirmar e sair para entrega").performClick()
        rule.waitForIdle()

        rule.onNodeWithText("Entregando (2)").performClick()
        rule.onNodeWithText("Pedido zzzzzz").assertIsDisplayed()
        rule.onAllNodesWithText("Finalizar entrega")[0].assertIsEnabled()
        rule.onAllNodesWithText("Voltar para aguardando").assertCountEquals(2)
    }

    @Test
    fun viewOrderOpensTheOrderReadOnly() {
        show()

        rule.onNodeWithText("Ver pedido").performClick()

        assertEquals(listOf("abcdef123"), viewed)
    }

    @Test
    fun aDriverSeesOnlyStartAndView() {
        show(Role.DRIVER)

        rule.onNodeWithText("Saiu para entrega").assertIsEnabled()
        rule.onNodeWithText("Ver pedido").assertIsDisplayed()
        rule.onAllNodesWithText("Editar entregador").assertCountEquals(0)
        rule.onAllNodesWithText("Entregadores").assertCountEquals(0)
    }
}
