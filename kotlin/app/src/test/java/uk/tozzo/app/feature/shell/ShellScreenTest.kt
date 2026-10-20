package uk.tozzo.app.feature.shell

import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
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
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import uk.tozzo.app.core.sync.SyncState
import uk.tozzo.app.domain.AppDestination
import uk.tozzo.app.testing.foodOwnerBinding
import uk.tozzo.app.ui.theme.TozzoTheme

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "pt-rBR")
class ShellScreenTest {
    @get:Rule
    val rule = createComposeRule()

    private var badge by mutableStateOf(SyncBadgeState(SyncState.SYNCED, rejections = 0))

    private fun show(paymentRequired: Boolean = false) =
        rule.setContent {
            TozzoTheme {
                ShellScreen(
                    binding = foodOwnerBinding(),
                    start = AppDestination.SELL,
                    badge = badge,
                    paymentRequired = paymentRequired,
                    settingsContent = { Text("settings-content") },
                    rejectionsContent = { Text("rejections-content") },
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
        rule.onNodeWithText("Disponível em breve").assertIsDisplayed()
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
}
