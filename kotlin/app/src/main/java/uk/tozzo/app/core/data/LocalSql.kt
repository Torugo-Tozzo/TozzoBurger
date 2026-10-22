package uk.tozzo.app.core.data

import com.powersync.db.SqlCursor
import com.powersync.db.getLongOptional
import com.powersync.db.getStringOptional
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import uk.tozzo.app.core.sync.TozzoDatabase
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The seam every repository reads and writes the local database through: the PowerSync
 * implementation in the app, SQLite on Robolectric in tests. Nothing here runs on the main thread.
 */
interface LocalSql {
    suspend fun execute(
        sql: String,
        params: List<Any?> = emptyList(),
    )

    suspend fun <T> getAll(
        sql: String,
        params: List<Any?> = emptyList(),
        map: (SqlRow) -> T,
    ): List<T>

    fun <T> watch(
        sql: String,
        params: List<Any?> = emptyList(),
        map: (SqlRow) -> T,
    ): Flow<List<T>>

    /** All [block]'s writes commit together or not at all. */
    suspend fun <T> writeTransaction(block: suspend (SqlTx) -> T): T
}

interface SqlRow {
    fun string(column: String): String?

    fun long(column: String): Long?
}

interface SqlTx {
    suspend fun execute(
        sql: String,
        params: List<Any?> = emptyList(),
    )

    /** Reads inside the transaction, so it sees the transaction's own writes and nothing else meanwhile. */
    suspend fun <T> getAll(
        sql: String,
        params: List<Any?> = emptyList(),
        map: (SqlRow) -> T,
    ): List<T>
}

/** [LocalSql] on the PowerSync database; every call runs on [Dispatchers.IO]. */
@Singleton
class PowerSyncLocalSql
    @Inject
    constructor(
        private val database: TozzoDatabase,
    ) : LocalSql {
        override suspend fun execute(
            sql: String,
            params: List<Any?>,
        ) {
            withContext(Dispatchers.IO) { database.database().execute(sql, params) }
        }

        override suspend fun <T> getAll(
            sql: String,
            params: List<Any?>,
            map: (SqlRow) -> T,
        ): List<T> =
            withContext(Dispatchers.IO) {
                database.database().getAll(sql, params) { Boxed(map(PowerSyncRow(it))) }.map { it.value }
            }

        override fun <T> watch(
            sql: String,
            params: List<Any?>,
            map: (SqlRow) -> T,
        ): Flow<List<T>> =
            flow {
                emitAll(database.database().watch(sql, params) { Boxed(map(PowerSyncRow(it))) })
            }.map { rows -> rows.map { it.value } }.flowOn(Dispatchers.IO)

        override suspend fun <T> writeTransaction(block: suspend (SqlTx) -> T): T =
            withContext(Dispatchers.IO) {
                database.database().writeTransactionAsync { tx ->
                    block(
                        object : SqlTx {
                            override suspend fun execute(
                                sql: String,
                                params: List<Any?>,
                            ) {
                                tx.execute(sql, params)
                            }

                            override suspend fun <T> getAll(
                                sql: String,
                                params: List<Any?>,
                                map: (SqlRow) -> T,
                            ): List<T> = tx.getAll(sql, params) { Boxed(map(PowerSyncRow(it))) }.map { it.value }
                        },
                    )
                }
            }
    }

private class PowerSyncRow(
    private val cursor: SqlCursor,
) : SqlRow {
    override fun string(column: String): String? = cursor.getStringOptional(column)

    override fun long(column: String): Long? = cursor.getLongOptional(column)
}

/** PowerSync rows must be non-null; a mapper may return null (a row it skips), so it travels boxed. */
private class Boxed<T>(
    val value: T,
)
