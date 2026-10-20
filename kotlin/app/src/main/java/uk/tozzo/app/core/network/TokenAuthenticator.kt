package uk.tozzo.app.core.network

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.Authenticator
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route
import retrofit2.HttpException
import uk.tozzo.app.core.session.SessionEvent
import uk.tozzo.app.core.session.SessionEvents
import uk.tozzo.app.core.session.TokenStore
import javax.inject.Inject
import javax.inject.Provider
import javax.inject.Singleton

/** Refresh attempts finished before a request was sent; set by [AuthInterceptor] as a request tag. */
internal class RefreshGeneration(
    val value: Int,
)

/**
 * Answers a `401 INVALID_TOKEN` by refreshing the session once, however many requests fail at the
 * same time, and retrying each request once with the new access token. Requests sent before a
 * failed refresh give up instead of trying again, so a refresh token is never sent twice for the
 * same failure. A refresh rejected with 401 ends the session: the tokens are cleared and
 * [SessionEvent.Revoked] is emitted once.
 *
 * [authApiProvider] must give an [AuthApi] on its own OkHttp client (see [RefreshClient]): the
 * calls blocked here hold the main client's dispatcher slots.
 */
@Singleton
class TokenAuthenticator
    @Inject
    constructor(
        private val tokenStore: TokenStore,
        @param:RefreshClient private val authApiProvider: Provider<AuthApi>,
        private val events: SessionEvents,
    ) : Authenticator {
        private val mutex = Mutex()

        /** Refresh attempts finished so far; changed only under [mutex]. */
        @Volatile
        internal var generation = 0
            private set

        override fun authenticate(
            route: Route?,
            response: Response,
        ): Request? {
            val failedToken = response.request.header(AUTHORIZATION)?.removePrefix(BEARER)
            if (failedToken == null || response.priorResponse != null || problemCode(response) != INVALID_TOKEN) {
                return null
            }
            val sentAt = response.request.tag(RefreshGeneration::class.java)?.value ?: generation
            // Runs on an OkHttp thread, so blocking it while the refresh happens is fine.
            val accessToken = runBlocking { freshAccessToken(failedToken, sentAt) }
            return accessToken?.let {
                response.request
                    .newBuilder()
                    .header(AUTHORIZATION, BEARER + it)
                    .build()
            }
        }

        /**
         * An access token for a request about to go out with none in memory (after a process
         * restart), refreshed with the stored refresh token; null when there is no session or the
         * refresh token cannot be read.
         */
        internal suspend fun coldStartAccessToken(): String? {
            val sentAt = generation
            return if (readRefreshToken().getOrNull() != null) freshAccessToken(staleToken = null, sentAt) else null
        }

        private suspend fun freshAccessToken(
            staleToken: String?,
            sentAt: Int,
        ): String? =
            mutex.withLock {
                val current = tokenStore.accessToken
                when {
                    current != null && current != staleToken -> current
                    generation != sentAt -> null // a refresh finished after this request was sent and failed
                    else -> refresh()
                }
            }

        /** One refresh attempt; [generation] moves on only when it finishes, under [mutex]. */
        @Suppress("TooGenericExceptionCaught") // any failure must keep the session, never crash a call
        private suspend fun refresh(): String? =
            try {
                val refreshToken = readRefreshToken().getOrThrow()
                if (refreshToken == null) endSession() else refreshWith(refreshToken)
            } catch (e: CancellationException) {
                throw e
            } catch (e: HttpException) {
                if (e.code() == HTTP_UNAUTHORIZED) endSession() else null
            } catch (_: Exception) {
                null
            } finally {
                generation++
            }

        private suspend fun refreshWith(refreshToken: String): String {
            val session = authApiProvider.get().refresh(RefreshRequest(refreshToken))
            tokenStore.save(session)
            return session.accessToken
        }

        /** The stored refresh token; a failure to read it is not the same as having none. */
        @Suppress("TooGenericExceptionCaught")
        private suspend fun readRefreshToken(): Result<String?> =
            try {
                Result.success(tokenStore.refreshToken())
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                Result.failure(e)
            }

        @Suppress("TooGenericExceptionCaught", "SwallowedException")
        private suspend fun endSession(): String? {
            try {
                tokenStore.clear()
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                tokenStore.accessToken = null // the stored refresh token is already revoked by the API
            }
            events.emit(SessionEvent.Revoked)
            return null
        }

        private fun problemCode(response: Response): String? =
            parseProblem(response.peekBody(MAX_PROBLEM_BYTES).string())?.code

        private companion object {
            const val AUTHORIZATION = "Authorization"
            const val BEARER = "Bearer "
            const val INVALID_TOKEN = "INVALID_TOKEN"
            const val HTTP_UNAUTHORIZED = 401
            const val MAX_PROBLEM_BYTES = 16_384L
        }
    }
