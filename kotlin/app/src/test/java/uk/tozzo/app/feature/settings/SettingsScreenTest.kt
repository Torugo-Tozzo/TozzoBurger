package uk.tozzo.app.feature.settings

import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import uk.tozzo.app.R
import uk.tozzo.app.ui.theme.TozzoTheme

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "pt-rBR")
class SettingsScreenTest {
    @get:Rule
    val rule = createComposeRule()

    private var unbinds = 0

    private fun show(state: SettingsUiState) =
        rule.setContent { TozzoTheme { SettingsScreen(state, "0.1.0") { unbinds++ } } }

    @Test
    fun showsTheBindingAndVersion() {
        show(SettingsUiState(true, null, "Ana", "Burger da Ana"))
        rule.onNodeWithText("Ana").assertExists()
        rule.onNodeWithText("Burger da Ana").assertExists()
        rule.onNodeWithText("0.1.0").assertExists()
    }

    @Test
    fun unbindAsksForConfirmationFirst() {
        show(SettingsUiState(true, null, "Ana", "Burger da Ana"))
        rule.onNodeWithText("Desvincular este aparelho").performClick()
        rule.onNodeWithText("Desvincular este aparelho?").assertExists()
        assertEquals(0, unbinds)
        rule.onNodeWithText("Desvincular").performClick()
        assertEquals(1, unbinds)
        rule.onNodeWithText("Desvincular este aparelho?").assertDoesNotExist()
    }

    @Test
    fun blockedUnbindIsDisabledWithItsReason() {
        show(SettingsUiState(false, R.string.unbind_blocked_offline, "Ana", "Burger da Ana"))
        rule.onNodeWithText("Desvincular este aparelho").assertIsNotEnabled()
        rule.onNodeWithText("Conecte-se à internet para desvincular este aparelho.").assertExists()
    }
}
