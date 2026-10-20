package uk.tozzo.app.core.sync

import kotlinx.coroutines.CancellationException
import uk.tozzo.app.core.session.SignOutService
import javax.inject.Inject
import javax.inject.Singleton

/**
 * "Sign out": ends the session and stops the sync, keeping the device binding and the local
 * database, so only the same user can sign in again and nothing unsent is lost.
 */
@Singleton
class SignOut
    @Inject
    constructor(
        private val sessions: SignOutService,
        private val sync: SyncController,
    ) {
        /** Never throws (but for cancellation): "Sair" always leads to the login. */
        suspend fun signOut() {
            bestEffort { sessions.signOutKeepingData() }
            // A store failure above must not leave the sync running on a dead session.
            bestEffort { sync.stop() }
        }

        @Suppress("TooGenericExceptionCaught", "SwallowedException")
        private suspend fun bestEffort(block: suspend () -> Unit) {
            try {
                block()
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                // the app goes to the login either way
            }
        }
    }
