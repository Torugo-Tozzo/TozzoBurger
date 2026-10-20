package uk.tozzo.app.feature.firstsync

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import uk.tozzo.app.core.sync.SyncController
import uk.tozzo.app.core.sync.SyncState
import javax.inject.Inject

data class FirstSyncUiState(
    val offline: Boolean,
)

@HiltViewModel
class FirstSyncViewModel
    @Inject
    constructor(
        private val syncController: SyncController,
    ) : ViewModel() {
        val state: StateFlow<FirstSyncUiState> =
            syncController.state
                .map { FirstSyncUiState(offline = it == SyncState.OFFLINE) }
                .stateIn(
                    viewModelScope,
                    SharingStarted.Eagerly,
                    FirstSyncUiState(offline = syncController.state.value == SyncState.OFFLINE),
                )

        private val doneEvents = Channel<Unit>(Channel.BUFFERED)

        /** Emits once, when the first full sync has finished. */
        val done: Flow<Unit> = doneEvents.receiveAsFlow()

        init {
            viewModelScope.launch { syncController.start() }
            viewModelScope.launch {
                // A database that cannot be opened ends the flow without true: stay on this screen.
                syncController.hasSynced.firstOrNull { it } ?: return@launch
                doneEvents.send(Unit)
            }
        }
    }
