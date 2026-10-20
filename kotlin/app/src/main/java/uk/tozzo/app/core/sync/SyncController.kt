package uk.tozzo.app.core.sync

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.mapNotNull
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import uk.tozzo.app.core.session.DeviceBinding

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
) {
    private val mutex = Mutex()
    private var reconnects: Job? = null

    val state: StateFlow<SyncState> =
        combine(connectivity.online, db.status()) { online, status -> stateOf(online, status) }
            .stateIn(
                scope,
                SharingStarted.Eagerly,
                if (connectivity.online.value) SyncState.FIRST_SYNC_PENDING else SyncState.OFFLINE,
            )

    /** Whether a full sync ever finished; kept by the SDK in the database, so it survives a restart. */
    val hasSynced: Flow<Boolean> = db.status().mapNotNull { it.hasSynced }.distinctUntilChanged()

    val pendingOpCount: Flow<Int> = db.watchCount(PENDING_OPS_SQL)

    val rejectionCount: Flow<Int> = db.watchCount(REJECTIONS_SQL)

    /** Connects when the device is bound and online, and on every reconnect after that. */
    suspend fun start() {
        mutex.withLock {
            if (binding.current.value == null || reconnects?.isActive == true) return
            reconnects =
                scope.launch {
                    connectivity.online.filter { it }.collect { db.connect() }
                }
        }
    }

    suspend fun stop() {
        cancelReconnects()
        db.disconnect()
    }

    /** Disconnects and deletes every local row, including the queue and [SYNC_REJECTIONS_TABLE]. */
    suspend fun clearLocalData() {
        cancelReconnects()
        db.disconnectAndClear()
    }

    private suspend fun cancelReconnects() {
        mutex.withLock {
            reconnects?.cancel()
            reconnects = null
        }
    }

    private fun stateOf(
        online: Boolean,
        status: LocalSyncStatus,
    ): SyncState =
        when {
            !online -> SyncState.OFFLINE
            status.hasSynced != true -> SyncState.FIRST_SYNC_PENDING
            status.downloading || status.uploading -> SyncState.SYNCING
            else -> SyncState.SYNCED
        }
}
