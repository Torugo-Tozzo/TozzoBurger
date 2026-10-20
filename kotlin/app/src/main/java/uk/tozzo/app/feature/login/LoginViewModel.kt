package uk.tozzo.app.feature.login

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uk.tozzo.app.R
import uk.tozzo.app.core.session.LoginResult
import uk.tozzo.app.core.session.LoginService
import uk.tozzo.app.ui.UiText
import javax.inject.Inject

enum class Notice { NEEDS_WEB_SETUP, NO_ACCESS, ROLE_NOT_YET_SUPPORTED, ESTABLISHMENT_DELETED }

data class LoginUiState(
    val email: String = "",
    val password: String = "",
    val loading: Boolean = false,
    val error: UiText? = null,
    val notice: Notice? = null,
)

@HiltViewModel
class LoginViewModel
    @Inject
    constructor(
        private val loginService: LoginService,
    ) : ViewModel() {
        private val _state = MutableStateFlow(LoginUiState())
        val state: StateFlow<LoginUiState> = _state.asStateFlow()

        private val loggedInEvents = Channel<Unit>(Channel.BUFFERED)
        val loggedIn: Flow<Unit> = loggedInEvents.receiveAsFlow()

        fun onEmail(value: String) = _state.update { it.copy(email = value, error = null) }

        fun onPassword(value: String) = _state.update { it.copy(password = value, error = null) }

        fun dismissNotice() = _state.update { it.copy(notice = null) }

        fun submit() {
            val current = _state.value
            if (current.loading) return
            val email = current.email.trim()
            val password = current.password.trim()
            if (email.isEmpty() || password.isEmpty()) {
                _state.update { it.copy(error = UiText(R.string.login_error_required)) }
                return
            }
            _state.update { it.copy(loading = true, error = null, notice = null) }
            viewModelScope.launch {
                val result = loginService.login(email, password)
                if (result is LoginResult.Success) loggedInEvents.send(Unit)
                _state.update { it.copy(loading = false, error = result.errorText(), notice = result.notice()) }
            }
        }
    }

private fun LoginResult.errorText(): UiText? =
    when (this) {
        LoginResult.InvalidCredentials -> UiText(R.string.login_error_credentials)
        LoginResult.EmailNotVerified -> UiText(R.string.login_error_email_not_verified)
        LoginResult.OtherUserBound -> UiText(R.string.login_error_other_user)
        is LoginResult.DeviceLimitReached ->
            if (limit != null) {
                UiText(R.string.login_error_device_limit, listOf(limit))
            } else {
                UiText(R.string.login_error_device_limit_generic)
            }
        LoginResult.Offline -> UiText(R.string.login_error_offline)
        is LoginResult.Failed -> UiText(R.string.login_error_generic)
        is LoginResult.Success,
        LoginResult.NoAccess,
        LoginResult.RoleNotYetSupported,
        LoginResult.NeedsWebSetup,
        LoginResult.EstablishmentDeleted,
        -> null
    }

private fun LoginResult.notice(): Notice? =
    when (this) {
        LoginResult.NoAccess -> Notice.NO_ACCESS
        LoginResult.RoleNotYetSupported -> Notice.ROLE_NOT_YET_SUPPORTED
        LoginResult.NeedsWebSetup -> Notice.NEEDS_WEB_SETUP
        LoginResult.EstablishmentDeleted -> Notice.ESTABLISHMENT_DELETED
        else -> null
    }
