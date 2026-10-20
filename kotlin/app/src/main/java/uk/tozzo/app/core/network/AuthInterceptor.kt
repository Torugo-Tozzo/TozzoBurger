package uk.tozzo.app.core.network

import okhttp3.Interceptor
import okhttp3.Response
import uk.tozzo.app.core.session.TokenStore
import javax.inject.Inject

/** Adds the in-memory access token to every request except the ones that create a session. */
class AuthInterceptor
    @Inject
    constructor(
        private val tokenStore: TokenStore,
    ) : Interceptor {
        override fun intercept(chain: Interceptor.Chain): Response {
            val request = chain.request()
            val token = tokenStore.accessToken
            if (token == null || request.url.encodedPath in PUBLIC_PATHS) return chain.proceed(request)
            return chain.proceed(request.newBuilder().header("Authorization", "Bearer $token").build())
        }

        private companion object {
            val PUBLIC_PATHS = setOf("/v1/auth/login", "/v1/auth/refresh", "/v1/auth/google")
        }
    }
