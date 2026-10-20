package uk.tozzo.app.core.sync

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
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
    fun onlineButNotConnectedIsNotSynced() =
        runTest(UnconfinedTestDispatcher()) {
            online.value = true
            val sync = controller()

            db.status.value = status(false, false, false, true)

            assertEquals(SyncState.SYNCING, sync.state.value)
        }

    @Test
    fun uploadOrDownloadErrorIsNotSynced() =
        runTest(UnconfinedTestDispatcher()) {
            online.value = true
            val sync = controller()

            db.status.value = status(true, false, false, true).copy(uploadFailed = true)
            assertEquals(SyncState.SYNCING, sync.state.value)

            db.status.value = status(true, false, false, true).copy(downloadFailed = true)
            assertEquals(SyncState.SYNCING, sync.state.value)

            db.status.value = status(true, false, false, true)
            assertEquals(SyncState.SYNCED, sync.state.value)
        }

    @Test
    fun pendingOpsAreNotSynced() =
        runTest(UnconfinedTestDispatcher()) {
            val pending = MutableStateFlow(3)
            db.counts[PENDING_OPS_SQL] = pending
            online.value = true
            val sync = controller()
            db.status.value = status(true, false, false, true)

            assertEquals(SyncState.SYNCING, sync.state.value)

            pending.value = 0
            assertEquals(SyncState.SYNCED, sync.state.value)
        }

    @Test
    fun databaseThatFailsToOpenGivesSafeValues() =
        runTest(UnconfinedTestDispatcher()) {
            db.openFailure = IllegalStateException("cannot open")
            online.value = true
            val sync = controller()

            assertEquals(SyncState.SYNCING, sync.state.value)
            assertEquals(false, sync.hasSynced.first())
            assertNull(sync.pendingOpCount.first())
            assertNull(sync.rejectionCount.first())

            online.value = false
            assertEquals(SyncState.OFFLINE, sync.state.value)
        }

    @Test
    fun failedConnectKeepsTheReconnectLoop() =
        runTest(UnconfinedTestDispatcher()) {
            db.connectFailure = IllegalStateException("cannot open")
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
    fun pendingOpCountIsReadOnceForTheLogin() =
        runTest(UnconfinedTestDispatcher()) {
            db.counts[PENDING_OPS_SQL] = MutableStateFlow(4)

            assertEquals(4, controller().readPendingOpCount())
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

        /** Makes every query fail, like a database that cannot be opened. */
        var openFailure: Exception? = null

        /** Makes `connect` throw after counting the call. */
        var connectFailure: Exception? = null

        override fun status(): Flow<LocalSyncStatus> = failingOr(status)

        override fun watchRejections(): Flow<List<SyncRejection>> = failingOr(MutableStateFlow(emptyList()))

        override fun watchCount(sql: String): Flow<Int> = failingOr(counts[sql] ?: MutableStateFlow(0))

        private fun <T> failingOr(source: Flow<T>): Flow<T> =
            flow {
                openFailure?.let { throw it }
                emitAll(source)
            }

        override suspend fun connect() {
            connects++
            connectFailure?.let { throw it }
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
