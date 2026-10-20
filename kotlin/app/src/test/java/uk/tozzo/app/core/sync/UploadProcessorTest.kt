package uk.tozzo.app.core.sync

import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Timeout
import retrofit2.create
import uk.tozzo.app.core.network.ApiJson
import uk.tozzo.app.core.network.NetworkModule
import uk.tozzo.app.core.network.SyncApi
import uk.tozzo.app.core.network.UploadResult
import java.util.concurrent.TimeUnit

@Timeout(20)
class UploadProcessorTest {
    private val server = MockWebServer()
    private val sink = RecordingSink()
    private lateinit var processor: UploadProcessor

    private val sale = PendingOp(1, "PUT", "sales", "sale-1", mapOf("is_cancelled" to 0L, "items_json" to "[]"))
    private val saleItem = PendingOp(2, "PUT", "sale_items", "si-1", mapOf("sale_id" to "sale-1"))
    private val order = PendingOp(3, "PATCH", "orders", "o-1", mapOf("is_open" to 0L))

    @BeforeEach
    fun setUp() {
        server.start()
        val client = OkHttpClient.Builder().readTimeout(5, TimeUnit.SECONDS).build()
        val api: SyncApi = NetworkModule.apiRetrofit(server.url("/").toString(), client).create()
        processor = UploadProcessor(api, sink) { DEVICE }
    }

    @AfterEach
    fun tearDown() {
        server.shutdown()
    }

    private fun results(vararg r: String) =
        MockResponse()
            .setHeader("Content-Type", "application/json")
            .setBody("""{"results":[${r.joinToString(",")}]}""")

    private fun sentOpIds(): List<String> {
        val body = ApiJson.parseToJsonElement(server.takeRequest(5, TimeUnit.SECONDS)!!.body.readUtf8()).jsonObject
        return body["ops"]!!.jsonArray.map { it.jsonObject["opId"]!!.jsonPrimitive.content }
    }

    @Test
    fun rejectedOpIsRecordedBeforeReturn() =
        runTest {
            val saleOpId = UploadMapper.opId(DEVICE, 1)
            val orderOpId = UploadMapper.opId(DEVICE, 3)
            val rejection = UploadResult(orderOpId, "rejected", "SYNC_OP_INVALID", "is_open must be boolean")
            server.enqueue(
                results(
                    """{"opId":"$saleOpId","status":"applied"}""",
                    ApiJson.encodeToString(UploadResult.serializer(), rejection),
                ),
            )

            processor.process(listOf(sale, saleItem, order))

            assertEquals(listOf(Triple(order, orderOpId, rejection)), sink.records)
        }

    @Test
    fun appliedAndDuplicateWithoutCodeAreNotRecorded() =
        runTest {
            server.enqueue(
                results(
                    """{"opId":"${UploadMapper.opId(DEVICE, 1)}","status":"duplicate"}""",
                    """{"opId":"${UploadMapper.opId(DEVICE, 3)}","status":"applied"}""",
                ),
            )

            processor.process(listOf(sale, order))

            assertTrue(sink.records.isEmpty())
        }

    @Test
    fun duplicateWithCodeIsRecorded() =
        runTest {
            val orderOpId = UploadMapper.opId(DEVICE, 3)
            val duplicate = UploadResult(orderOpId, "duplicate", "SYNC_OP_INVALID", null)
            server.enqueue(
                results(
                    """{"opId":"${UploadMapper.opId(DEVICE, 1)}","status":"duplicate"}""",
                    ApiJson.encodeToString(UploadResult.serializer(), duplicate),
                ),
            )

            processor.process(listOf(sale, order))

            assertEquals(listOf(Triple(order, orderOpId, duplicate)), sink.records)
        }

    @Test
    fun badItemsJsonIsRecordedLocallyAndTheRestIsSent() =
        runTest {
            val bad = PendingOp(5, "PUT", "sales", "sale-bad", mapOf("items_json" to "{not json"))
            server.enqueue(results())

            processor.process(listOf(bad, order))

            assertEquals(listOf(UploadMapper.opId(DEVICE, 3)), sentOpIds())
            assertEquals(1, sink.records.size)
            val (op, opId, result) = sink.records.single()
            assertEquals(bad, op)
            assertEquals(UploadMapper.opId(DEVICE, 5), opId)
            assertEquals(opId, result.opId)
            assertEquals("rejected", result.status)
            assertEquals("LOCAL_INVALID_DATA", result.code)
            assertTrue(!result.detail.isNullOrBlank())
        }

    @Test
    fun onlyBadOpsMakeNoRequestAndAreAllRecorded() =
        runTest {
            val notJson = PendingOp(5, "PUT", "sales", "s5", mapOf("items_json" to "{not json"))
            val notArray = PendingOp(6, "PUT", "sales", "s6", mapOf("items_json" to """{"a":1}"""))

            processor.process(listOf(notJson, notArray))

            assertEquals(0, server.requestCount)
            assertEquals(listOf("s5", "s6"), sink.records.map { it.first.id })
            assertTrue(sink.records.all { it.third.code == "LOCAL_INVALID_DATA" })
        }

    @Test
    fun uploadSendsDeviceIdAndSkipsSaleItems() =
        runTest {
            server.enqueue(results())

            processor.process(listOf(sale, saleItem, order))

            val body = ApiJson.parseToJsonElement(server.takeRequest(5, TimeUnit.SECONDS)!!.body.readUtf8()).jsonObject
            assertEquals(DEVICE, body["deviceId"]!!.jsonPrimitive.content)
            val tables = body["ops"]!!.jsonArray.map { it.jsonObject["table"]!!.jsonPrimitive.content }
            assertEquals(listOf("sales", "orders"), tables)
        }

    @Test
    fun onlySaleItemsMakesNoRequest() =
        runTest {
            processor.process(listOf(saleItem))

            assertEquals(0, server.requestCount)
        }

    @Test
    fun httpFailureThrowsAndRecordsNothing() =
        runTest {
            server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))

            val result = runCatching { processor.process(listOf(sale, order)) }

            assertTrue(result.isFailure)
            assertTrue(sink.records.isEmpty())
        }

    @Test
    fun serverErrorThrowsAndRecordsNothing() =
        runTest {
            server.enqueue(MockResponse().setResponseCode(500))

            val result = runCatching { processor.process(listOf(sale, order)) }

            assertTrue(result.isFailure)
            assertTrue(sink.records.isEmpty())
        }

    @Test
    fun retryUsesSameOpIds() =
        runTest {
            server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AFTER_REQUEST))
            server.enqueue(results())

            runCatching { processor.process(listOf(sale, order)) }
            processor.process(listOf(sale, order))

            val first = sentOpIds()
            val second = sentOpIds()
            assertEquals(listOf(UploadMapper.opId(DEVICE, 1), UploadMapper.opId(DEVICE, 3)), first)
            assertEquals(first, second)
        }

    private class RecordingSink : RejectionSink {
        val records = mutableListOf<Triple<PendingOp, String, UploadResult>>()

        override suspend fun record(
            op: PendingOp,
            opId: String,
            result: UploadResult,
        ) {
            records += Triple(op, opId, result)
        }
    }

    private companion object {
        const val DEVICE = "device-1"
    }
}
