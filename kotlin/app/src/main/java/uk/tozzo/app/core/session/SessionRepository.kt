package uk.tozzo.app.core.session

import kotlinx.coroutines.CancellationException
import retrofit2.HttpException
import uk.tozzo.app.core.network.ApiProblem
import uk.tozzo.app.core.network.AuthApi
import uk.tozzo.app.core.network.DeviceApi
import uk.tozzo.app.core.network.DeviceInfo
import uk.tozzo.app.core.network.LoginRequest
import uk.tozzo.app.core.network.LogoutRequest
import uk.tozzo.app.core.network.Me
import uk.tozzo.app.core.network.RefreshClient
import uk.tozzo.app.core.network.RegisterDeviceRequest
import uk.tozzo.app.core.network.SessionBody
import uk.tozzo.app.core.network.toApiProblem
import uk.tozzo.app.domain.BusinessModule
import uk.tozzo.app.domain.BusinessProfile
import uk.tozzo.app.domain.EstablishmentModules
import uk.tozzo.app.domain.Role
import uk.tozzo.app.domain.needsWebSetup
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

sealed interface LoginResult {
    data class Success(
        val binding: Binding,
    ) : LoginResult

    data object InvalidCredentials : LoginResult

    data object EmailNotVerified : LoginResult

    data object OtherUserBound : LoginResult

    /** No readable binding, but the upload queue holds changes of some earlier user. */
    data object UnsentDataOfUnknownUser : LoginResult

    data object NoAccess : LoginResult

    data object RoleNotYetSupported : LoginResult

    data object NeedsWebSetup : LoginResult

    data class DeviceLimitReached(
        val limit: Int?,
    ) : LoginResult

    data object EstablishmentDeleted : LoginResult

    data object Offline : LoginResult

    data class Failed(
        val problem: ApiProblem?,
    ) : LoginResult
}

/** The sign-in call, as seen by the login screen (a seam for tests). */
interface LoginService {
    suspend fun login(
        email: String,
        password: String,
    ): LoginResult
}

/** Signs in, binds this device to one user and keeps that binding across sign-outs. */
@Singleton
class SessionRepository
    @Inject
    constructor(
        private val authApi: AuthApi,
        @param:RefreshClient private val bareAuthApi: AuthApi,
        private val deviceApi: DeviceApi,
        private val tokenStore: TokenStore,
        private val deviceBinding: DeviceBinding,
        private val deviceIdentity: DeviceIdentity,
        private val deviceInfo: DeviceInfoSource,
        private val localData: LocalDataGate,
    ) : LoginService {
        @Suppress("ReturnCount")
        override suspend fun login(
            email: String,
            password: String,
        ): LoginResult {
            val session =
                try {
                    authApi.login(LoginRequest(email, password, deviceName = deviceInfo.model))
                } catch (e: CancellationException) {
                    throw e
                } catch (e: IOException) {
                    return failureResult(e)
                } catch (e: HttpException) {
                    return failureResult(e)
                }
            rejection(session)?.let {
                logoutNewSession(session)
                return it
            }
            val binding = session.user.toBinding(session.user.establishment.id) ?: return LoginResult.NoAccess
            if (deviceBinding.current.value == null) {
                localData.prepareForNewUser()?.let {
                    logoutNewSession(session)
                    return it
                }
            }
            return bind(session, binding)
        }

        /** Re-reads `/v1/me` and rebuilds the binding (same user and establishment). */
        @Suppress("TooGenericExceptionCaught")
        suspend fun refreshBindingFromServer(): Result<Binding> =
            try {
                val bound = deviceBinding.current.value ?: error("No binding")
                val me = authApi.me()
                check(me.id == bound.userId) { "Signed-in user differs from the bound user" }
                val binding = me.toBinding(bound.establishmentId) ?: error("Unusable /me")
                deviceBinding.save(binding)
                Result.success(binding)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Result.failure(e)
            }

        /** Ends the session on the server (best effort) and locally, keeping the binding and local data. */
        suspend fun signOutKeepingData() {
            runLogout()
            tokenStore.clear()
        }

        @Suppress("ReturnCount")
        private suspend fun bind(
            session: SessionBody,
            binding: Binding,
        ): LoginResult {
            try {
                tokenStore.save(session)
            } catch (_: IOException) {
                logoutNewSession(session)
                return LoginResult.Failed(null)
            }
            val failure = registerDevice() ?: return saveBinding(session, binding)
            discardNewSession(session)
            return failure
        }

        private suspend fun registerDevice(): LoginResult? =
            try {
                val info = DeviceInfo(deviceInfo.model, deviceInfo.androidVersion, deviceInfo.appVersion)
                deviceApi.register(RegisterDeviceRequest(deviceIdentity.id(), info))
                null
            } catch (e: CancellationException) {
                throw e
            } catch (e: IOException) {
                failureResult(e)
            } catch (e: HttpException) {
                failureResult(e)
            }

        private suspend fun saveBinding(
            session: SessionBody,
            binding: Binding,
        ): LoginResult =
            try {
                deviceBinding.save(binding)
                LoginResult.Success(binding)
            } catch (_: IOException) {
                discardNewSession(session)
                LoginResult.Failed(null)
            }

        /** The refusal for [session], or null when this device may sign it in. */
        private fun rejection(session: SessionBody): LoginResult? {
            val user = session.user
            val role = Role.parse(user.role)
            val bound = deviceBinding.current.value
            return when {
                bound != null && bound.userId != user.id -> LoginResult.OtherUserBound
                role == null || role == Role.CUSTOMER -> LoginResult.NoAccess
                role == Role.COOK || role == Role.DRIVER -> LoginResult.RoleNotYetSupported
                user.establishment.status == STATUS_DELETED -> LoginResult.EstablishmentDeleted
                needsWebSetup(role, user.establishment.toModules()) -> LoginResult.NeedsWebSetup
                else -> null
            }
        }

        /** Clears the tokens just saved (best effort) and logs the new session out. */
        private suspend fun discardNewSession(session: SessionBody) {
            try {
                tokenStore.clear()
            } catch (_: IOException) {
                // the logout below still runs
            }
            logoutNewSession(session)
        }

        /**
         * Logs the new session out with its own bearer on the client without an authenticator, so the
         * shared [TokenStore] (and the bound user's refresh token) is never touched. Best effort.
         */
        @Suppress("SwallowedException")
        private suspend fun logoutNewSession(session: SessionBody) {
            try {
                bareAuthApi.logoutWith("Bearer ${session.accessToken}", LogoutRequest())
            } catch (e: CancellationException) {
                throw e
            } catch (_: IOException) {
                // best effort
            } catch (_: HttpException) {
                // best effort
            }
        }

        @Suppress("SwallowedException")
        private suspend fun runLogout() {
            try {
                authApi.logout(LogoutRequest())
            } catch (e: CancellationException) {
                throw e
            } catch (_: IOException) {
                // best effort
            } catch (_: HttpException) {
                // best effort
            }
        }

        private fun failureResult(e: Throwable): LoginResult {
            val problem = e.toApiProblem()
            return when {
                problem?.code == "INVALID_CREDENTIALS" -> LoginResult.InvalidCredentials
                problem?.code == "EMAIL_NOT_VERIFIED" -> LoginResult.EmailNotVerified
                problem?.code == "DEVICE_LIMIT_REACHED" -> LoginResult.DeviceLimitReached(problem.limit)
                problem == null && e is IOException -> LoginResult.Offline
                else -> LoginResult.Failed(problem)
            }
        }

        private companion object {
            const val STATUS_DELETED = "DELETED"
        }
    }

private fun uk.tozzo.app.core.network.MeEstablishment.toModules() =
    EstablishmentModules(
        category = category,
        businessProfiles = businessProfiles?.mapNotNull { raw -> BusinessProfile.entries.find { it.name == raw } },
        visibleModules = visibleModules?.mapNotNull { raw -> BusinessModule.entries.find { it.name == raw } },
    )

private fun Me.toBinding(establishmentId: String): Binding? {
    val parsed = Role.parse(role) ?: return null
    return Binding(
        userId = id,
        establishmentId = establishmentId,
        role = parsed,
        userName = name,
        establishmentName = establishment.tradeName,
        modules = establishment.toModules(),
        plan = establishment.plan,
    )
}
