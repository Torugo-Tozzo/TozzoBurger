package uk.tozzo.app.core.network

import app.cash.turbine.test
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.withContext
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
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import retrofit2.create
import uk.tozzo.app.core.session.SecureStore
import uk.tozzo.app.core.session.SessionEvent
import uk.tozzo.app.core.session.SessionEvents
import uk.tozzo.app.core.session.TokenStore
import java.util.Collections
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import javax.inject.Provider

class TokenAuthenticatorTest {
    private val server = MockWebServer()
    private val log: MutableList<String> = Collections.synchronizedList(mutableListOf())
    private val secure = RecordingSecureStore(log)
    private val tokenStore = TokenStore(secure)
    private val events = SessionEvents()
    private val refreshCalls = AtomicInteger()
    private val ordersCalls = AtomicInteger()

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
            val parallel = 5
            val oldArrived = CountDownLatch(parallel)
            server.dispatcher =
                dispatcher(refreshResponse = sessionResponse()) { request ->
                    if (request.getHeader("Authorization") == "Bearer $OLD_ACCESS") {
                        oldArrived.countDown()
                        oldArrived.await(LATCH_SECONDS, TimeUnit.SECONDS)
                        problem(401, "INVALID_TOKEN")
                    } else {
                        null
                    }
                }
            val client = client()

            val codes =
                withContext(Dispatchers.IO) {
                    (1..parallel).map { async { client.get("/v1/orders") } }.awaitAll()
                }

            assertEquals(List(parallel) { 200 }, codes)
            assertEquals(1, refreshCalls.get())
            val authHeaders = log.filter { it.startsWith("request:") }
            assertEquals(parallel, authHeaders.count { it == "request:Bearer $OLD_ACCESS" })
            assertEquals(parallel, authHeaders.count { it == "request:Bearer $NEW_ACCESS" })
        }

    @Test
    fun refreshTokenSavedBeforeRetry() =
        runTest {
            server.dispatcher = dispatcher(refreshResponse = sessionResponse())
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
    fun revokedSessionEmitsEventAndStops() =
        runTest {
            server.dispatcher = dispatcher(refreshResponse = problem(401, "SESSION_REVOKED"))
            val client = client()

            events.events.test {
                val code = withContext(Dispatchers.IO) { client.get("/v1/orders") }

                assertEquals(401, code)
                assertEquals(SessionEvent.Revoked, awaitItem())
            }
            assertEquals(1, refreshCalls.get())
            assertEquals(1, ordersCalls.get())
            assertNull(tokenStore.refreshToken())
            assertNull(tokenStore.accessToken)
        }

    @Test
    fun nonTokenUnauthorizedIsNotRefreshed() =
        runTest {
            server.dispatcher =
                dispatcher(refreshResponse = sessionResponse()) { request ->
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

    private fun client(): OkHttpClient {
        val authApi =
            Retrofit
                .Builder()
                .baseUrl(server.url("/"))
                .client(OkHttpClient())
                .addConverterFactory(ApiJson.asConverterFactory("application/json".toMediaType()))
                .build()
                .create<AuthApi>()
        return OkHttpClient
            .Builder()
            .addInterceptor(AuthInterceptor(tokenStore))
            .authenticator(TokenAuthenticator(tokenStore, Provider { authApi }, events))
            .build()
    }

    private fun OkHttpClient.get(path: String): Int =
        newCall(Request.Builder().url(server.url(path)).build()).execute().use { it.code }

    /**
     * Serves refresh with [refreshResponse]; other paths go to [override] first, then answer
     * 200 for the new access token and 401 INVALID_TOKEN otherwise.
     */
    private fun dispatcher(
        refreshResponse: MockResponse,
        override: (RecordedRequest) -> MockResponse? = { null },
    ) = object : Dispatcher() {
        override fun dispatch(request: RecordedRequest): MockResponse {
            if (request.path == "/v1/auth/refresh") {
                refreshCalls.incrementAndGet()
                return refreshResponse
            }
            if (request.path == "/v1/orders") ordersCalls.incrementAndGet()
            log.add("request:${request.getHeader("Authorization")}")
            return override(request)
                ?: if (request.getHeader("Authorization") == "Bearer $NEW_ACCESS") {
                    MockResponse().setResponseCode(200).setBody("[]")
                } else {
                    problem(401, "INVALID_TOKEN")
                }
        }
    }

    private fun problem(
        status: Int,
        code: String,
    ) = MockResponse()
        .setResponseCode(status)
        .setHeader("Content-Type", "application/problem+json")
        .setBody("""{"title":"Unauthorized","status":$status,"code":"$code"}""")

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
        private val values = java.util.concurrent.ConcurrentHashMap<String, String>()

        override suspend fun get(key: String): String? = values[key]

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
        const val OLD_ACCESS = "access-1"
        const val NEW_ACCESS = "access-2"
        const val OLD_REFRESH = "refresh-1"
        const val NEW_REFRESH = "refresh-2"
        const val REFRESH_KEY = TokenStore.REFRESH_TOKEN_KEY
        const val LATCH_SECONDS = 5L
    }
}
