package uk.tozzo.app.feature.firstsync

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
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

/** Gets the [FirstSyncViewModel] and leaves the screen when the first sync is done. */
@Composable
fun FirstSyncRoute(
    onDone: () -> Unit,
    viewModel: FirstSyncViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(viewModel) { viewModel.done.collect { onDone() } }
    FirstSyncScreen(state)
}

@Composable
fun FirstSyncScreen(state: FirstSyncUiState) {
    Surface(modifier = Modifier.fillMaxSize()) {
        Box(contentAlignment = Alignment.Center) {
            if (state.offline) {
                EmptyState(title = stringResource(R.string.first_sync_offline))
            } else {
                LoadingState(stringResource(R.string.first_sync_downloading))
            }
        }
    }
}
