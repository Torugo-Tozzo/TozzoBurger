package uk.tozzo.app.core.sync

import android.content.Context
import com.powersync.DatabaseDriverFactory
import com.powersync.PowerSyncDatabase
import com.powersync.db.getStringOptional
import com.powersync.sync.SyncStatusData
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onStart
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import uk.tozzo.app.core.network.UploadResult
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

/** What the app needs of the sync status of the [LocalDatabase]. */
data class LocalSyncStatus(
    val connected: Boolean,
    val downloading: Boolean,
    val uploading: Boolean,
    /** Null until the SDK has read the stored sync state. */
    val hasSynced: Boolean?,
    /** The last upload attempt failed (the SDK retries it). */
    val uploadFailed: Boolean = false,
    /** The last download or connection attempt failed (the SDK retries it). */
    val downloadFailed: Boolean = false,
)

/** A row of [SYNC_REJECTIONS_TABLE]: a local change the server refused. */
data class SyncRejection(
    val id: String,
    val tableName: String,
    val code: String?,
    val detail: String?,
    /** ISO-8601 instant, as recorded by [DatabaseRejectionSink]. */
    val createdAt: String,
)

/** Every rejection, newest first. */
internal const val REJECTIONS_LIST_SQL =
    "SELECT id, table_name, code, detail, created_at FROM $SYNC_REJECTIONS_TABLE ORDER BY created_at DESC"

/** The local database, seen by the [SyncController] (a seam for tests without the SDK). */
interface LocalDatabase {
    fun status(): Flow<LocalSyncStatus>

    /** Watches a `SELECT count(*)` query. */
    fun watchCount(sql: String): Flow<Int>

    /** Watches [SYNC_REJECTIONS_TABLE], newest first. */
    fun watchRejections(): Flow<List<SyncRejection>>

    suspend fun connect()

    suspend fun disconnect()

    /** Disconnects and deletes every row, local-only tables included. */
    suspend fun disconnectAndClear()
}

/** The PowerSync database of the app (`tozzo.db`), opened on [Dispatchers.IO] when first used. */
@Singleton
class TozzoDatabase
    @Inject
    constructor(
        @ApplicationContext private val context: Context,
        private val connector: TozzoConnector,
    ) : LocalDatabase {
        private val mutex = Mutex()
        private var opened: PowerSyncDatabase? = null

        suspend fun database(): PowerSyncDatabase =
            mutex.withLock {
                opened ?: withContext(Dispatchers.IO) {
                    PowerSyncDatabase(
                        factory = DatabaseDriverFactory(context),
                        schema = localSchema,
                        dbFilename = DB_FILE,
                    )
                }.also { opened = it }
            }

        override fun status(): Flow<LocalSyncStatus> =
            flow {
                val status = database().currentStatus
                emitAll(status.asFlow().onStart { emit(status) })
            }.map { it.toLocal() }.distinctUntilChanged()

        override fun watchCount(sql: String): Flow<Int> =
            flow {
                emitAll(database().watch(sql) { it.getLong(0) ?: 0L })
            }.map { rows -> rows.firstOrNull()?.toInt() ?: 0 }.distinctUntilChanged()

        override fun watchRejections(): Flow<List<SyncRejection>> =
            flow {
                emitAll(
                    database().watch(REJECTIONS_LIST_SQL) {
                        SyncRejection(
                            id = it.getStringOptional("id").orEmpty(),
                            tableName = it.getStringOptional("table_name").orEmpty(),
                            code = it.getStringOptional("code"),
                            detail = it.getStringOptional("detail"),
                            createdAt = it.getStringOptional("created_at").orEmpty(),
                        )
                    },
                )
            }.distinctUntilChanged()

        override suspend fun connect() {
            database().connect(connector)
        }

        override suspend fun disconnect() {
            database().disconnect()
        }

        // clearLocal also empties the local-only tables (sync_rejections): powersync_clear flag 1.
        override suspend fun disconnectAndClear() {
            database().disconnectAndClear(clearLocal = true)
        }

        private fun SyncStatusData.toLocal() =
            LocalSyncStatus(
                connected = connected,
                downloading = downloading,
                uploading = uploading,
                hasSynced = hasSynced,
                uploadFailed = uploadError != null,
                downloadFailed = downloadError != null,
            )

        private companion object {
            const val DB_FILE = "tozzo.db"
        }
    }

/**
 * [RejectionSink] on the local-only `sync_rejections` table, through [execute] (`Queries.execute`).
 * One row per op id: a crash between recording and completing the batch must not add a second row.
 */
class DatabaseRejectionSink(
    private val execute: suspend (sql: String, params: List<Any?>) -> Unit,
) : RejectionSink {
    override suspend fun record(
        op: PendingOp,
        opId: String,
        result: UploadResult,
    ) {
        execute(
            "INSERT INTO $SYNC_REJECTIONS_TABLE (id, op_id, table_name, row_id, op, code, detail, created_at) " +
                "SELECT uuid(), ?, ?, ?, ?, ?, ?, ? " +
                "WHERE NOT EXISTS (SELECT 1 FROM $SYNC_REJECTIONS_TABLE WHERE op_id = ?)",
            listOf(opId, op.table, op.id, op.op, result.code, result.detail, Instant.now().toString(), opId),
        )
    }
}
