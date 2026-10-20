package uk.tozzo.app.feature.shell

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import uk.tozzo.app.feature.login.Notice
import uk.tozzo.app.ui.theme.TozzoTheme

@RunWith(RobolectricTestRunner::class)
class BlockedRouteTest {
    @get:Rule
    val rule = createAndroidComposeRule<ComponentActivity>()

    private fun backLeadsToLogin(notice: Notice) {
        var backs = 0
        rule.setContent { TozzoTheme { BlockedRoute(notice) { backs++ } } }
        rule.runOnUiThread { rule.activity.onBackPressedDispatcher.onBackPressed() }
        rule.waitForIdle()
        assertEquals(1, backs)
        assertEquals(false, rule.activity.isFinishing)
    }

    @Test
    fun systemBackOnEstablishmentDeletedGoesToLogin() = backLeadsToLogin(Notice.EstablishmentDeleted)

    @Test
    fun systemBackOnNoAccessGoesToLogin() = backLeadsToLogin(Notice.NoAccess)
}
