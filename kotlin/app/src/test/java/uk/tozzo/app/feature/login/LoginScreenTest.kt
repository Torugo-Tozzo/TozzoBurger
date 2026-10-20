package uk.tozzo.app.feature.login

import android.app.Application
import android.content.Intent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import uk.tozzo.app.ui.theme.TozzoTheme

@RunWith(RobolectricTestRunner::class)
class LoginScreenTest {
    @get:Rule
    val rule = createComposeRule()

    private fun show(
        state: LoginUiState = LoginUiState(),
        onEmail: (String) -> Unit = {},
        onPassword: (String) -> Unit = {},
        onSubmit: () -> Unit = {},
    ) = rule.setContent {
        TozzoTheme { LoginScreen(state, onEmail, onPassword, onSubmit) }
    }

    private fun startedUrl(): String? {
        val app = ApplicationProvider.getApplicationContext<Application>()
        val intent = shadowOf(app).nextStartedActivity ?: return null
        assertEquals(Intent.ACTION_VIEW, intent.action)
        return intent.data.toString()
    }

    @Test
    fun typingAndTappingSignInCallsTheCallbacks() {
        var current by mutableStateOf(LoginUiState())
        var submitted: LoginUiState? = null
        rule.setContent {
            TozzoTheme {
                LoginScreen(
                    current,
                    onEmail = { current = current.copy(email = it) },
                    onPassword = { current = current.copy(password = it) },
                    onSubmit = { submitted = current },
                )
            }
        }

        rule.onNodeWithText("Email").performTextInput("a@b.c")
        rule.onNodeWithText("Password").performTextInput("pw")
        rule.onNodeWithText("Sign in").performClick()

        assertEquals("a@b.c", submitted?.email)
        assertEquals("pw", submitted?.password)
    }

    @Test
    fun createAccountOpensTheRegisterPage() {
        show()
        rule.onNodeWithText("Create account").performClick()
        assertEquals("https://dev.tozzo.uk/register", startedUrl())
    }

    @Test
    fun forgotPasswordOpensTheResetPage() {
        show()
        rule.onNodeWithText("Forgot password").performClick()
        assertEquals("https://dev.tozzo.uk/forgot-password", startedUrl())
    }

    @Test
    fun showsTheFormattedError() {
        show(
            LoginUiState(
                error =
                    uk.tozzo.app.ui
                        .UiText(uk.tozzo.app.R.string.login_error_device_limit, listOf(3)),
            ),
        )
        rule.onNodeWithText("This establishment reached its limit of 3 devices.").assertExists()
    }
}
