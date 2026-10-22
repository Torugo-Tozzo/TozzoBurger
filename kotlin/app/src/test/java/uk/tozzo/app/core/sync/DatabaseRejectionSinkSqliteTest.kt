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
        db.execSQL("CREATE TABLE order_items (id TEXT PRIMARY KEY, order_id TEXT)")
        db.execSQL("INSERT INTO order_items VALUES ('i-1', 'o-1')")
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
    fun anItemOpTakesTheCustomerOfItsOrder() =
        runTest {
            sink.record(PendingOp(5, "PATCH", "order_items", "i-1", mapOf("status" to "READY")), "op-5", result("op-5"))
            // An item whose row is gone, or another table with the same id, has no customer to show.
            sink.record(PendingOp(6, "PATCH", "order_items", "i-9", mapOf("status" to "READY")), "op-6", result("op-6"))
            sink.record(PendingOp(7, "PATCH", "products", "i-1", mapOf("price" to "1")), "op-7", result("op-7"))

            assertEquals(listOf("Bia", null, null), rows().map { it[7] })
            assertEquals("""{"status":"READY"}""", rows()[0][6])
        }

    @Test
    fun aDeleteOfAnOrderAlreadyGoneTakesTheTrackedPreviousName() =
        runTest {
            // The row is gone locally and a DELETE carries no data: only the tracked previous value names it.
            val delete = PendingOp(8, "DELETE", "orders", "o-gone", null, mapOf("customer_name" to "Carla"))
            sink.record(delete, "op-8", result("op-8"))
            sink.record(PendingOp(9, "DELETE", "orders", "o-gone2", null), "op-9", result("op-9"))

            assertEquals(listOf("Carla", null), rows().map { it[7] })
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
