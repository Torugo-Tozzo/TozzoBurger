package uk.tozzo.app.core.sync

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.mapNotNull
import kotlinx.coroutines.flow.onStart
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import uk.tozzo.app.core.session.DeviceBinding
import uk.tozzo.app.core.session.LocalDataGate

enum class SyncState { OFFLINE, SYNCING, SYNCED, FIRST_SYNC_PENDING }

/** Ops waiting in the local upload queue. */
internal const val PENDING_OPS_SQL = "SELECT count(*) FROM ps_crud"

/** Ops the server rejected, kept on the device. */
internal const val REJECTIONS_SQL = "SELECT count(*) FROM $SYNC_REJECTIONS_TABLE"

/**
 * Runs the sync of the [LocalDatabase]: connects while the device is bound and calls `connect()`
 * again every time the network comes back, because the SDK does not resume the upload by itself.
 */
class SyncController(
    private val db: LocalDatabase,
    private val connectivity: Connectivity,
    private val binding: DeviceBinding,
    private val scope: CoroutineScope,
) : LocalDataGate {
    private val mutex = Mutex()
    private var reconnects: Job? = null

    // A database that cannot be opened reads as an unknown status (null), never as an exception.
    private val status: Flow<LocalSyncStatus?> = db.status().catchAsNull()

    /** The raw SDK status; every change is progress or failure news for the first sync screen. */
    val syncStatus: Flow<LocalSyncStatus?> get() = status

    /** Whether a full sync ever finished; kept by the SDK in the database, so it survives a restart. */
    val hasSynced: Flow<Boolean> =
        db
            .status()
            .mapNotNull { it.hasSynced }
            .distinctUntilChanged()
            .catch { emit(false) }

    /** Null when the queue cannot be read. */
    val pendingOpCount: Flow<Int?> = db.watchCount(PENDING_OPS_SQL).catchAsNull()

    /** Null when the table cannot be read. */
    val rejectionCount: Flow<Int?> = db.watchCount(REJECTIONS_SQL).catchAsNull()

    // Declared after pendingOpCount: it is collected eagerly, during construction.
    val state: StateFlow<SyncState> =
        combine(connectivity.online, status, pendingOrUnknown()) { online, status, pending ->
            stateOf(online, status, pending)
        }.stateIn(
            scope,
            SharingStarted.Eagerly,
            if (connectivity.online.value) SyncState.FIRST_SYNC_PENDING else SyncState.OFFLINE,
        )

    /** The size of the upload queue now; throws when the database cannot be read. */
    override suspend fun readPendingOpCount(): Int = db.watchCount(PENDING_OPS_SQL).first()

    /** Connects when the device is bound and online, and on every reconnect after that. */
    suspend fun start() {
        mutex.withLock {
            if (binding.current.value == null || reconnects?.isActive == true) return
            reconnects =
                scope.launch {
                    connectivity.online.filter { it }.collect { connectOrWait() }
                }
        }
    }

    suspend fun stop() {
        cancelReconnects()
        db.disconnect()
    }

    /** Disconnects and deletes every local row, including the queue and [SYNC_REJECTIONS_TABLE]. */
    override suspend fun clearLocalData() {
        cancelReconnects()
        db.disconnectAndClear()
    }

    /** A failed `connect()` (database or SDK error) waits for the next reconnect instead of ending the loop. */
    @Suppress("TooGenericExceptionCaught", "SwallowedException")
    private suspend fun connectOrWait() {
        try {
            db.connect()
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // retried on the next reconnect
        }
    }

    private suspend fun cancelReconnects() {
        mutex.withLock {
            reconnects?.cancel()
            reconnects = null
        }
    }

    // Until the queue was read, its size is unknown: the state starts without waiting for it.
    private fun pendingOrUnknown(): Flow<Int?> = pendingOpCount.onStart { emit(null) }

    /**
     * SYNCED only when the server is connected, nothing failed and the queue is empty; anything
     * else while online (connecting, an error the SDK retries, pending ops, an unreadable database)
     * is SYNCING, never green.
     */
    private fun stateOf(
        online: Boolean,
        status: LocalSyncStatus?,
        pending: Int?,
    ): SyncState =
        when {
            !online -> SyncState.OFFLINE
            status == null -> SyncState.SYNCING
            status.hasSynced != true -> SyncState.FIRST_SYNC_PENDING
            !status.isIdle() || pending != 0 -> SyncState.SYNCING
            else -> SyncState.SYNCED
        }

    private fun LocalSyncStatus.isIdle() = connected && !downloading && !uploading && !uploadFailed && !downloadFailed
}

/** Emits null instead of failing; a cancellation still cancels. */
private fun <T : Any> Flow<T>.catchAsNull(): Flow<T?> = map<T, T?> { it }.catch { emit(null) }
