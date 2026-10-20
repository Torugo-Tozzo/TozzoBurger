package uk.tozzo.app.core.sync

import kotlinx.coroutines.test.runTest
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Timeout
import retrofit2.create
import uk.tozzo.app.core.network.NetworkModule
import uk.tozzo.app.core.network.SyncApi
import uk.tozzo.app.core.session.DeviceIdentity
import uk.tozzo.app.core.session.SecureStore
import uk.tozzo.app.core.session.SessionEvent
import uk.tozzo.app.core.session.SessionEvents

@Timeout(20)
class TozzoConnectorTest {
    private val server = MockWebServer()
    private val events = SessionEvents()
    private lateinit var connector: TozzoConnector

    @BeforeEach
    fun setUp() {
        server.start()
        val api: SyncApi = NetworkModule.apiRetrofit(server.url("/").toString(), OkHttpClient()).create()
        connector = TozzoConnector(api, DeviceIdentity(NoSecureStore), events)
    }

    @AfterEach
    fun tearDown() {
        server.shutdown()
    }

    private fun problem(
        status: Int,
        code: String,
    ) = MockResponse()
        .setResponseCode(status)
        .setHeader("Content-Type", "application/problem+json")
        .setBody("""{"title":"t","status":$status,"code":"$code"}""")

    @Test
    fun tokenBecomesCredentials() =
        runTest {
            server.enqueue(
                MockResponse()
                    .setHeader("Content-Type", "application/json")
                    .setBody(
                        """{"token":"jwt","endpoint":"https://sync.example","expiresAt":"2026-10-20T12:00:00Z"}""",
                    ),
            )

            val credentials = connector.fetchCredentials()

            assertEquals("https://sync.example", credentials.endpoint)
            assertEquals("jwt", credentials.token)
            assertEquals("POST /v1/sync/token", server.takeRequest().let { "${it.method} ${it.path}" })
        }

    @Test
    fun deletedEstablishmentEmitsEventAndThrows() =
        runTest {
            server.enqueue(problem(410, "ESTABLISHMENT_DELETED"))

            assertTrue(runCatching { connector.fetchCredentials() }.isFailure)
            assertEquals(listOf(SessionEvent.EstablishmentDeleted), events.events.replayCache)
        }

    @Test
    fun paymentRequiredEmitsEventAndThrows() =
        runTest {
            server.enqueue(problem(402, "PAYMENT_REQUIRED"))

            assertTrue(runCatching { connector.fetchCredentials() }.isFailure)
            assertEquals(listOf(SessionEvent.PaymentRequired), events.events.replayCache)
        }

    @Test
    fun otherFailuresOnlyThrow() =
        runTest {
            server.enqueue(problem(500, "INTERNAL"))

            assertTrue(runCatching { connector.fetchCredentials() }.isFailure)
            assertTrue(events.events.replayCache.isEmpty())
        }

    private object NoSecureStore : SecureStore {
        override suspend fun get(key: String): String? = null

        override suspend fun put(
            key: String,
            value: String?,
        ) = Unit

        override suspend fun clear() = Unit
    }
}
