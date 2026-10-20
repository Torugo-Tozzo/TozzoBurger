package uk.tozzo.app.core.network

import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Response
import uk.tozzo.app.core.session.TokenStore
import javax.inject.Inject

/**
 * Adds the access token to every request except the ones that create a session. With no access
 * token in memory but a stored refresh token (after a process restart), refreshes first.
 */
class AuthInterceptor
    @Inject
    constructor(
        private val tokenStore: TokenStore,
        private val tokenAuthenticator: TokenAuthenticator,
    ) : Interceptor {
        override fun intercept(chain: Interceptor.Chain): Response {
            val request = chain.request()
            if (request.url.encodedPath in PUBLIC_PATHS) return chain.proceed(request)
            // Read before the token: a refresh failing after this point must not be retried by this request.
            var generation = tokenAuthenticator.generation
            val token =
                tokenStore.accessToken
                    ?: runBlocking { tokenAuthenticator.coldStartAccessToken() }.also {
                        generation = tokenAuthenticator.generation
                    }
            val builder = request.newBuilder().tag(RefreshGeneration::class.java, RefreshGeneration(generation))
            token?.let { builder.header("Authorization", "Bearer $it") }
            return chain.proceed(builder.build())
        }

        private companion object {
            val PUBLIC_PATHS = setOf("/v1/auth/login", "/v1/auth/refresh", "/v1/auth/google")
        }
    }
