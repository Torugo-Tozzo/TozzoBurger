package uk.tozzo.app.feature.firstsync

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import uk.tozzo.app.core.sync.LocalSyncStatus
import uk.tozzo.app.core.sync.SignOut
import uk.tozzo.app.core.sync.SyncController
import uk.tozzo.app.core.sync.SyncState
import javax.inject.Inject

/**
 * [offline]: the device has no network (the screen asks for a connection). [failed]: online, but
 * the download keeps failing or makes no progress, so the screen shows an error and "Sair".
 */
data class FirstSyncUiState(
    val offline: Boolean,
    val failed: Boolean = false,
)

@HiltViewModel
class FirstSyncViewModel
    @Inject
    constructor(
        private val syncController: SyncController,
        private val signOutUseCase: SignOut,
    ) : ViewModel() {
        private val failed = MutableStateFlow(false)

        val state: StateFlow<FirstSyncUiState> =
            combine(syncController.state, failed) { sync, failed ->
                FirstSyncUiState(offline = sync == SyncState.OFFLINE, failed = failed)
            }.stateIn(
                viewModelScope,
                SharingStarted.Eagerly,
                FirstSyncUiState(offline = syncController.state.value == SyncState.OFFLINE),
            )

        private val doneEvents = Channel<Unit>(Channel.BUFFERED)

        /** Emits once, when the first full sync has finished. */
        val done: Flow<Unit> = doneEvents.receiveAsFlow()

        private val signedOutEvents = Channel<Unit>(Channel.BUFFERED)

        /** Emits once the session ended and the app must go to the login. */
        val signedOut: Flow<Unit> = signedOutEvents.receiveAsFlow()

        init {
            viewModelScope.launch { syncController.start() }
            viewModelScope.launch { watchForFailure() }
            viewModelScope.launch {
                // A database that cannot be opened ends the flow without true: stay on this screen.
                syncController.hasSynced.firstOrNull { it } ?: return@launch
                doneEvents.send(Unit)
            }
        }

        /** Ends the session, keeping the binding and the data, and leaves for the login. */
        fun signOut() {
            viewModelScope.launch {
                signOutUseCase.signOut()
                signedOutEvents.send(Unit)
            }
        }

        /**
         * Online, every change of the SDK status counts as progress and restarts the wait: after
         * [DOWNLOAD_FAILED_MS] with a failed download, or [NO_PROGRESS_MS] otherwise, [failed] turns on.
         * Offline there is nothing to wait for.
         */
        private suspend fun watchForFailure() {
            val offline = syncController.state.map { it == SyncState.OFFLINE }.distinctUntilChanged()
            combine(offline, syncController.syncStatus) { isOffline, status -> isOffline to status }
                .collectLatest { (isOffline, status) ->
                    if (isOffline) {
                        failed.value = false
                    } else {
                        waitForFailure(status)
                    }
                }
        }

        private suspend fun waitForFailure(status: LocalSyncStatus?) {
            if (status?.downloading == true && !status.downloadFailed) failed.value = false
            delay(if (status?.downloadFailed == true) DOWNLOAD_FAILED_MS else NO_PROGRESS_MS)
            failed.value = true
        }

        private companion object {
            const val DOWNLOAD_FAILED_MS = 20_000L
            const val NO_PROGRESS_MS = 30_000L
        }
    }
