package uk.tozzo.app.core.session

import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertInstanceOf
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Timeout
import retrofit2.create
import uk.tozzo.app.core.network.ApiJson
import uk.tozzo.app.core.network.AuthApi
import uk.tozzo.app.core.network.AuthInterceptor
import uk.tozzo.app.core.network.DeviceApi
import uk.tozzo.app.core.network.NetworkModule
import uk.tozzo.app.core.network.RegisterDeviceRequest
import uk.tozzo.app.core.network.TokenAuthenticator
import uk.tozzo.app.domain.BusinessModule
import uk.tozzo.app.domain.BusinessProfile
import uk.tozzo.app.domain.EstablishmentModules
import uk.tozzo.app.domain.Role
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Provider

private const val TEST_TIMEOUT_SECONDS = 20L

@Timeout(TEST_TIMEOUT_SECONDS)
class SessionRepositoryTest {
    private val server = MockWebServer()
    private val secure = MemorySecureStore()
    private val tokenStore = TokenStore(secure)
    private val events = SessionEvents()
    private val binding = DeviceBinding(secure)
    private val identity = DeviceIdentity(secure)
    private lateinit var repo: SessionRepository
    private lateinit var mainApi: AuthApi
    private lateinit var bareApi: AuthApi
    private lateinit var deviceApi: DeviceApi

    private val localData = FakeLocalData()

    private fun newRepo(tokens: TokenStore) =
        SessionRepository(mainApi, bareApi, deviceApi, tokens, binding, identity, FakeDevice, localData)

    /** Records what the sign-in saw of the session when it cleared the local data. */
    private inner class FakeLocalData : LocalDataGate {
        var pending = 0
        var readFailure: Exception? = null
        var clearFailure: Exception? = null
        var clears = 0
        var tokenAtClear: String? = "not cleared"
        var bindingAtClear: Binding? = null

        override suspend fun readPendingOpCount(): Int {
            readFailure?.let { throw it }
            return pending
        }

        override suspend fun clearLocalData() {
            clearFailure?.let { throw it }
            clears++
            tokenAtClear = tokenStore.refreshToken()
            bindingAtClear = binding.current.value
        }
    }

    private var loginResponse: () -> MockResponse = { loginOk() }
    private var registerResponse: () -> MockResponse = { MockResponse().setResponseCode(204) }
    private var meResponse: () -> MockResponse = { MockResponse().setBody(meJson()).setHeader("Content-Type", JSON) }
    private var logoutResponse: () -> MockResponse = { MockResponse().setResponseCode(204) }
    private val paths = mutableListOf<String>()
    private val authHeaders = mutableMapOf<String, String?>()

    private object FakeDevice : DeviceInfoSource {
        override val model = "Pixel"
        override val androidVersion = 35
        override val appVersion = "1.2.3"
    }

    @BeforeEach
    fun setUp() {
        server.dispatcher =
            object : Dispatcher() {
                override fun dispatch(request: RecordedRequest): MockResponse {
                    val key = "${request.method} ${request.path}"
                    synchronized(paths) {
                        paths += key
                        authHeaders[key] = request.getHeader("Authorization")
                    }
                    return when (key) {
                        "POST /v1/auth/login" -> loginResponse()
                        "POST /v1/devices" -> registerResponse()
                        "POST /v1/auth/logout" -> logoutResponse()
                        "GET /v1/me" -> meResponse()
                        else -> MockResponse().setResponseCode(404)
                    }
                }
            }
        server.start()
        val base = server.url("/").toString()
        val refreshApi = NetworkModule.apiRetrofit(base, NetworkModule.refreshOkHttpClient()).create<AuthApi>()
        val authenticator = TokenAuthenticator(tokenStore, Provider { refreshApi }, events)
        val client = NetworkModule.okHttpClient(AuthInterceptor(tokenStore, authenticator), authenticator)
        val retrofit = NetworkModule.apiRetrofit(base, client)
        mainApi = retrofit.create()
        bareApi = refreshApi
        deviceApi = retrofit.create()
        repo = newRepo(tokenStore)
    }

    @AfterEach
    fun tearDown() {
        server.shutdown()
    }

    private fun count(key: String) = paths.count { it == key }

    private fun problem(
        status: Int,
        code: String,
        extra: String = "",
    ) = MockResponse()
        .setResponseCode(status)
        .setHeader("Content-Type", "application/problem+json")
        .setBody("""{"title":"t","status":$status,"code":"$code"$extra}""")

    private fun bound(
        userId: String = USER_A,
        role: Role = Role.OWNER,
    ) = Binding(userId, ESTABLISHMENT, role, "Old Name", "Old Shop", modules(), "pro")

    private fun modules() =
        EstablishmentModules("restaurant", listOf(BusinessProfile.FOOD), listOf(BusinessModule.SALES))

    @Test
    fun invalidCredentials() =
        runTest {
            loginResponse = { problem(401, "INVALID_CREDENTIALS") }

            assertEquals(LoginResult.InvalidCredentials, repo.login("a@b.c", "x"))
            assertEquals(0, count("POST /v1/auth/logout"))
        }

    @Test
    fun emailNotVerified() =
        runTest {
            loginResponse = { problem(403, "EMAIL_NOT_VERIFIED") }

            assertEquals(LoginResult.EmailNotVerified, repo.login("a@b.c", "x"))
        }

    @Test
    fun noResponseIsOffline() =
        runTest {
            server.shutdown()

            assertEquals(LoginResult.Offline, repo.login("a@b.c", "x"))
        }

    @Test
    fun otherServerErrorIsFailed() =
        runTest {
            loginResponse = { problem(500, "INTERNAL") }

            val result = repo.login("a@b.c", "x")

            assertEquals("INTERNAL", (result as LoginResult.Failed).problem?.code)
        }

    @Test
    fun loginSendsDeviceNameAndClient() =
        runTest {
            repo.login("a@b.c", "x")

            val request = server.takeRequest()
            val body = request.body.readUtf8()
            assertTrue(body.contains("\"deviceName\":\"Pixel\""), body)
            assertTrue(body.contains("\"client\":\"android\""), body)
        }

    @Test
    fun otherUserOnBoundDeviceIsRejected() =
        runTest {
            binding.save(bound(USER_A))
            tokenStore.save(session("old-access", "refresh-a"))
            loginResponse = { loginOk(userId = USER_B, access = "access-b", refresh = "refresh-b") }

            assertEquals(LoginResult.OtherUserBound, repo.login("b@b.c", "x"))

            assertEquals(1, count("POST /v1/auth/logout"))
            assertEquals(0, count("POST /v1/devices"))
            assertEquals("Bearer access-b", authHeaders["POST /v1/auth/logout"])
            binding.load()
            assertEquals(bound(USER_A), binding.current.value)
            assertEquals("refresh-a", tokenStore.refreshToken())
            assertEquals("old-access", tokenStore.accessToken)
        }

    @Test
    fun rejectedLogoutWith401DoesNotTouchBoundUsersSession() =
        runTest {
            binding.save(bound(USER_A))
            secure.put(TokenStore.REFRESH_TOKEN_KEY, "refresh-a")
            loginResponse = { loginOk(userId = USER_B, access = "access-b", refresh = "refresh-b") }
            logoutResponse = { problem(401, "INVALID_TOKEN") }
            val seen = mutableListOf<SessionEvent>()
            val job = launch(UnconfinedTestDispatcher(testScheduler)) { events.events.toList(seen) }

            assertEquals(LoginResult.OtherUserBound, repo.login("b@b.c", "x"))

            job.cancel()
            assertEquals(0, count("POST /v1/auth/refresh"))
            assertEquals("refresh-a", tokenStore.refreshToken())
            assertEquals(bound(USER_A), binding.current.value)
            assertTrue(seen.isEmpty())
            assertNull(tokenStore.accessToken)
        }

    @Test
    fun failingSecureStoreMakesLoginFailedNotThrow() =
        runTest {
            val failing =
                object : SecureStore {
                    override suspend fun get(key: String): String? = null

                    override suspend fun put(
                        key: String,
                        value: String?,
                    ): Unit = throw IOException("keystore")

                    override suspend fun clear() = Unit
                }
            val local = newRepo(TokenStore(failing))

            assertEquals(LoginResult.Failed(null), local.login("a@b.c", "x"))
            assertEquals(1, count("POST /v1/auth/logout"))
            assertEquals("Bearer access-a", authHeaders["POST /v1/auth/logout"])
        }

    @Test
    fun sameUserAfterRevokeKeepsBinding() =
        runTest {
            val before = bound(USER_A).copy(userName = "Alice", establishmentName = "Shop", plan = "pro")
            binding.save(before)

            val result = repo.login("a@b.c", "x")

            assertInstanceOf(LoginResult.Success::class.java, result)
            assertEquals(before.userId, (result as LoginResult.Success).binding.userId)
            assertEquals(ESTABLISHMENT, binding.current.value?.establishmentId)
            assertEquals(1, count("POST /v1/devices"))
            assertEquals(0, localData.clears)
        }

    @Test
    fun customerHasNoAccess() =
        runTest {
            loginResponse = { loginOk(role = "CUSTOMER") }

            assertEquals(LoginResult.NoAccess, repo.login("a@b.c", "x"))
            assertNothingSaved()
            assertEquals(0, localData.clears)
        }

    @Test
    fun noReadableBindingClearsTheLocalDataBeforeBinding() =
        runTest {
            val result = repo.login("a@b.c", "x")

            assertInstanceOf(LoginResult.Success::class.java, result)
            assertEquals(1, localData.clears)
            assertNull(localData.tokenAtClear)
            assertNull(localData.bindingAtClear)
            assertEquals(USER_A, binding.current.value?.userId)
        }

    @Test
    fun noReadableBindingWithPendingOpsRefusesTheLogin() =
        runTest {
            localData.pending = 2

            assertEquals(LoginResult.UnsentDataOfUnknownUser, repo.login("a@b.c", "x"))

            assertEquals(0, localData.clears)
            assertNothingSaved()
            assertEquals(1, count("POST /v1/auth/logout"))
            assertEquals("Bearer access-a", authHeaders["POST /v1/auth/logout"])
        }

    @Test
    fun failedClearRefusesTheLogin() =
        runTest {
            localData.clearFailure = IllegalStateException("sqlite")

            assertEquals(LoginResult.Failed(null), repo.login("a@b.c", "x"))

            assertNothingSaved()
            assertEquals(1, count("POST /v1/auth/logout"))
        }

    @Test
    fun unreadableQueueRefusesTheLogin() =
        runTest {
            localData.readFailure = IllegalStateException("cannot open")

            assertEquals(LoginResult.Failed(null), repo.login("a@b.c", "x"))

            assertEquals(0, localData.clears)
            assertNothingSaved()
            assertEquals(1, count("POST /v1/auth/logout"))
        }

    @Test
    fun cookAndDriverAreNotYetSupported() =
        runTest {
            for (role in listOf("COOK", "DRIVER")) {
                loginResponse = { loginOk(role = role) }

                assertEquals(LoginResult.RoleNotYetSupported, repo.login("a@b.c", "x"))
            }
            assertNothingSaved()
            assertEquals(2, count("POST /v1/auth/logout"))
        }

    @Test
    fun deletedEstablishment() =
        runTest {
            loginResponse = { loginOk(status = "DELETED") }

            assertEquals(LoginResult.EstablishmentDeleted, repo.login("a@b.c", "x"))
            assertNothingSaved()
        }

    @Test
    fun ownerWithoutSetupNeedsWeb() =
        runTest {
            loginResponse = { loginOk(profiles = "null", category = "null") }

            assertEquals(LoginResult.NeedsWebSetup, repo.login("a@b.c", "x"))
            assertNothingSaved()
            assertEquals(1, count("POST /v1/auth/logout"))
            assertEquals(0, count("POST /v1/devices"))
        }

    @Test
    fun deviceLimitReachedClearsTokensAndLogsOut() =
        runTest {
            registerResponse = { problem(409, "DEVICE_LIMIT_REACHED", ""","limit":3""") }

            assertEquals(LoginResult.DeviceLimitReached(3), repo.login("a@b.c", "x"))

            assertNull(tokenStore.refreshToken())
            assertNull(tokenStore.accessToken)
            assertNull(binding.current.value)
            assertEquals(1, count("POST /v1/auth/logout"))
            assertEquals("Bearer access-a", authHeaders["POST /v1/auth/logout"])
        }

    @Test
    fun successSavesTokensDeviceAndBinding() =
        runTest {
            val result = repo.login("a@b.c", "x")

            val saved = (result as LoginResult.Success).binding
            assertEquals(
                Binding(USER_A, ESTABLISHMENT, Role.OWNER, "Alice", "Shop", modules(), "pro"),
                saved,
            )
            assertEquals(saved, binding.current.value)
            assertEquals("refresh-a", tokenStore.refreshToken())
            assertEquals("access-a", tokenStore.accessToken)
            val fresh = DeviceBinding(secure).also { it.load() }
            assertEquals(saved, fresh.current.value)
        }

    @Test
    fun unknownProfilesAndModulesAreIgnored() =
        runTest {
            loginResponse = { loginOk(profiles = """["FOOD","SPACE"]""", modulesJson = """["SALES","TELEPORT"]""") }

            val result = repo.login("a@b.c", "x") as LoginResult.Success

            assertEquals(listOf(BusinessProfile.FOOD), result.binding.modules.businessProfiles)
            assertEquals(listOf(BusinessModule.SALES), result.binding.modules.visibleModules)
        }

    @Test
    fun deviceIdIsStable() =
        runTest {
            val first = identity.id()
            val second = identity.id()
            assertEquals(first, second)
            assertEquals(first, DeviceIdentity(secure).id())

            repo.login("a@b.c", "x")

            val register = takeRequest("POST /v1/devices")
            val body = ApiJson.decodeFromString(RegisterDeviceRequest.serializer(), register.body.readUtf8())
            assertEquals(first, body.id)
            assertEquals(35, body.info.androidVersion)
            assertEquals("1.2.3", body.info.appVersion)
            assertEquals("Pixel", body.info.model)
        }

    @Test
    fun refreshBindingFromServerRebuildsBinding() =
        runTest {
            binding.save(bound(USER_A).copy(userName = "Stale", plan = "free"))
            tokenStore.accessToken = "access-a"

            val result = repo.refreshBindingFromServer()

            assertEquals("Alice", result.getOrThrow().userName)
            assertEquals("pro", binding.current.value?.plan)
            assertEquals(ESTABLISHMENT, binding.current.value?.establishmentId)
        }

    @Test
    fun refreshBindingForOtherUserFailsAndKeepsBinding() =
        runTest {
            val stale = bound(USER_B)
            binding.save(stale)
            tokenStore.accessToken = "access-a"

            assertTrue(repo.refreshBindingFromServer().isFailure)
            assertEquals(stale, binding.current.value)
        }

    @Test
    fun signOutKeepsBindingAndClearsTokens() =
        runTest {
            binding.save(bound())
            tokenStore.save(session("access-a", "refresh-a"))

            repo.signOutKeepingData()

            assertEquals(1, count("POST /v1/auth/logout"))
            assertNull(tokenStore.accessToken)
            assertNull(tokenStore.refreshToken())
            assertEquals(bound(), binding.current.value)
        }

    private suspend fun assertNothingSaved() {
        assertNull(tokenStore.refreshToken())
        assertNull(tokenStore.accessToken)
        assertNull(binding.current.value)
        assertEquals(0, count("POST /v1/devices"))
    }

    private fun takeRequest(key: String): RecordedRequest {
        repeat(paths.size) {
            val r = server.takeRequest()
            if ("${r.method} ${r.path}" == key) return r
        }
        error("No request $key")
    }

    private fun session(
        access: String,
        refresh: String,
    ) = ApiJson.decodeFromString(
        uk.tozzo.app.core.network.SessionBody
            .serializer(),
        sessionJson(USER_A, access, refresh, "OWNER", "ACTIVE", """["FOOD"]""", "\"restaurant\"", """["SALES"]"""),
    )

    private fun loginOk(
        userId: String = USER_A,
        access: String = "access-a",
        refresh: String = "refresh-a",
        role: String = "OWNER",
        status: String = "ACTIVE",
        profiles: String = """["FOOD"]""",
        category: String = "\"restaurant\"",
        modulesJson: String = """["SALES"]""",
    ) = MockResponse()
        .setHeader("Content-Type", JSON)
        .setBody(sessionJson(userId, access, refresh, role, status, profiles, category, modulesJson))

    private fun sessionJson(
        userId: String,
        access: String,
        refresh: String,
        role: String,
        status: String,
        profiles: String,
        category: String,
        modulesJson: String,
    ) = """{"accessToken":"$access","accessTokenExpiresAt":"2030-01-01T00:00:00Z","refreshToken":"$refresh",
        |"user":${meJson(userId, role, status, profiles, category, modulesJson)}}
        """.trimMargin()

    private fun meJson(
        userId: String = USER_A,
        role: String = "OWNER",
        status: String = "ACTIVE",
        profiles: String = """["FOOD"]""",
        category: String = "\"restaurant\"",
        modulesJson: String = """["SALES"]""",
    ) = """{"id":"$userId","name":"Alice","email":"a@b.c","role":"$role","locale":"en",
        |"establishment":{"id":"$ESTABLISHMENT","tradeName":"Shop","status":"$status","plan":"pro",
        |"category":$category,"businessProfiles":$profiles,"visibleModules":$modulesJson,"preferencesRevision":1}}
        """.trimMargin()

    private class MemorySecureStore : SecureStore {
        private val values = ConcurrentHashMap<String, String>()

        override suspend fun get(key: String): String? = values[key]

        override suspend fun put(
            key: String,
            value: String?,
        ) {
            if (value == null) values.remove(key) else values[key] = value
        }

        override suspend fun clear() = values.clear()
    }

    private companion object {
        const val JSON = "application/json"
        const val USER_A = "user-a"
        const val USER_B = "user-b"
        const val ESTABLISHMENT = "est-1"
    }
}
