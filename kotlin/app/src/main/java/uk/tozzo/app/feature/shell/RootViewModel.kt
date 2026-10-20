package uk.tozzo.app.feature.shell

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import uk.tozzo.app.core.session.Binding
import uk.tozzo.app.core.session.DeviceBinding
import uk.tozzo.app.core.session.SessionEvent
import uk.tozzo.app.core.session.SessionEvents
import uk.tozzo.app.core.session.TokenStore
import uk.tozzo.app.core.sync.SyncController
import uk.tozzo.app.domain.AppDestination
import uk.tozzo.app.domain.resolveNavigationModules
import uk.tozzo.app.domain.startDestination
import uk.tozzo.app.feature.login.Notice
import java.io.IOException
import javax.inject.Inject

/** Which top-level screen the app shows. */
sealed interface RootState {
    data object Loading : RootState

    data object Login : RootState

    data object FirstSync : RootState

    data class Ready(
        val binding: Binding,
        val start: AppDestination,
    ) : RootState

    data class Blocked(
        val notice: Notice,
    ) : RootState
}

/**
 * Picks the top-level screen from the stored binding, the stored session and the persisted sync
 * status (never the network), and reacts to [SessionEvents].
 */
@HiltViewModel
class RootViewModel
    @Inject
    constructor(
        private val deviceBinding: DeviceBinding,
        private val tokenStore: TokenStore,
        private val syncController: SyncController,
        private val sessionEvents: SessionEvents,
    ) : ViewModel() {
        private val _state = MutableStateFlow<RootState>(RootState.Loading)
        val state: StateFlow<RootState> = _state.asStateFlow()

        private val _paymentRequired = MutableStateFlow(false)

        /** The API refused a sync for an unpaid plan; the shell shows a fixed warning. */
        val paymentRequired: StateFlow<Boolean> = _paymentRequired.asStateFlow()

        val syncBadge: StateFlow<SyncBadgeState> =
            combine(syncController.state, syncController.rejectionCount, ::SyncBadgeState)
                .stateIn(
                    viewModelScope,
                    SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS),
                    SyncBadgeState(syncController.state.value, rejections = 0),
                )

        // Bumped by every transition; a resolve() that started before a newer one does not apply.
        private var transition = 0

        init {
            resolve()
            viewModelScope.launch {
                sessionEvents.events.collect {
                    handle(it)
                    sessionEvents.consume()
                }
            }
        }

        /** The login stored a new binding and session. */
        fun onLoggedIn() = resolve()

        /** The login was refused with a [Notice]. */
        fun onNotice(notice: Notice) = moveTo(RootState.Blocked(notice))

        fun onBackToLogin() = moveTo(RootState.Login)

        fun onFirstSyncDone() {
            val binding = deviceBinding.current.value
            moveTo(binding?.let(::readyOrBlocked) ?: RootState.Login)
        }

        /** Settings unbound the device: binding, session and local data are gone. */
        fun onUnbound() = moveTo(RootState.Login)

        private fun resolve() {
            val started = ++transition
            viewModelScope.launch {
                val next = nextState()
                if (started == transition) moveTo(next)
            }
        }

        @Suppress("ReturnCount")
        private suspend fun nextState(): RootState {
            val binding = loadBinding() ?: return RootState.Login
            if (!hasRefreshToken()) return RootState.Login
            val ready = readyOrBlocked(binding)
            if (ready is RootState.Blocked) return ready
            return if (syncController.hasSyncedOrFalse()) ready else RootState.FirstSync
        }

        /** An unreadable store counts as no binding: the login screen is the only way forward. */
        private suspend fun loadBinding(): Binding? =
            try {
                deviceBinding.load()
                deviceBinding.current.value
            } catch (_: IOException) {
                null
            }

        /** A store that cannot be read is not a revoked session: stay signed in while offline. */
        private suspend fun hasRefreshToken(): Boolean =
            try {
                tokenStore.refreshToken() != null
            } catch (_: IOException) {
                true
            }

        private suspend fun handle(event: SessionEvent) {
            when (event) {
                SessionEvent.Revoked -> moveTo(RootState.Login)
                SessionEvent.PaymentRequired -> _paymentRequired.value = true
                SessionEvent.EstablishmentDeleted -> {
                    ++transition
                    bestEffort { syncController.clearLocalData() }
                    bestEffort { deviceBinding.clear() }
                    bestEffort { tokenStore.clear() }
                    moveTo(RootState.Blocked(Notice.ESTABLISHMENT_DELETED))
                }
            }
        }

        private fun moveTo(next: RootState) {
            ++transition
            if (next == RootState.Login) _paymentRequired.value = false
            _state.value = next
            if (next is RootState.Ready || next == RootState.FirstSync) {
                viewModelScope.launch { syncController.start() }
            }
        }

        private companion object {
            const val STOP_TIMEOUT_MS = 5_000L
        }
    }

/** Ready on the start module of [binding]; a binding without any module has no access. */
private fun readyOrBlocked(binding: Binding): RootState =
    startDestination(resolveNavigationModules(binding.role, binding.modules))
        ?.let { RootState.Ready(binding, it) }
        ?: RootState.Blocked(Notice.NO_ACCESS)

/**
 * The establishment is gone either way: a database or secure store failure must not stop the
 * remaining steps, the notice, or the event collector.
 */
@Suppress("TooGenericExceptionCaught", "SwallowedException")
private suspend fun bestEffort(block: suspend () -> Unit) {
    try {
        block()
    } catch (e: CancellationException) {
        throw e
    } catch (_: Exception) {
        // still run the next step
    }
}

/**
 * A database that fails to open (SDK or SQLite error) must not crash the start: it reads as
 * "not synced yet", so the first sync screen shows and the sync retries from there.
 */
@Suppress("TooGenericExceptionCaught", "SwallowedException")
private suspend fun SyncController.hasSyncedOrFalse(): Boolean =
    try {
        hasSynced.first()
    } catch (e: CancellationException) {
        throw e
    } catch (_: Exception) {
        false
    }
