package uk.tozzo.app.core.network

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
import java.io.IOException
import javax.inject.Inject
import javax.inject.Provider
import javax.inject.Singleton

/**
 * Answers a `401 INVALID_TOKEN` by refreshing the session once, however many requests fail at the
 * same time, and retrying each request once with the new access token. A refresh rejected with
 * 401 ends the session: the tokens are cleared and [SessionEvent.Revoked] is emitted.
 */
@Singleton
class TokenAuthenticator
    @Inject
    constructor(
        private val tokenStore: TokenStore,
        private val authApiProvider: Provider<AuthApi>,
        private val events: SessionEvents,
    ) : Authenticator {
        private val mutex = Mutex()

        override fun authenticate(
            route: Route?,
            response: Response,
        ): Request? {
            val failedToken = response.request.header(AUTHORIZATION)?.removePrefix(BEARER)
            if (failedToken == null || response.priorResponse != null || problemCode(response) != INVALID_TOKEN) {
                return null
            }
            // Runs on an OkHttp thread, so blocking it while the refresh happens is fine.
            val accessToken = runBlocking { mutex.withLock { currentOrRefreshed(failedToken) } }
            return accessToken?.let {
                response.request
                    .newBuilder()
                    .header(AUTHORIZATION, BEARER + it)
                    .build()
            }
        }

        /** The access token to retry with: the current one if another request already refreshed it. */
        private suspend fun currentOrRefreshed(failedToken: String): String? {
            val current = tokenStore.accessToken
            if (current != null && current != failedToken) return current
            return refresh()
        }

        private suspend fun refresh(): String? {
            val refreshToken = tokenStore.refreshToken() ?: return endSession()
            return try {
                val session = authApiProvider.get().refresh(RefreshRequest(refreshToken))
                tokenStore.save(session)
                session.accessToken
            } catch (e: HttpException) {
                if (e.code() == HTTP_UNAUTHORIZED) endSession() else null
            } catch (_: IOException) {
                null
            }
        }

        private suspend fun endSession(): String? {
            tokenStore.clear()
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
