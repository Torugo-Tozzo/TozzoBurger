package uk.tozzo.app.feature.rejections

import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import uk.tozzo.app.core.sync.SyncRejection
import uk.tozzo.app.ui.theme.TozzoTheme

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "pt-rBR")
class RejectionsScreenTest {
    @get:Rule
    val rule = createComposeRule()

    @Test
    fun showsLabelExplanationSummaryAndHidesTheDetail() {
        val rejection =
            SyncRejection(
                "r1",
                "orders",
                "ORDER_NOT_OPEN",
                "order is not open",
                "2026-10-20T12:00:00Z",
                summary = "Ana",
            )
        rule.setContent { TozzoTheme { RejectionsScreen(listOf(rejection)) } }
        rule.onNodeWithText("Pedido").assertExists()
        rule.onNodeWithText("O pedido já foi fechado.").assertExists()
        rule.onNodeWithText("Ana").assertExists()
        rule.onNodeWithText("order is not open").assertDoesNotExist()
        rule.onNodeWithText("ORDER_NOT_OPEN").assertDoesNotExist()
    }

    @Test
    fun unknownCodeShowsTheGenericMessage() {
        val rejection = SyncRejection("r1", "gadgets", "NEW_CODE", null, "2026-10-20T12:00:00Z")
        rule.setContent { TozzoTheme { RejectionsScreen(listOf(rejection)) } }
        rule.onNodeWithText("gadgets").assertExists()
        rule.onNodeWithText("O servidor recusou esta alteração.").assertExists()
    }

    @Test
    fun emptyListShowsTheEmptyState() {
        rule.setContent { TozzoTheme { RejectionsScreen(emptyList()) } }
        rule.onNodeWithText("Nenhuma alteração recusada.").assertExists()
    }
}
