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
    fun showsTableCodeAndDetail() {
        val rejection = SyncRejection("r1", "orders", "STOCK_LOW", "Sem estoque", "2026-10-20T12:00:00Z")
        rule.setContent { TozzoTheme { RejectionsScreen(listOf(rejection)) } }
        rule.onNodeWithText("orders · STOCK_LOW").assertExists()
        rule.onNodeWithText("Sem estoque").assertExists()
    }

    @Test
    fun emptyListShowsTheEmptyState() {
        rule.setContent { TozzoTheme { RejectionsScreen(emptyList()) } }
        rule.onNodeWithText("Nenhuma alteração recusada.").assertExists()
    }
}
