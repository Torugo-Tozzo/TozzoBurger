package uk.tozzo.app.testing

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import uk.tozzo.app.core.network.AuthApi
import uk.tozzo.app.core.network.LoginRequest
import uk.tozzo.app.core.network.LogoutRequest
import uk.tozzo.app.core.network.Me
import uk.tozzo.app.core.network.RefreshRequest
import uk.tozzo.app.core.network.SessionBody
import uk.tozzo.app.core.session.Binding
import uk.tozzo.app.core.session.SecureStore
import uk.tozzo.app.core.sync.Connectivity
import uk.tozzo.app.core.sync.LocalDatabase
import uk.tozzo.app.core.sync.LocalSyncStatus
import uk.tozzo.app.core.sync.SyncRejection
import uk.tozzo.app.domain.BusinessProfile
import uk.tozzo.app.domain.EstablishmentModules
import uk.tozzo.app.domain.Role
import java.io.IOException

/** A full FOOD establishment, as the owner sees it. */
fun foodOwnerBinding(role: Role = Role.OWNER) =
    Binding(
        userId = "u1",
        establishmentId = "e1",
        role = role,
        userName = "Ana",
        establishmentName = "Burger da Ana",
        modules = EstablishmentModules("restaurant", listOf(BusinessProfile.FOOD), null),
        plan = "PAGO",
    )

/** Records the calls to the shared [log], in order. */
class CallLog {
    val calls = mutableListOf<String>()
}

class MemoryStore(
    private val log: CallLog? = null,
) : SecureStore {
    private val values = mutableMapOf<String, String>()

    /** Keys whose reads fail with an [IOException]. */
    val failingReads = mutableSetOf<String>()

    override suspend fun get(key: String): String? {
        if (key in failingReads) throw IOException("unreadable")
        return values[key]
    }

    override suspend fun put(
        key: String,
        value: String?,
    ) {
        if (value == null) {
            log?.calls?.add("store.remove:$key")
            values.remove(key)
        } else {
            values[key] = value
        }
    }

    override suspend fun clear() = values.clear()
}

class FakeLocalDatabase(
    private val log: CallLog? = null,
) : LocalDatabase {
    var connects = 0
    var clears = 0
    val status = MutableStateFlow(LocalSyncStatus(false, false, false, null))
    val counts = mutableMapOf<String, MutableStateFlow<Int>>()
    val rejections = MutableStateFlow<List<SyncRejection>>(emptyList())

    fun count(sql: String): MutableStateFlow<Int> = counts.getOrPut(sql) { MutableStateFlow(0) }

    override fun status(): Flow<LocalSyncStatus> = status

    override fun watchCount(sql: String): Flow<Int> = count(sql)

    override fun watchRejections(): Flow<List<SyncRejection>> = rejections

    override suspend fun connect() {
        connects++
    }

    override suspend fun disconnect() = Unit

    override suspend fun disconnectAndClear() {
        log?.calls?.add("db.clear")
        clears++
    }
}

class FakeConnectivity(
    initial: Boolean,
) : Connectivity {
    override val online = MutableStateFlow(initial)
}

/** [AuthApi] that only answers `logout`; [logoutFailure] makes it throw. */
class FakeAuthApi(
    private val log: CallLog? = null,
) : AuthApi {
    var logoutFailure: Exception? = null

    override suspend fun logout(body: LogoutRequest) {
        log?.calls?.add("api.logout")
        logoutFailure?.let { throw it }
    }

    override suspend fun login(body: LoginRequest): SessionBody = error("not used")

    override suspend fun refresh(body: RefreshRequest): SessionBody = error("not used")

    override suspend fun logoutWith(
        bearer: String,
        body: LogoutRequest,
    ) = error("not used")

    override suspend fun me(): Me = error("not used")
}
