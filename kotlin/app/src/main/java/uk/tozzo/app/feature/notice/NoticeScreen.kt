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
            EmptyState(title = stringResource(title), message = stringResource(message)) {
                Column(modifier = Modifier.fillMaxWidth()) {
                    when (notice) {
                        Notice.NEEDS_WEB_SETUP -> {
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
                        Notice.NO_ACCESS, Notice.ROLE_NOT_YET_SUPPORTED ->
                            TozzoButton(
                                text = stringResource(R.string.action_logout),
                                onClick = onBackToLogin,
                                modifier = Modifier.fillMaxWidth(),
                            )
                        Notice.ESTABLISHMENT_DELETED ->
                            TozzoButton(
                                text = stringResource(R.string.action_ok),
                                onClick = onBackToLogin,
                                modifier = Modifier.fillMaxWidth(),
                            )
                    }
                }
            }
        }
    }
}

private fun Notice.texts(): Pair<Int, Int> =
    when (this) {
        Notice.NEEDS_WEB_SETUP -> R.string.notice_needs_web_setup_title to R.string.notice_needs_web_setup_message
        Notice.NO_ACCESS -> R.string.notice_no_access_title to R.string.notice_no_access_message
        Notice.ROLE_NOT_YET_SUPPORTED -> R.string.notice_role_title to R.string.notice_role_message
        Notice.ESTABLISHMENT_DELETED -> R.string.notice_deleted_title to R.string.notice_deleted_message
    }
