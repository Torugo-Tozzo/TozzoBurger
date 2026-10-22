package uk.tozzo.app.feature.shell

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotDisplayed
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import uk.tozzo.app.core.sync.SyncState
import uk.tozzo.app.domain.AppDestination
import uk.tozzo.app.domain.Role
import uk.tozzo.app.testing.foodOwnerBinding
import uk.tozzo.app.ui.icons.TozzoIcons
import uk.tozzo.app.ui.theme.TozzoTheme

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "pt-rBR")
class ShellScreenTest {
    @get:Rule
    val rule = createComposeRule()

    private var badge by mutableStateOf(SyncBadgeState(SyncState.SYNCED, rejections = 0))

    private var signOuts = 0

    private var exits = 0

    private fun show(
        paymentRequired: Boolean = false,
        role: Role = Role.OWNER,
        start: AppDestination = AppDestination.SELL,
    ) = rule.setContent {
        TozzoTheme {
            ShellScreen(
                binding = foodOwnerBinding(role),
                start = start,
                badge = badge,
                paymentRequired = paymentRequired,
                onSignOut = { signOuts++ },
                settingsContent = { Text("settings-content") },
                rejectionsContent = { Text("rejections-content") },
                sellContent = { Text("sell-content") },
                ordersContent = { onNew, onEdit ->
                    Column {
                        Text("new-order", Modifier.clickable(onClick = onNew))
                        Text("edit-order", Modifier.clickable { onEdit("o-1") })
                    }
                },
                orderEditContent = { onExit ->
                    Text(
                        "edit-content",
                        Modifier.clickable {
                            exits++
                            onExit()
                        },
                    )
                },
            )
        }
    }

    private fun openDrawer() = rule.onNodeWithContentDescription("Abrir menu").performClick()

    @Test
    fun drawerShowsTheGroupsWithSellFirst() {
        show()
        openDrawer()
        rule.onNodeWithText("Operação").assertIsDisplayed()
        rule.onNodeWithText("Cadastro").performScrollTo().assertIsDisplayed()
        rule.onNodeWithText("Gestão").performScrollTo().assertIsDisplayed()
        rule.onNodeWithText("Burger da Ana").assertIsDisplayed()
        rule.onNodeWithText("Proprietário").assertIsDisplayed()
        rule.onAllNodesWithTag(DRAWER_ITEM_TAG)[0].assert(hasText("Vender"))
        rule.onAllNodesWithTag(DRAWER_ITEM_TAG).let { items ->
            val last = items.fetchSemanticsNodes().size - 1
            items[last].assert(hasText("Configurações"))
        }
    }

    @Test
    fun tappingOrdersClosesTheDrawerAndShowsItsTitle() {
        show()
        rule.onNodeWithTag(SHELL_TITLE_TAG).assertTextEquals("Vender")
        openDrawer()
        rule.onNodeWithTag(DRAWER_TAG).assertIsDisplayed()
        rule.onNodeWithText("Pedidos").performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(DRAWER_TAG).assertIsNotDisplayed()
        rule.onNodeWithTag(SHELL_TITLE_TAG).assertTextEquals("Pedidos")
        rule.onNodeWithText("new-order").assertIsDisplayed()
    }

    @Test
    fun theOrdersListOpensTheEditorAndSell() {
        show(start = AppDestination.ORDERS)

        rule.onNodeWithText("edit-order").performClick()
        rule.onNodeWithTag(SHELL_TITLE_TAG).assertTextEquals("Editar pedido")
        rule.onNodeWithText("edit-content").performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(SHELL_TITLE_TAG).assertTextEquals("Pedidos")
        assertEquals(1, exits)

        rule.onNodeWithText("new-order").performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(SHELL_TITLE_TAG).assertTextEquals("Vender")
    }

    @Test
    fun settingsOpensTheSettingsContent() {
        show()
        openDrawer()
        rule.onNodeWithText("Configurações").performClick()
        rule.onNodeWithText("settings-content").assertIsDisplayed()
    }

    @Test
    fun badgeShowsTheSyncState() {
        show()
        rule.onNodeWithTag(SYNC_BADGE_TAG).assert(hasText("Sincronizado"))
        badge = SyncBadgeState(SyncState.OFFLINE, rejections = 0)
        rule.onNodeWithTag(SYNC_BADGE_TAG).assert(hasText("Offline"))
        badge = SyncBadgeState(SyncState.SYNCING, rejections = 0)
        rule.onNodeWithTag(SYNC_BADGE_TAG).assert(hasText("Sincronizando"))
        badge = SyncBadgeState(SyncState.FIRST_SYNC_PENDING, rejections = 0)
        rule.onNodeWithTag(SYNC_BADGE_TAG).assert(hasText("Aguardando sincronização"))
        badge = SyncBadgeState(SyncState.OFFLINE, rejections = 3)
        rule.onNodeWithTag(SYNC_BADGE_TAG).assert(hasText("3 recusas"))
        badge = SyncBadgeState(SyncState.SYNCED, rejections = 1)
        rule.onNodeWithTag(SYNC_BADGE_TAG).assert(hasText("1 recusa"))
    }

    @Test
    fun tappingTheBadgeWithRejectionsOpensTheRejections() {
        badge = SyncBadgeState(SyncState.SYNCED, rejections = 2)
        show()
        rule.onNodeWithTag(SYNC_BADGE_TAG).performClick()
        rule.onNodeWithText("rejections-content").assertIsDisplayed()
        rule.onNodeWithTag(SHELL_TITLE_TAG).assertTextEquals("Recusas")
    }

    @Test
    fun tappingTheBadgeWithoutRejectionsStays() {
        show()
        rule.onNodeWithTag(SYNC_BADGE_TAG).performClick()
        rule.onNodeWithText("rejections-content").assertDoesNotExist()
        rule.onNodeWithTag(SHELL_TITLE_TAG).assertTextEquals("Vender")
    }

    @Test
    fun paymentRequiredShowsTheBanner() {
        show(paymentRequired = true)
        rule
            .onNodeWithText("Pagamento pendente. Regularize no site para continuar usando o Tozzo.")
            .assertIsDisplayed()
    }

    @Test
    fun drawerItemsHaveIcons() {
        show()
        openDrawer()
        val items = rule.onAllNodesWithTag(DRAWER_ITEM_TAG).fetchSemanticsNodes().size
        assertTrue(items > 1)
        val icons = rule.onAllNodesWithTag(DRAWER_ICON_TAG, useUnmergedTree = true).fetchSemanticsNodes().size
        assertEquals(items, icons)
    }

    @Test
    fun everyDestinationHasItsOwnIcon() {
        val icons = AppDestination.entries.map { TozzoIcons.forDestination(it) }
        assertEquals(AppDestination.entries.size, icons.size)
        icons.forEach { assertTrue(it.defaultWidth.value == 24f && it.root.size > 0) }
    }

    @Test
    fun cookHasNoDrawer() = noDrawerFor(Role.COOK, AppDestination.KITCHEN, "Cozinha")

    @Test
    fun driverHasNoDrawer() = noDrawerFor(Role.DRIVER, AppDestination.DELIVERIES, "Entregas")

    private fun noDrawerFor(
        role: Role,
        start: AppDestination,
        title: String,
    ) {
        show(role = role, start = start)
        rule.onNodeWithContentDescription("Abrir menu").assertDoesNotExist()
        rule.onNodeWithTag(DRAWER_TAG).assertDoesNotExist()
        rule.onNodeWithTag(SHELL_TITLE_TAG).assertTextEquals(title)
        rule.onNodeWithTag(SYNC_BADGE_TAG).assertIsDisplayed()

        rule.onNodeWithContentDescription("Mais opções").performClick()
        rule.onNodeWithText("Configurações").assertIsDisplayed()
        rule.onNodeWithText("Sair").assertIsDisplayed()

        rule.onNodeWithText("Sair").performClick()
        assertEquals(1, signOuts)
    }

    @Test
    fun cookMenuOpensTheSettings() {
        show(role = Role.COOK, start = AppDestination.KITCHEN)
        rule.onNodeWithContentDescription("Mais opções").performClick()
        rule.onNodeWithText("Configurações").performClick()
        rule.onNodeWithText("settings-content").assertIsDisplayed()
        rule.onNodeWithTag(SHELL_TITLE_TAG).assertTextEquals("Configurações")
    }

    @Test
    fun ownerKeepsTheDrawerAndHasNoMoreMenu() {
        show()
        rule.onNodeWithContentDescription("Abrir menu").assertIsDisplayed()
        rule.onNodeWithContentDescription("Mais opções").assertDoesNotExist()
    }
}
