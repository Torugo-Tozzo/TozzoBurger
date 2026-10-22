package uk.tozzo.app.testing

import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onStart
import uk.tozzo.app.core.data.LocalSql
import uk.tozzo.app.core.data.SqlRow
import uk.tozzo.app.core.data.SqlTx
import uk.tozzo.app.core.sync.localSchema

/**
 * [LocalSql] on Robolectric's SQLite, with one table per `Table` of [localSchema]: `id TEXT PRIMARY KEY`
 * plus its columns, so the repositories' real SQL runs in the tests. Watches re-run after every write.
 */
class RobolectricSql(
    val db: SQLiteDatabase = SQLiteDatabase.create(null),
) : LocalSql {
    private val writes = MutableSharedFlow<Unit>(extraBufferCapacity = 1)

    init {
        localSchema.tables.forEach { table ->
            val columns = table.columns.joinToString("") { ", ${it.name} ${it.type.name}" }
            db.execSQL("CREATE TABLE ${table.name} (id TEXT PRIMARY KEY$columns)")
        }
    }

    fun close() = db.close()

    override suspend fun execute(
        sql: String,
        params: List<Any?>,
    ) {
        db.execSQL(sql, params.toTypedArray())
        writes.tryEmit(Unit)
    }

    override suspend fun <T> getAll(
        sql: String,
        params: List<Any?>,
        map: (SqlRow) -> T,
    ): List<T> =
        db.rawQuery(sql, params.map { it?.toString() }.toTypedArray()).use { cursor ->
            val row = CursorRow(cursor)
            buildList { while (cursor.moveToNext()) add(map(row)) }
        }

    override fun <T> watch(
        sql: String,
        params: List<Any?>,
        map: (SqlRow) -> T,
    ): Flow<List<T>> = writes.onStart { emit(Unit) }.map { getAll(sql, params, map) }

    override suspend fun <T> writeTransaction(block: suspend (SqlTx) -> T): T {
        db.beginTransaction()
        try {
            val result =
                block(
                    object : SqlTx {
                        override suspend fun execute(
                            sql: String,
                            params: List<Any?>,
                        ) = db.execSQL(sql, params.toTypedArray())

                        override suspend fun <R> getAll(
                            sql: String,
                            params: List<Any?>,
                            map: (SqlRow) -> R,
                        ): List<R> = this@RobolectricSql.getAll(sql, params, map)
                    },
                )
            db.setTransactionSuccessful()
            return result
        } finally {
            db.endTransaction()
            writes.tryEmit(Unit)
        }
    }

    private class CursorRow(
        private val cursor: Cursor,
    ) : SqlRow {
        override fun string(column: String): String? = at(column)?.let(cursor::getString)

        override fun long(column: String): Long? = at(column)?.let(cursor::getLong)

        private fun at(column: String): Int? = cursor.getColumnIndexOrThrow(column).takeIf { !cursor.isNull(it) }
    }
}
