package uk.tozzo.app.core.sync

import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import uk.tozzo.app.core.network.UploadResult

/**
 * The SQL itself only runs on the device (PowerSync's SQLite is not on the JVM test classpath);
 * this checks that the insert is guarded by the op id, so recording the same op twice keeps one row.
 */
class DatabaseRejectionSinkTest {
    private val statements = mutableListOf<Pair<String, List<Any?>>>()
    private val sink = DatabaseRejectionSink { sql, params -> statements += sql to params }
    private val op = PendingOp(3, "PATCH", "orders", "o-1", mapOf("is_open" to 0L))

    @Test
    fun insertIsSkippedWhenTheOpIdIsAlreadyRecorded() =
        runTest {
            sink.record(op, "op-3", UploadResult("op-3", "duplicate", "SYNC_OP_INVALID", null))

            val (sql, params) = statements.single()
            assertTrue(sql.startsWith("INSERT INTO sync_rejections"))
            assertTrue(sql.contains("WHERE NOT EXISTS (SELECT 1 FROM sync_rejections WHERE op_id = ?)"))
            assertEquals(sql.count { it == '?' }, params.size)
            assertEquals("op-3", params.last())
        }

    @Test
    fun rowCarriesTheOpAndTheResult() =
        runTest {
            sink.record(op, "op-3", UploadResult("op-3", "rejected", "SYNC_OP_INVALID", "bad"))

            val params = statements.single().second
            assertEquals(listOf("op-3", "orders", "o-1", "PATCH", "SYNC_OP_INVALID", "bad"), params.take(6))
        }
}
