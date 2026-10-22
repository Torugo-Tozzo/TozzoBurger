package uk.tozzo.app.testing

import com.powersync.db.crud.CrudEntry
import com.powersync.db.crud.CrudRow
import com.powersync.db.schema.ColumnType
import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import uk.tozzo.app.core.data.LocalSql
import uk.tozzo.app.core.data.SqlRow
import uk.tozzo.app.core.data.SqlTx
import uk.tozzo.app.core.sync.SYNC_REJECTIONS_TABLE
import uk.tozzo.app.core.sync.localSchema

/** Marks the PATCH of an UPDATE that matched a row without changing it (PowerSync queues it with `data = {}`). */
const val UNCHANGED_ROW = "(unchanged row)"

/**
 * [LocalSql] over [inner] that keeps the upload queue PowerSync would keep, as `ps_crud` rows read back by the
 * SDK's own [CrudEntry.fromRow]. Every statement written through it is compared before and after on the synced
 * tables: a new row is a PUT with every column, a changed row a PATCH with the changed columns only, a gone row
 * a DELETE; `orders` carries the previous `customer_name` as `old`. The seeds of the tests write [inner]
 * directly, as the download would, and queue nothing.
 *
 * Not covered: PowerSync's triggers themselves, transaction ids, and which row an UPDATE matched without
 * changing it (it is queued as a PATCH with [UNCHANGED_ROW] as its id).
 */
class CrudRecorder(
    private val inner: RobolectricSql,
) : LocalSql {
    private val rows = mutableListOf<String>()

    /** The queue, oldest first. */
    val entries: List<CrudEntry>
        get() = rows.mapIndexed { index, data -> CrudEntry.fromRow(CrudRow((index + 1).toString(), data, null)) }

    fun clear() = rows.clear()

    override suspend fun execute(
        sql: String,
        params: List<Any?>,
    ) {
        rows += recorded(sql) { inner.execute(sql, params) }
    }

    override suspend fun <T> getAll(
        sql: String,
        params: List<Any?>,
        map: (SqlRow) -> T,
    ): List<T> = inner.getAll(sql, params, map)

    override fun <T> watch(
        sql: String,
        params: List<Any?>,
        map: (SqlRow) -> T,
    ): Flow<List<T>> = inner.watch(sql, params, map)

    override suspend fun <T> writeTransaction(block: suspend (SqlTx) -> T): T {
        val pending = mutableListOf<String>()
        val result =
            inner.writeTransaction { tx ->
                block(
                    object : SqlTx {
                        override suspend fun execute(
                            sql: String,
                            params: List<Any?>,
                        ) {
                            pending += recorded(sql) { tx.execute(sql, params) }
                        }

                        override suspend fun <R> getAll(
                            sql: String,
                            params: List<Any?>,
                            map: (SqlRow) -> R,
                        ): List<R> = tx.getAll(sql, params, map)
                    },
                )
            }
        rows += pending
        return result
    }

    private suspend fun recorded(
        sql: String,
        write: suspend () -> Unit,
    ): List<String> {
        val before = snapshot()
        write()
        val after = snapshot()
        val ops = mutableListOf<String>()
        for ((table, afterRows) in after) {
            val beforeRows = before.getValue(table)
            for ((id, values) in afterRows) {
                val old = beforeRows[id]
                when {
                    old == null -> ops += crud("PUT", table, id, values, null)
                    old != values ->
                        ops += crud("PATCH", table, id, values.filter { (k, v) -> old[k] != v }, old)
                }
            }
            (beforeRows.keys - afterRows.keys).forEach { ops += crud("DELETE", table, it, null, beforeRows[it]) }
        }
        if (sql.trimStart().startsWith("UPDATE", ignoreCase = true)) {
            val matched =
                inner.db
                    .compileStatement("SELECT changes()")
                    .simpleQueryForLong()
                    .toInt()
            val table = sql.trimStart().split(Regex("\\s+"))[1]
            val patched = ops.size
            repeat(maxOf(0, matched - patched)) { ops += crud("PATCH", table, UNCHANGED_ROW, emptyMap(), null) }
        }
        return ops
    }

    private fun crud(
        op: String,
        table: String,
        id: String,
        data: Map<String, JsonElement>?,
        old: Map<String, JsonElement>?,
    ): String =
        buildJsonObject {
            put("op", op)
            put("type", table)
            put("id", id)
            data?.let { put("data", JsonObject(it)) }
            if (table == "orders" && old != null) {
                put("old", JsonObject(mapOf("customer_name" to (old["customer_name"] ?: JsonNull))))
            }
        }.toString()

    private fun snapshot(): Map<String, Map<String, Map<String, JsonElement>>> =
        localSchema.tables.filter { it.name != SYNC_REJECTIONS_TABLE }.associate { table ->
            table.name to
                inner.db.rawQuery("SELECT * FROM ${table.name}", null).use { cursor ->
                    buildMap {
                        while (cursor.moveToNext()) {
                            val id = cursor.getString(cursor.getColumnIndexOrThrow("id"))
                            put(
                                id,
                                table.columns.associate { column ->
                                    val at = cursor.getColumnIndexOrThrow(column.name)
                                    column.name to
                                        when {
                                            cursor.isNull(at) -> JsonNull
                                            column.type == ColumnType.INTEGER -> JsonPrimitive(cursor.getLong(at))
                                            else -> JsonPrimitive(cursor.getString(at))
                                        }
                                },
                            )
                        }
                    }
                }
        }
}
