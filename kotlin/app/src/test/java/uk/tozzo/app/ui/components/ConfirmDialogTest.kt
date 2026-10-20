package uk.tozzo.app.ui.components

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
class ConfirmDialogTest {
    @get:Rule
    val rule = createComposeRule()

    @Test
    fun cancelUsesTheAppsOwnString() {
        var dismissed = 0
        rule.setContent {
            TozzoTheme { ConfirmDialog("Título", "Mensagem", "Confirmar", onConfirm = {}, onDismiss = { dismissed++ }) }
        }
        rule.onNodeWithText("Cancelar").performClick()
        assertEquals(1, dismissed)
    }
}
