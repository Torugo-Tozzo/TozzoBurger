package uk.tozzo.app.core.network

import app.cash.turbine.test
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.serialization.json.JsonArray
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Timeout
import retrofit2.create
import retrofit2.http.GET
import uk.tozzo.app.core.session.SecureStore
import uk.tozzo.app.core.session.SessionEvent
import uk.tozzo.app.core.session.SessionEvents
import uk.tozzo.app.core.session.TokenStore
import java.util.Collections
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import javax.inject.Provider

/** Builds the client the way [NetworkModule] does, against a [MockWebServer]. */
@Timeout(TEST_TIMEOUT_SECONDS)
class TokenAuthenticatorTest {
    private val server = MockWebServer()
    private val log: MutableList<String> = Collections.synchronizedList(mutableListOf())
    private val secure = RecordingSecureStore(log)
    private val tokenStore = TokenStore(secure)
    private val events = SessionEvents()
    private val refreshCalls = AtomicInteger()
    private val ordersCalls = AtomicInteger()

    private interface OrdersApi {
        @GET("/v1/orders")
        suspend fun orders(): JsonArray
    }

    @BeforeEach
    fun setUp() {
        server.start()
        tokenStore.accessToken = OLD_ACCESS
        runBlocking { secure.put(REFRESH_KEY, OLD_REFRESH) }
        log.clear()
    }

    @AfterEach
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun concurrentUnauthorizedRefreshesOnce() =
        runTest {
            server.dispatcher = dispatcher(sessionResponse(), holdOldTokenUntil(PARALLEL))
            val client = client()

            val codes = parallelGets(client, PARALLEL)

            assertEquals(List(PARALLEL) { 200 }, codes)
            assertEquals(1, refreshCalls.get())
            val authHeaders = log.filter { it.startsWith("request:") }
            assertEquals(PARALLEL, authHeaders.count { it == "request:Bearer $OLD_ACCESS" })
            assertEquals(PARALLEL, authHeaders.count { it == "request:Bearer $NEW_ACCESS" })
        }

    @Test
    fun concurrentRetrofitCallsShareOneRefresh() =
        runTest {
            // More suspend calls than OkHttp's 5 per host: all 5 running calls block in the authenticator.
            val parallel = 6
            server.dispatcher = dispatcher(sessionResponse(), holdOldTokenUntil(MAX_REQUESTS_PER_HOST))
            val orders =
                NetworkModule.apiRetrofit(server.url("/").toString(), client()).create<OrdersApi>()

            val results =
                withContext(Dispatchers.IO) {
                    withTimeout(CALLS_TIMEOUT_MS) {
                        (1..parallel).map { async { orders.orders() } }.awaitAll()
                    }
                }

            assertEquals(parallel, results.size)
            assertEquals(1, refreshCalls.get())
        }

    @Test
    fun refreshTokenSavedBeforeRetry() =
        runTest {
            server.dispatcher = dispatcher(sessionResponse())
            val client = client()

            val code = withContext(Dispatchers.IO) { client.get("/v1/orders") }

            assertEquals(200, code)
            val saved = log.indexOf("put:$REFRESH_KEY=$NEW_REFRESH")
            val retried = log.indexOf("request:Bearer $NEW_ACCESS")
            assertTrue(saved >= 0, "new refresh token was not saved: $log")
            assertTrue(retried >= 0, "request was not retried: $log")
            assertTrue(saved < retried, "refresh token saved after the retry: $log")
            assertEquals(NEW_ACCESS, tokenStore.accessToken)
        }

    @Test
    fun revokedSessionEmitsEventOnceAndStops() =
        runTest {
            server.dispatcher = dispatcher(problem(401, "SESSION_REVOKED"), holdOldTokenUntil(PARALLEL))
            val client = client()

            events.events.test {
                val codes = parallelGets(client, PARALLEL)

                assertEquals(List(PARALLEL) { 401 }, codes)
                assertEquals(SessionEvent.Revoked, awaitItem())
                expectNoEvents()
            }
            assertEquals(1, refreshCalls.get())
            assertEquals(PARALLEL, ordersCalls.get())
            assertNull(tokenStore.refreshToken())
            assertNull(tokenStore.accessToken)
        }

    @Test
    fun failedRefreshIsNotRepeatedByWaitingRequests() =
        runTest {
            server.dispatcher = dispatcher(problem(503, "UNAVAILABLE"), holdOldTokenUntil(PARALLEL))
            val client = client()

            val codes = parallelGets(client, PARALLEL)

            assertEquals(List(PARALLEL) { 401 }, codes)
            assertEquals(1, refreshCalls.get())
            assertEquals(OLD_REFRESH, tokenStore.refreshToken())
            assertEquals(OLD_ACCESS, tokenStore.accessToken)
            assertEquals(0, events.events.replayCache.size)
        }

    @Test
    fun malformedRefreshResponseKeepsSession() =
        runTest {
            val malformed =
                MockResponse()
                    .setResponseCode(200)
                    .setHeader("Content-Type", "application/json")
                    .setBody("""{"accessToken":42""")
            server.dispatcher = dispatcher(malformed)
            val client = client()

            val code = withContext(Dispatchers.IO) { client.get("/v1/orders") }

            assertEquals(401, code)
            assertEquals(1, refreshCalls.get())
            assertEquals(OLD_REFRESH, tokenStore.refreshToken())
            assertEquals(0, events.events.replayCache.size)
        }

    @Test
    fun coldStartRefreshesWithStoredToken() =
        runTest {
            tokenStore.accessToken = null
            server.dispatcher = dispatcher(sessionResponse())
            val client = client()

            val codes = parallelGets(client, PARALLEL)

            assertEquals(List(PARALLEL) { 200 }, codes)
            assertEquals(1, refreshCalls.get())
            assertEquals(NEW_ACCESS, tokenStore.accessToken)
            assertEquals(NEW_REFRESH, tokenStore.refreshToken())
        }

    @Test
    fun coldStartWithoutRefreshTokenSendsNoToken() =
        runTest {
            tokenStore.accessToken = null
            secure.put(REFRESH_KEY, null)
            server.dispatcher = dispatcher(sessionResponse())
            val client = client()

            val code = withContext(Dispatchers.IO) { client.get("/v1/orders") }

            assertEquals(401, code)
            assertEquals(0, refreshCalls.get())
            assertTrue("request:null" in log, "a token was sent: $log")
            assertEquals(0, events.events.replayCache.size)
        }

    @Test
    fun nonTokenUnauthorizedIsNotRefreshed() =
        runTest {
            tokenStore.accessToken = null
            server.dispatcher =
                dispatcher(sessionResponse()) { request ->
                    if (request.path == "/v1/auth/login") problem(401, "INVALID_CREDENTIALS") else null
                }
            val client = client()

            val code =
                withContext(Dispatchers.IO) {
                    val body = """{"email":"a@b.c","password":"x","client":"android"}"""
                    val request =
                        Request
                            .Builder()
                            .url(server.url("/v1/auth/login"))
                            .post(body.toRequestBody("application/json".toMediaType()))
                            .build()
                    client.newCall(request).execute().use { it.code }
                }

            assertEquals(401, code)
            assertEquals(0, refreshCalls.get())
            assertEquals(OLD_REFRESH, tokenStore.refreshToken())
        }

    @Test
    fun requestSentDuringRevokedRefreshDoesNotRefreshAgain() =
        runTest {
            val held = HeldRefresh(problem(401, "SESSION_REVOKED"))
            server.dispatcher = dispatcher(held.response, held.override)
            val client = client()

            events.events.test {
                val codes = held.runOverlapping(client)

                assertEquals(listOf(401, 401), codes)
                assertEquals(SessionEvent.Revoked, awaitItem())
                expectNoEvents()
            }
            assertEquals(1, refreshCalls.get())
        }

    @Test
    fun requestSentDuringFailedRefreshDoesNotRefreshAgain() =
        runTest {
            val held = HeldRefresh(problem(503, "UNAVAILABLE"))
            server.dispatcher = dispatcher(held.response, held.override)
            val client = client()

            val codes = held.runOverlapping(client)

            assertEquals(listOf(401, 401), codes)
            assertEquals(1, refreshCalls.get())
            assertEquals(OLD_REFRESH, tokenStore.refreshToken())
            assertEquals(0, events.events.replayCache.size)
        }

    @Test
    fun unreadableRefreshTokenKeepsSessionOnUnauthorized() =
        runTest {
            secure.failReads = true
            server.dispatcher = dispatcher(sessionResponse())
            val client = client()

            val code = withContext(Dispatchers.IO) { client.get("/v1/orders") }

            assertEquals(401, code)
            assertEquals(0, refreshCalls.get())
            assertEquals(OLD_ACCESS, tokenStore.accessToken)
            assertEquals(0, events.events.replayCache.size)
        }

    @Test
    fun unreadableRefreshTokenOnColdStartSendsRequestWithoutToken() =
        runTest {
            tokenStore.accessToken = null
            secure.failReads = true
            server.dispatcher = dispatcher(sessionResponse())
            val client = client()

            val code = withContext(Dispatchers.IO) { client.get("/v1/orders") }

            assertEquals(401, code)
            assertEquals(0, refreshCalls.get())
            assertTrue("request:null" in log, "a token was sent: $log")
            assertEquals(0, events.events.replayCache.size)
        }

    /**
     * Holds the refresh started by a first request until a second request, sent while the refresh
     * is in flight, reached the server; then answers the refresh with [response].
     */
    private inner class HeldRefresh(
        val response: MockResponse,
    ) {
        private val refreshStarted = CountDownLatch(1)
        private val secondArrived = CountDownLatch(2)
        private val release = CountDownLatch(1)

        val override: (RecordedRequest) -> MockResponse? = { request ->
            if (request.path == "/v1/orders") secondArrived.countDown()
            null
        }

        init {
            heldRefresh = this
        }

        suspend fun runOverlapping(client: OkHttpClient): List<Int> =
            withContext(Dispatchers.IO) {
                val first = async { client.get("/v1/orders") }
                assertTrue(refreshStarted.await(LATCH_SECONDS, TimeUnit.SECONDS), "refresh did not start")
                val second = async { client.get("/v1/orders") }
                assertTrue(secondArrived.await(LATCH_SECONDS, TimeUnit.SECONDS), "second request not sent")
                release.countDown()
                listOf(first.await(), second.await())
            }

        fun onRefresh() {
            refreshStarted.countDown()
            release.await(LATCH_SECONDS, TimeUnit.SECONDS)
        }
    }

    private var heldRefresh: HeldRefresh? = null

    private fun client(): OkHttpClient {
        val refreshApi =
            NetworkModule.apiRetrofit(server.url("/").toString(), NetworkModule.refreshOkHttpClient()).create<AuthApi>()
        val authenticator = TokenAuthenticator(tokenStore, Provider { refreshApi }, events)
        return NetworkModule.okHttpClient(AuthInterceptor(tokenStore, authenticator), authenticator)
    }

    private suspend fun parallelGets(
        client: OkHttpClient,
        count: Int,
    ): List<Int> =
        withContext(Dispatchers.IO) {
            (1..count).map { async { client.get("/v1/orders") } }.awaitAll()
        }

    private fun OkHttpClient.get(path: String): Int =
        newCall(Request.Builder().url(server.url(path)).build()).execute().use { it.code }

    /** Holds the 401s for the old token until [count] of them arrived, so they all fail together. */
    private fun holdOldTokenUntil(count: Int): (RecordedRequest) -> MockResponse? {
        val arrived = CountDownLatch(count)
        return { request ->
            if (request.getHeader("Authorization") == "Bearer $OLD_ACCESS") {
                arrived.countDown()
                arrived.await(LATCH_SECONDS, TimeUnit.SECONDS)
                problem(401, "INVALID_TOKEN")
            } else {
                null
            }
        }
    }

    /**
     * Serves refresh with [refreshResponse]; other paths go to [override] first, then answer
     * 200 for the new access token, 401 UNAUTHENTICATED without a token and 401 INVALID_TOKEN otherwise.
     */
    private fun dispatcher(
        refreshResponse: MockResponse,
        override: (RecordedRequest) -> MockResponse? = { null },
    ) = object : Dispatcher() {
        override fun dispatch(request: RecordedRequest): MockResponse {
            if (request.path == "/v1/auth/refresh") {
                refreshCalls.incrementAndGet()
                heldRefresh?.onRefresh()
                return refreshResponse
            }
            if (request.path == "/v1/orders") ordersCalls.incrementAndGet()
            val authorization = request.getHeader("Authorization")
            log.add("request:$authorization")
            return override(request)
                ?: when (authorization) {
                    "Bearer $NEW_ACCESS" -> MockResponse().setResponseCode(200).setBody("[]")
                    null -> problem(401, "UNAUTHENTICATED")
                    else -> problem(401, "INVALID_TOKEN")
                }
        }
    }

    private fun problem(
        status: Int,
        code: String,
    ) = MockResponse()
        .setResponseCode(status)
        .setHeader("Content-Type", "application/problem+json")
        .setBody("""{"title":"Error","status":$status,"code":"$code"}""")

    private fun sessionResponse() =
        MockResponse()
            .setResponseCode(200)
            .setHeader("Content-Type", "application/json")
            .setBody(
                """
                {"accessToken":"$NEW_ACCESS","accessTokenExpiresAt":"2026-10-20T12:00:00Z",
                 "refreshToken":"$NEW_REFRESH","extra":true,
                 "user":{"id":"u1","name":"Ana","email":"a@b.c","phone":null,"role":"OWNER","locale":null,
                   "emailVerified":true,
                   "establishment":{"id":"e1","tradeName":"Tozzo","status":"ACTIVE","plan":"FREE",
                     "category":null,"businessProfiles":null,"visibleModules":null,"preferencesRevision":0}}}
                """.trimIndent(),
            )

    private class RecordingSecureStore(
        private val log: MutableList<String>,
    ) : SecureStore {
        private val values = ConcurrentHashMap<String, String>()

        @Volatile
        var failReads = false

        override suspend fun get(key: String): String? {
            if (failReads) throw IllegalStateException("keystore unavailable")
            return values[key]
        }

        override suspend fun put(
            key: String,
            value: String?,
        ) {
            if (value == null) values.remove(key) else values[key] = value
            log.add("put:$key=$value")
        }

        override suspend fun clear() {
            values.clear()
            log.add("clear")
        }
    }

    private companion object {
        const val PARALLEL = 5
        const val MAX_REQUESTS_PER_HOST = 5
        const val OLD_ACCESS = "access-1"
        const val NEW_ACCESS = "access-2"
        const val OLD_REFRESH = "refresh-1"
        const val NEW_REFRESH = "refresh-2"
        const val REFRESH_KEY = TokenStore.REFRESH_TOKEN_KEY
        const val LATCH_SECONDS = 5L
        const val CALLS_TIMEOUT_MS = 15_000L
    }
}

private const val TEST_TIMEOUT_SECONDS = 30L
