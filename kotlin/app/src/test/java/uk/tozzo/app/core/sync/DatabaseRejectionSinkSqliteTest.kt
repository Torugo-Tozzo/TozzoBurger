package uk.tozzo.app.core.sync

import android.database.sqlite.SQLiteDatabase
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import uk.tozzo.app.core.network.UploadResult

/**
 * Runs the sink's real SQL on Robolectric's SQLite, after the stage-1 table was upgraded to the new
 * schema. `uuid()` is a PowerSync function, so the test swaps it for an equivalent SQLite expression.
 */
@RunWith(RobolectricTestRunner::class)
class DatabaseRejectionSinkSqliteTest {
    private lateinit var db: SQLiteDatabase
    private val sink =
        DatabaseRejectionSink { sql, params ->
            db.execSQL(sql.replace("uuid()", "lower(hex(randomblob(16)))"), params.toTypedArray())
        }

    @Before
    fun setUp() {
        db = SQLiteDatabase.create(null)
        // Stage 1 schema, then the columns this task adds (PowerSync does this by itself on the views).
        db.execSQL(
            "CREATE TABLE sync_rejections (id TEXT PRIMARY KEY, op_id TEXT, table_name TEXT, row_id TEXT, " +
                "op TEXT, code TEXT, detail TEXT, created_at TEXT)",
        )
        db.execSQL("ALTER TABLE sync_rejections ADD COLUMN op_data TEXT")
        db.execSQL("ALTER TABLE sync_rejections ADD COLUMN summary TEXT")
        db.execSQL("CREATE TABLE orders (id TEXT PRIMARY KEY, customer_name TEXT)")
        db.execSQL("INSERT INTO orders VALUES ('o-1', 'Bia')")
    }

    @After
    fun tearDown() = db.close()

    private fun rows() =
        buildList {
            db
                .rawQuery(
                    "SELECT op_id, table_name, row_id, op, code, detail, op_data, summary " +
                        "FROM sync_rejections ORDER BY op_id",
                    null,
                ).use { c ->
                    while (c.moveToNext()) add((0..7).map { c.getString(it) })
                }
        }

    private fun result(opId: String) = UploadResult(opId, "rejected", "ORDER_NOT_OPEN", "closed")

    @Test
    fun recordsEveryColumnInItsPlace() =
        runTest {
            val op =
                PendingOp(
                    1,
                    "PATCH",
                    "orders",
                    "o-1",
                    mapOf("customer_name" to "Ana", "is_delivery" to 1L, "items_json" to "[]"),
                )
            sink.record(op, "op-1", result("op-1"))

            assertEquals(
                listOf(
                    listOf(
                        "op-1",
                        "orders",
                        "o-1",
                        "PATCH",
                        "ORDER_NOT_OPEN",
                        "closed",
                        """{"customer_name":"Ana","is_delivery":1}""",
                        "Ana",
                    ),
                ),
                rows(),
            )
        }

    @Test
    fun orderWithoutNameTakesTheNameOfTheOrderRow() =
        runTest {
            sink.record(PendingOp(2, "PATCH", "orders", "o-1", mapOf("is_open" to 0L)), "op-2", result("op-2"))
            // Another table never reads the orders row, even with the same id.
            sink.record(PendingOp(3, "PATCH", "products", "o-1", mapOf("price" to "1")), "op-3", result("op-3"))

            assertEquals(listOf("Bia", null), rows().map { it[7] })
        }

    @Test
    fun sameOpIdKeepsOneRow() =
        runTest {
            val op = PendingOp(4, "PATCH", "orders", "o-1", mapOf("customer_name" to "Ana"))
            sink.record(op, "op-4", result("op-4"))
            sink.record(op, "op-4", result("op-4"))

            assertEquals(1, rows().size)
        }
}
