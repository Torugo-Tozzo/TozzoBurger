package uk.tozzo.app.core.session

import kotlinx.coroutines.CancellationException

/** The local database, as the sign-in sees it (a seam for tests). */
interface LocalDataGate {
    /** Ops waiting in the upload queue; throws when the database cannot be read. */
    suspend fun readPendingOpCount(): Int

    /** Disconnects and deletes every local row; throws when it fails. */
    suspend fun clearLocalData()
}

/**
 * Called when no binding could be read: the local database may still hold the rows and the queue
 * of a user whose binding the secure store lost. An empty queue is cleared before the new user is
 * bound; a queue with changes is never handed to someone else. Null when the login may go on.
 */
@Suppress("TooGenericExceptionCaught", "SwallowedException")
internal suspend fun LocalDataGate.prepareForNewUser(): LoginResult? =
    try {
        if (readPendingOpCount() > 0) {
            LoginResult.UnsentDataOfUnknownUser
        } else {
            clearLocalData()
            null
        }
    } catch (e: CancellationException) {
        throw e
    } catch (_: Exception) {
        LoginResult.Failed(null)
    }
