package uk.tozzo.app.core.sync

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import uk.tozzo.app.core.session.Binding
import uk.tozzo.app.core.session.DeviceBinding
import uk.tozzo.app.core.session.SecureStore
import uk.tozzo.app.domain.EstablishmentModules
import uk.tozzo.app.domain.Role
import java.util.concurrent.ConcurrentHashMap

@OptIn(ExperimentalCoroutinesApi::class)
class SyncControllerTest {
    private val online = MutableStateFlow(false)
    private val connectivity =
        object : Connectivity {
            override val online = this@SyncControllerTest.online
        }
    private val db = FakeLocalDatabase()
    private val binding = DeviceBinding(MemorySecureStore())

    private fun TestScope.controller() = SyncController(db, connectivity, binding, backgroundScope)

    private suspend fun bind() {
        binding.save(
            Binding("u1", "e1", Role.OWNER, "Ana", "Tozzo", EstablishmentModules(null, null, null), "PAGO"),
        )
    }

    @Test
    fun goingOnlineConnectsOnce() =
        runTest(UnconfinedTestDispatcher()) {
            bind()
            val sync = controller()
            sync.start()
            assertEquals(0, db.connects)

            online.value = true

            assertEquals(1, db.connects)
        }

    @Test
    fun everyReconnectCallsConnectAgain() =
        runTest(UnconfinedTestDispatcher()) {
            bind()
            online.value = true
            val sync = controller()
            sync.start()
            assertEquals(1, db.connects)

            online.value = false
            online.value = true

            assertEquals(2, db.connects)
        }

    @Test
    fun startWithoutBindingDoesNotConnect() =
        runTest(UnconfinedTestDispatcher()) {
            online.value = true
            controller().start()

            assertEquals(0, db.connects)
        }

    @Test
    fun stopDisconnectsAndIgnoresTheNetwork() =
        runTest(UnconfinedTestDispatcher()) {
            bind()
            online.value = true
            val sync = controller()
            sync.start()

            sync.stop()
            online.value = false
            online.value = true

            assertEquals(1, db.connects)
            assertEquals(1, db.disconnects)
        }

    @Test
    fun clearLocalDataDisconnectsAndClears() =
        runTest(UnconfinedTestDispatcher()) {
            bind()
            online.value = true
            val sync = controller()
            sync.start()

            sync.clearLocalData()
            online.value = false
            online.value = true

            assertEquals(1, db.clears)
            assertEquals(1, db.connects)
        }

    @Test
    fun offlineStateIsOffline() =
        runTest(UnconfinedTestDispatcher()) {
            val sync = controller()
            db.status.value = status(false, false, false, true)

            assertEquals(SyncState.OFFLINE, sync.state.value)
        }

    @Test
    fun onlineStateFollowsSyncStatus() =
        runTest(UnconfinedTestDispatcher()) {
            online.value = true
            val sync = controller()

            db.status.value = status(true, true, false, false)
            assertEquals(SyncState.FIRST_SYNC_PENDING, sync.state.value)

            db.status.value = status(true, true, false, true)
            assertEquals(SyncState.SYNCING, sync.state.value)

            db.status.value = status(true, false, true, true)
            assertEquals(SyncState.SYNCING, sync.state.value)

            db.status.value = status(true, false, false, true)
            assertEquals(SyncState.SYNCED, sync.state.value)

            online.value = false
            assertEquals(SyncState.OFFLINE, sync.state.value)
        }

    @Test
    fun hasSyncedAndCountsComeFromTheDatabase() =
        runTest(UnconfinedTestDispatcher()) {
            db.counts[PENDING_OPS_SQL] = MutableStateFlow(5)
            db.counts[REJECTIONS_SQL] = MutableStateFlow(2)
            val sync = controller()
            db.status.value = status(false, false, false, true)

            assertEquals(true, sync.hasSynced.first())
            assertEquals(5, sync.pendingOpCount.first())
            assertEquals(2, sync.rejectionCount.first())
        }

    private fun status(
        connected: Boolean,
        downloading: Boolean,
        uploading: Boolean,
        hasSynced: Boolean?,
    ) = LocalSyncStatus(connected, downloading, uploading, hasSynced)

    private class FakeLocalDatabase : LocalDatabase {
        var connects = 0
        var disconnects = 0
        var clears = 0
        val status = MutableStateFlow(LocalSyncStatus(false, false, false, null))
        val counts = mutableMapOf<String, Flow<Int>>()

        override fun status(): Flow<LocalSyncStatus> = status

        override fun watchCount(sql: String): Flow<Int> = counts[sql] ?: MutableStateFlow(0)

        override suspend fun connect() {
            connects++
        }

        override suspend fun disconnect() {
            disconnects++
        }

        override suspend fun disconnectAndClear() {
            clears++
        }
    }

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
}
