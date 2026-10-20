package uk.tozzo.app.feature.notice

import android.app.Application
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import uk.tozzo.app.feature.login.Notice
import uk.tozzo.app.ui.theme.TozzoTheme

@RunWith(RobolectricTestRunner::class)
class NoticeScreenTest {
    @get:Rule
    val rule = createComposeRule()

    private var backs = 0

    private fun show(notice: Notice) = rule.setContent { TozzoTheme { NoticeScreen(notice) { backs++ } } }

    @Test
    fun webSetupOpensTheSiteAndCanSignOut() {
        show(Notice.NEEDS_WEB_SETUP)
        rule.onNodeWithText("Open website").performClick()
        val app = ApplicationProvider.getApplicationContext<Application>()
        assertEquals("https://dev.tozzo.uk/login", shadowOf(app).nextStartedActivity.data.toString())
        rule.onNodeWithText("Sign out").performClick()
        assertEquals(1, backs)
    }

    @Test
    fun noAccessOffersSignOut() {
        show(Notice.NO_ACCESS)
        rule.onNodeWithText("Sign out").performClick()
        assertEquals(1, backs)
    }

    @Test
    fun roleNotYetSupportedOffersSignOut() {
        show(Notice.ROLE_NOT_YET_SUPPORTED)
        rule.onNodeWithText("Sign out").performClick()
        assertEquals(1, backs)
    }

    @Test
    fun deletedEstablishmentOffersOk() {
        show(Notice.ESTABLISHMENT_DELETED)
        rule.onNodeWithText("OK").performClick()
        assertEquals(1, backs)
    }
}
