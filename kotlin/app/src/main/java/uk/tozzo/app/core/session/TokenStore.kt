package uk.tozzo.app.core.session

import uk.tozzo.app.core.network.SessionBody
import javax.inject.Inject
import javax.inject.Singleton

/** Holds the session tokens: the access token only in memory, the refresh token in [SecureStore]. */
@Singleton
class TokenStore
    @Inject
    constructor(
        private val secure: SecureStore,
    ) {
        @Volatile
        var accessToken: String? = null

        suspend fun refreshToken(): String? = secure.get(REFRESH_TOKEN_KEY)

        /** Saves the rotated refresh token (when the API sent one) before exposing the new access token. */
        suspend fun save(session: SessionBody) {
            session.refreshToken?.let { secure.put(REFRESH_TOKEN_KEY, it) }
            accessToken = session.accessToken
        }

        suspend fun clear() {
            accessToken = null
            secure.put(REFRESH_TOKEN_KEY, null)
        }

        companion object {
            const val REFRESH_TOKEN_KEY = "refresh_token"
        }
    }
