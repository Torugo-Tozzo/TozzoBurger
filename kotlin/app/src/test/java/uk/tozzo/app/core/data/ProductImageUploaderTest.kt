package uk.tozzo.app.core.data

import android.net.Uri
import kotlinx.coroutines.test.runTest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import retrofit2.create
import uk.tozzo.app.core.network.NetworkModule
import uk.tozzo.app.core.network.UploadsApi

private const val KEY = "establishments/e1/products/p1/0b9ad5d2-0c6c-4c1c-9f6a-6f7f2a3b4c5d.jpg"
private const val MIB = 1024 * 1024L

private class FakeSource(
    private val info: ImageInfo?,
    private val bytes: ByteArray = ByteArray(0),
) : ImageSource {
    var bodies = 0

    override fun info(uri: Uri): ImageInfo? = info

    override fun body(
        uri: Uri,
        contentType: String,
        sizeBytes: Long,
    ): RequestBody {
        bodies++
        return bytes.toRequestBody(contentType.toMediaType())
    }
}

@RunWith(RobolectricTestRunner::class)
class ProductImageUploaderTest {
    private val server = MockWebServer()
    private val requests = mutableListOf<RecordedRequest>()
    private var putStatus = 200
    private var createResponse: MockResponse? = null
    private val uri = Uri.parse("content://media/picker/1")

    @Before
    fun setUp() {
        server.dispatcher =
            object : Dispatcher() {
                override fun dispatch(request: RecordedRequest): MockResponse {
                    requests += request
                    return when {
                        request.method == "POST" && request.path == "/v1/uploads" ->
                            createResponse ?: json(
                                """{"uploadUrl":"${server.url("/bucket/$KEY")}","objectKey":"$KEY",
                                |"expiresAt":"2026-10-20T12:00:00Z",
                                |"headers":{"x-amz-acl":"private","Content-Length":"999","Host":"evil.example"}}
                                """.trimMargin(),
                            )
                        request.method == "PUT" -> MockResponse().setResponseCode(putStatus)
                        request.method == "PATCH" -> json("""{"id":"p1"}""")
                        else -> MockResponse().setResponseCode(404)
                    }
                }
            }
        server.start()
    }

    @After
    fun tearDown() = server.shutdown()

    private fun json(body: String) = MockResponse().setHeader("Content-Type", "application/json").setBody(body)

    private fun uploader(source: ImageSource): ProductImageUploader {
        // The API client adds the bearer token, like the app's; the presigned PUT client must not.
        val authed =
            OkHttpClient
                .Builder()
                .addInterceptor {
                    it.proceed(
                        it
                            .request()
                            .newBuilder()
                            .header("Authorization", "Bearer tok")
                            .build(),
                    )
                }.build()
        val api = NetworkModule.apiRetrofit(server.url("/").toString(), authed).create<UploadsApi>()
        return ProductImageUploader(api, OkHttpClient(), source)
    }

    @Test
    fun threeStepsInOrderWithTheReturnedHeaders() =
        runTest {
            val bytes = ByteArray(2048) { it.toByte() }
            val source = FakeSource(ImageInfo("image/jpeg", bytes.size.toLong()), bytes)

            val key = uploader(source).upload("p1", uri)

            assertEquals(KEY, key)
            assertEquals(listOf("POST", "PUT", "PATCH"), requests.map { it.method })

            val create = requests[0]
            assertEquals(
                """{"kind":"product","targetId":"p1","contentType":"image/jpeg","sizeBytes":2048}""",
                create.body.readUtf8(),
            )
            assertEquals("Bearer tok", create.getHeader("Authorization"))

            val put = requests[1]
            assertEquals("/bucket/$KEY", put.path)
            assertEquals("private", put.getHeader("x-amz-acl"))
            assertEquals("image/jpeg", put.getHeader("Content-Type"))
            // content-length and host are the client's own, never the signed copies.
            assertEquals("2048", put.getHeader("Content-Length"))
            assertNotEquals("evil.example", put.getHeader("Host"))
            assertEquals(bytes.toList(), put.body.readByteArray().toList())
            assertNull(put.getHeader("Authorization"))

            val patch = requests[2]
            assertEquals("/v1/products/p1", patch.path)
            assertEquals("""{"imageKey":"$KEY"}""", patch.body.readUtf8())
            assertEquals("Bearer tok", patch.getHeader("Authorization"))
        }

    @Test
    fun aSixMegabyteFileIsRefusedBeforeAnyRequest() =
        runTest {
            val source = FakeSource(ImageInfo("image/jpeg", 6 * MIB))

            val error = assertThrows(ImageUploadException::class.java) { runBlockingUpload(source) }

            assertEquals(ImageUploadException.Reason.INVALID, error.reason)
            assertEquals(0, server.requestCount)
            assertEquals(0, source.bodies)
        }

    @Test
    fun exactlyFiveMebibytesIsAccepted() =
        runTest {
            val size = 5 * MIB
            val source = FakeSource(ImageInfo("image/webp", size), ByteArray(size.toInt()))

            uploader(source).upload("p1", uri)

            assertEquals(3, server.requestCount)
        }

    @Test
    fun otherTypesAndEmptyFilesAreRefusedBeforeAnyRequest() =
        runTest {
            listOf(ImageInfo("image/gif", 100), ImageInfo(null, 100), ImageInfo("image/png", 0), null).forEach {
                val error = assertThrows(ImageUploadException::class.java) { runBlockingUpload(FakeSource(it)) }
                assertEquals(ImageUploadException.Reason.INVALID, error.reason)
            }
            assertEquals(0, server.requestCount)
        }

    @Test
    fun notReadyIsItsOwnError() =
        runTest {
            createResponse =
                MockResponse()
                    .setResponseCode(503)
                    .setHeader("Content-Type", "application/problem+json")
                    .setBody("""{"title":"Not ready","status":503,"code":"NOT_READY"}""")

            val error =
                assertThrows(ImageUploadException::class.java) {
                    runBlockingUpload(FakeSource(ImageInfo("image/png", 10), ByteArray(10)))
                }

            assertEquals(ImageUploadException.Reason.NOT_READY, error.reason)
            assertEquals(1, server.requestCount)
        }

    @Test
    fun aFailedPutStopsBeforeTheProductIsPatched() =
        runTest {
            putStatus = 403

            val error =
                assertThrows(ImageUploadException::class.java) {
                    runBlockingUpload(FakeSource(ImageInfo("image/png", 10), ByteArray(10)))
                }

            assertEquals(ImageUploadException.Reason.FAILED, error.reason)
            assertEquals(listOf("POST", "PUT"), requests.map { it.method })
        }

    private fun runBlockingUpload(source: ImageSource) =
        kotlinx.coroutines.runBlocking {
            uploader(source).upload("p1", uri)
        }
}
