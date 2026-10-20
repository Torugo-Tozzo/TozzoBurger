package uk.tozzo.app.feature.firstsync

import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import uk.tozzo.app.ui.theme.TozzoTheme

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "pt-rBR")
class FirstSyncScreenTest {
    @get:Rule
    val rule = createComposeRule()

    private var signOuts = 0

    private fun show(state: FirstSyncUiState) = rule.setContent { TozzoTheme { FirstSyncScreen(state) { signOuts++ } } }

    @Test
    fun downloadingShowsNoSignOut() {
        show(FirstSyncUiState(offline = false, failed = false))
        rule.onNodeWithText("Baixando os dados…").assertExists()
        rule.onNodeWithText("Sair").assertDoesNotExist()
    }

    @Test
    fun offlineAsksForAConnectionAndOffersSignOut() {
        show(FirstSyncUiState(offline = true, failed = false))
        rule.onNodeWithText("Conecte-se à internet para baixar os dados").assertExists()
        rule.onNodeWithText("Sair").performClick()
        assertEquals(1, signOuts)
    }

    @Test
    fun failureShowsTheErrorAndSignOut() {
        show(FirstSyncUiState(offline = false, failed = true))
        rule.onNodeWithText("Não foi possível baixar os dados", substring = true).assertExists()
        rule.onNodeWithText("Sair").performClick()
        assertEquals(1, signOuts)
    }
}
