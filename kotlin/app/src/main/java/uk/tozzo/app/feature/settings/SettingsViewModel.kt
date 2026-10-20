package uk.tozzo.app.feature.settings

import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
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
import uk.tozzo.app.core.sync.SyncController
import java.io.IOException
import javax.inject.Inject

data class SettingsUiState(
    val canUnbind: Boolean,
    @param:StringRes val unbindBlockedReason: Int?,
    val userName: String,
    val establishmentName: String,
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
    ) : ViewModel() {
        val state: StateFlow<SettingsUiState> =
            combine(deviceBinding.current, connectivity.online, syncController.pendingOpCount) { b, online, pending ->
                uiState(b, online, pending)
            }.stateIn(
                viewModelScope,
                SharingStarted.Eagerly,
                uiState(deviceBinding.current.value, connectivity.online.value, pending = 0),
            )

        private val unboundEvents = Channel<Unit>(Channel.BUFFERED)

        /** Emits once the device is unbound and the app must go back to the login. */
        val unbound: Flow<Unit> = unboundEvents.receiveAsFlow()

        private var unbinding = false

        /**
         * Deletes the local data, the binding and the session, so another user can sign in. The
         * server logout runs before the refresh token is cleared (it needs it) and is best effort.
         */
        fun unbind() {
            if (!state.value.canUnbind || unbinding) return
            unbinding = true
            viewModelScope.launch {
                syncController.clearLocalData()
                bestEffort { deviceBinding.clear() }
                logout()
                bestEffort { tokenStore.clear() }
                unboundEvents.send(Unit)
            }
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
            pending: Int,
        ): SettingsUiState {
            val reason =
                when {
                    pending > 0 -> R.string.unbind_blocked_pending
                    !online -> R.string.unbind_blocked_offline
                    else -> null
                }
            return SettingsUiState(
                canUnbind = reason == null,
                unbindBlockedReason = reason,
                userName = binding?.userName.orEmpty(),
                establishmentName = binding?.establishmentName.orEmpty(),
            )
        }
    }
