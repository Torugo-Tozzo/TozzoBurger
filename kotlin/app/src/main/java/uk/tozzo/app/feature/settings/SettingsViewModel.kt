package uk.tozzo.app.feature.settings

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import retrofit2.HttpException
import uk.tozzo.app.R
import uk.tozzo.app.core.network.AuthApi
import uk.tozzo.app.core.network.LogoutRequest
import uk.tozzo.app.core.session.Binding
import uk.tozzo.app.core.session.DeviceBinding
import uk.tozzo.app.core.session.TokenStore
import uk.tozzo.app.core.sync.Connectivity
import uk.tozzo.app.core.sync.SignOut
import uk.tozzo.app.core.sync.SyncController
import java.io.IOException
import javax.inject.Inject

data class SettingsUiState(
    val canUnbind: Boolean,
    @param:StringRes val unbindBlockedReason: Int?,
    val userName: String,
    val establishmentName: String,
    /** Rejected changes kept on the device; unbinding deletes them, so the screen warns first. */
    val rejections: Int = 0,
    /** Why the last unbind failed; the device stays bound. */
    @param:StringRes val unbindError: Int? = null,
)

@HiltViewModel
class SettingsViewModel
    @Inject
    constructor(
        private val syncController: SyncController,
        private val connectivity: Connectivity,
        private val deviceBinding: DeviceBinding,
        private val tokenStore: TokenStore,
        private val authApi: AuthApi,
        private val signOutUseCase: SignOut,
    ) : ViewModel() {
        private val unbindError = MutableStateFlow<Int?>(null)

        val state: StateFlow<SettingsUiState> =
            combine(
                deviceBinding.current,
                connectivity.online,
                syncController.pendingOpCount,
                syncController.rejectionCount,
                unbindError,
            ) { b, online, pending, rejections, error ->
                uiState(b, online, pending, rejections ?: 0, error)
            }.stateIn(
                viewModelScope,
                SharingStarted.Eagerly,
                // Until the queue was read, its size is unknown: never unbind on a guess.
                uiState(
                    deviceBinding.current.value,
                    connectivity.online.value,
                    pending = null,
                    rejections = 0,
                    error = null,
                ),
            )

        private val unboundEvents = Channel<Unit>(Channel.BUFFERED)

        /** Emits once the device is unbound and the app must go back to the login. */
        val unbound: Flow<Unit> = unboundEvents.receiveAsFlow()

        private val signedOutEvents = Channel<Unit>(Channel.BUFFERED)

        /** Emits once the session ended (binding and data kept) and the app must go to the login. */
        val signedOut: Flow<Unit> = signedOutEvents.receiveAsFlow()

        private var unbinding = false
        private var signingOut = false

        /** "Sair": always allowed. Keeps the binding and the local data, so only the same user signs in again. */
        fun signOut() {
            if (signingOut) return
            signingOut = true
            viewModelScope.launch {
                try {
                    signOutUseCase.signOut()
                } finally {
                    signingOut = false
                }
                signedOutEvents.send(Unit)
            }
        }

        /**
         * Deletes the local data, the binding and the session, so another user can sign in. The
         * server logout runs before the refresh token is cleared (it needs it) and is best effort.
         */
        fun unbind() {
            if (!state.value.canUnbind || unbinding) return
            unbinding = true
            unbindError.value = null
            viewModelScope.launch {
                if (!clearLocalData()) {
                    unbinding = false
                    unbindError.value = R.string.unbind_failed
                    return@launch
                }
                bestEffort { deviceBinding.clear() }
                logout()
                bestEffort { tokenStore.clear() }
                unboundEvents.send(Unit)
            }
        }

        /** False when the database could not be cleared (an SDK or SQLite failure). */
        @Suppress("TooGenericExceptionCaught", "SwallowedException")
        private suspend fun clearLocalData(): Boolean =
            try {
                syncController.clearLocalData()
                true
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                false
            }

        @Suppress("SwallowedException")
        private suspend fun logout() {
            try {
                authApi.logout(LogoutRequest())
            } catch (e: CancellationException) {
                throw e
            } catch (_: IOException) {
                // best effort: the session expires on the server by itself
            } catch (_: HttpException) {
                // best effort
            }
        }

        @Suppress("SwallowedException")
        private suspend fun bestEffort(block: suspend () -> Unit) {
            try {
                block()
            } catch (_: IOException) {
                // the secure store failed; the local data is already gone
            }
        }

        private fun uiState(
            binding: Binding?,
            online: Boolean,
            pending: Int?,
            rejections: Int,
            @StringRes error: Int?,
        ): SettingsUiState {
            val reason =
                when {
                    pending != null && pending > 0 -> R.string.unbind_blocked_pending
                    !online -> R.string.unbind_blocked_offline
                    else -> null
                }
            return SettingsUiState(
                canUnbind = reason == null && pending != null,
                unbindBlockedReason = reason,
                userName = binding?.userName.orEmpty(),
                establishmentName = binding?.establishmentName.orEmpty(),
                rejections = rejections,
                unbindError = error,
            )
        }
    }
