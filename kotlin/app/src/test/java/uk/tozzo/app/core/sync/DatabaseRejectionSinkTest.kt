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

    @Test
    fun recordsOpDataAndSummary() =
        runTest {
            val order =
                PendingOp(
                    4,
                    "PATCH",
                    "orders",
                    "o-9",
                    mapOf("customer_name" to "Ana", "is_delivery" to 1L, "items_json" to """[{"id":"i1"}]"""),
                )
            sink.record(order, "op-4", UploadResult("op-4", "rejected", "ORDER_NOT_OPEN", "closed"))

            val (sql, params) = statements.single()
            assertTrue(sql.contains("op_data, summary"))
            assertEquals(sql.count { it == '?' }, params.size)
            assertEquals("""{"customer_name":"Ana","is_delivery":1}""", params[6])
            assertEquals("Ana", params[7])
        }

    @Test
    fun summaryFallsBackToNameThenDescriptionThenNull() =
        runTest {
            sink.record(
                PendingOp(5, "PATCH", "products", "p", mapOf("name" to "Burger")),
                "op-5",
                UploadResult("op-5", "rejected", "PRODUCT_NOT_FOUND", null),
            )
            sink.record(
                PendingOp(6, "PATCH", "product_types", "t", mapOf("description" to "Drinks")),
                "op-6",
                UploadResult("op-6", "rejected", "PRODUCT_TYPE_NOT_FOUND", null),
            )
            sink.record(op, "op-3", UploadResult("op-3", "rejected", "ORDER_NOT_OPEN", null))

            assertEquals(listOf<Any?>("Burger", "Drinks", null), statements.map { it.second[7] })
            assertEquals("""{"is_open":0}""", statements.last().second[6])
        }
}
