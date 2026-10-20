package uk.tozzo.app.feature.notice

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import uk.tozzo.app.R
import uk.tozzo.app.feature.login.Notice
import uk.tozzo.app.ui.components.ButtonVariant
import uk.tozzo.app.ui.components.EmptyState
import uk.tozzo.app.ui.components.TozzoButton
import uk.tozzo.app.ui.components.openWebPath

/** [onBackToLogin] is where "Sign out" and "OK" lead; the navigation wiring lives with the caller. */
@Composable
fun NoticeScreen(
    notice: Notice,
    onBackToLogin: () -> Unit,
) {
    val context = LocalContext.current
    val (title, message) = notice.texts()
    Surface(modifier = Modifier.fillMaxSize()) {
        Box(contentAlignment = Alignment.Center) {
            EmptyState(title = title, message = message) {
                Column(modifier = Modifier.fillMaxWidth()) {
                    when (notice) {
                        Notice.NeedsWebSetup -> {
                            TozzoButton(
                                text = stringResource(R.string.notice_open_web),
                                onClick = { context.openWebPath("/login") },
                                modifier = Modifier.fillMaxWidth(),
                            )
                            TozzoButton(
                                text = stringResource(R.string.action_logout),
                                onClick = onBackToLogin,
                                modifier = Modifier.fillMaxWidth(),
                                variant = ButtonVariant.Outline,
                            )
                        }
                        Notice.NoAccess ->
                            TozzoButton(
                                text = stringResource(R.string.action_logout),
                                onClick = onBackToLogin,
                                modifier = Modifier.fillMaxWidth(),
                            )
                        Notice.EstablishmentDeleted ->
                            TozzoButton(
                                text = stringResource(R.string.action_ok),
                                onClick = onBackToLogin,
                                modifier = Modifier.fillMaxWidth(),
                            )
                        is Notice.DeviceLimitReached, Notice.PaymentRequired -> {
                            TozzoButton(
                                text = stringResource(R.string.notice_open_plan),
                                onClick = { context.openWebPath(PLAN_PATH) },
                                modifier = Modifier.fillMaxWidth(),
                            )
                            TozzoButton(
                                text = stringResource(R.string.action_ok),
                                onClick = onBackToLogin,
                                modifier = Modifier.fillMaxWidth(),
                                variant = ButtonVariant.Outline,
                            )
                        }
                    }
                }
            }
        }
    }
}

/** The website's plan selection page (`/plan` in the web router). */
private const val PLAN_PATH = "/plan"

@Composable
private fun Notice.texts(): Pair<String, String> =
    when (this) {
        Notice.NeedsWebSetup ->
            stringResource(R.string.notice_needs_web_setup_title) to
                stringResource(R.string.notice_needs_web_setup_message)
        Notice.NoAccess ->
            stringResource(R.string.notice_no_access_title) to stringResource(R.string.notice_no_access_message)
        Notice.EstablishmentDeleted ->
            stringResource(R.string.notice_deleted_title) to stringResource(R.string.notice_deleted_message)
        is Notice.DeviceLimitReached ->
            stringResource(R.string.notice_device_limit_title) to
                if (limit != null) {
                    stringResource(R.string.login_error_device_limit, limit)
                } else {
                    stringResource(R.string.login_error_device_limit_generic)
                }
        Notice.PaymentRequired ->
            stringResource(R.string.notice_payment_title) to stringResource(R.string.notice_payment_message)
    }
