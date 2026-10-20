package uk.tozzo.app.feature.firstsync

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uk.tozzo.app.R
import uk.tozzo.app.ui.components.EmptyState
import uk.tozzo.app.ui.components.LoadingState
import uk.tozzo.app.ui.components.TozzoButton

/** Gets the [FirstSyncViewModel]; leaves when the first sync is done or the user signed out. */
@Composable
fun FirstSyncRoute(
    onDone: () -> Unit,
    onSignedOut: () -> Unit,
    viewModel: FirstSyncViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(viewModel) { viewModel.done.collect { onDone() } }
    LaunchedEffect(viewModel) { viewModel.signedOut.collect { onSignedOut() } }
    FirstSyncScreen(state, viewModel::signOut)
}

@Composable
fun FirstSyncScreen(
    state: FirstSyncUiState,
    onSignOut: () -> Unit,
) {
    val signOut: @Composable () -> Unit = {
        TozzoButton(
            text = stringResource(R.string.action_logout),
            onClick = onSignOut,
            modifier = Modifier.fillMaxWidth(),
        )
    }
    Surface(modifier = Modifier.fillMaxSize()) {
        Box(contentAlignment = Alignment.Center) {
            when {
                state.offline -> EmptyState(title = stringResource(R.string.first_sync_offline), action = signOut)
                state.failed ->
                    EmptyState(
                        title = stringResource(R.string.first_sync_failed_title),
                        message = stringResource(R.string.first_sync_failed_message),
                        action = signOut,
                    )
                else -> LoadingState(stringResource(R.string.first_sync_downloading))
            }
        }
    }
}
