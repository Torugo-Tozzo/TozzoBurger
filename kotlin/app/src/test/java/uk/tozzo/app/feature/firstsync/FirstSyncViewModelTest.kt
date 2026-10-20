package uk.tozzo.app.feature.firstsync

import app.cash.turbine.test
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import uk.tozzo.app.core.session.Binding
import uk.tozzo.app.core.session.DeviceBinding
import uk.tozzo.app.core.session.SecureStore
import uk.tozzo.app.core.sync.Connectivity
import uk.tozzo.app.core.sync.LocalDatabase
import uk.tozzo.app.core.sync.LocalSyncStatus
import uk.tozzo.app.core.sync.SignOut
import uk.tozzo.app.core.sync.SyncController
import uk.tozzo.app.core.sync.SyncRejection
import uk.tozzo.app.domain.EstablishmentModules
import uk.tozzo.app.domain.Role
import uk.tozzo.app.testing.FakeSignOutService

@OptIn(ExperimentalCoroutinesApi::class)
class FirstSyncViewModelTest {
    private val online = MutableStateFlow(false)
    private val db = FakeDb()
    private val binding = DeviceBinding(MemoryStore())
    private val signOutService = FakeSignOutService()

    @BeforeEach
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @AfterEach
    fun tearDown() = Dispatchers.resetMain()

    private suspend fun TestScope.viewModel(): FirstSyncViewModel {
        binding.save(
            Binding("u1", "e1", Role.OWNER, "Ana", "Tozzo", EstablishmentModules(null, null, null), "PAGO"),
        )
        val connectivity =
            object : Connectivity {
                override val online = this@FirstSyncViewModelTest.online
            }
        val sync = SyncController(db, connectivity, binding, backgroundScope)
        return FirstSyncViewModel(sync, SignOut(signOutService, sync))
    }

    @Test
    fun `offline state follows connectivity and stays`() =
        runTest(UnconfinedTestDispatcher()) {
            val vm = viewModel()
            assertEquals(FirstSyncUiState(offline = true), vm.state.value)
            online.value = true
            assertEquals(FirstSyncUiState(offline = false), vm.state.value)
            online.value = false
            assertEquals(FirstSyncUiState(offline = true), vm.state.value)
        }

    @Test
    fun showsErrorAfterTimeout() =
        runTest(UnconfinedTestDispatcher()) {
            online.value = true
            val vm = viewModel()

            // A failed download is reported after 20 s.
            db.status.value = LocalSyncStatus(true, false, false, false, downloadFailed = true)
            advanceTimeBy(19_999)
            assertEquals(FirstSyncUiState(offline = false, failed = false), vm.state.value)
            advanceTimeBy(2)
            assertEquals(FirstSyncUiState(offline = false, failed = true), vm.state.value)
        }

    @Test
    fun showsErrorAfterThirtySecondsWithoutProgress() =
        runTest(UnconfinedTestDispatcher()) {
            online.value = true
            val vm = viewModel()

            db.status.value = LocalSyncStatus(true, true, false, false)
            advanceTimeBy(29_999)
            assertEquals(false, vm.state.value.failed)
            // Progress (the status changed) starts the wait again.
            db.status.value = LocalSyncStatus(true, false, false, false)
            db.status.value = LocalSyncStatus(true, true, false, false)
            advanceTimeBy(29_999)
            assertEquals(false, vm.state.value.failed)
            advanceTimeBy(2)
            assertEquals(true, vm.state.value.failed)
        }

    @Test
    fun otherStatusChangesDoNotRestartTheWait() =
        runTest(UnconfinedTestDispatcher()) {
            online.value = true
            val vm = viewModel()

            // The SDK retries: `connected` toggles every 5 s while the download stays failed.
            var connected = true
            db.status.value = LocalSyncStatus(connected, false, false, false, downloadFailed = true)
            repeat(3) {
                advanceTimeBy(5_000)
                connected = !connected
                db.status.value = LocalSyncStatus(connected, false, false, false, downloadFailed = true)
            }
            assertEquals(false, vm.state.value.failed)
            advanceTimeBy(5_001)
            assertEquals(true, vm.state.value.failed)
        }

    @Test
    fun offlineShowsConnectMessage() =
        runTest(UnconfinedTestDispatcher()) {
            val vm = viewModel()
            db.status.value = LocalSyncStatus(false, false, false, false, downloadFailed = true)

            advanceTimeBy(120_000)

            // Offline is not an error: the message asks for a connection, with no timer running.
            assertEquals(FirstSyncUiState(offline = true, failed = false), vm.state.value)
        }

    @Test
    fun errorGoesAwayWhenTheDeviceGoesOffline() =
        runTest(UnconfinedTestDispatcher()) {
            online.value = true
            val vm = viewModel()
            db.status.value = LocalSyncStatus(true, false, false, false, downloadFailed = true)
            advanceTimeBy(21_000)
            assertEquals(true, vm.state.value.failed)

            online.value = false

            assertEquals(FirstSyncUiState(offline = true, failed = false), vm.state.value)
        }

    @Test
    fun signOutLeavesEvenWhenTheSecureStoreFails() =
        runTest(UnconfinedTestDispatcher()) {
            online.value = true
            signOutService.failure = java.io.IOException("keystore")
            val vm = viewModel()
            vm.signedOut.test {
                vm.signOut()
                awaitItem()
            }
            assertEquals(1, db.disconnects)
        }

    @Test
    fun signOutStopsTheSyncAndLeaves() =
        runTest(UnconfinedTestDispatcher()) {
            online.value = true
            val vm = viewModel()
            vm.signedOut.test {
                vm.signOut()
                awaitItem()
            }
            assertEquals(1, signOutService.signOuts)
            assertEquals(1, db.disconnects)
        }

    @Test
    fun `init starts the sync`() =
        runTest(UnconfinedTestDispatcher()) {
            online.value = true
            viewModel()
            assertEquals(1, db.connects)
        }

    @Test
    fun `done is emitted when the first sync finishes`() =
        runTest(UnconfinedTestDispatcher()) {
            online.value = true
            val vm = viewModel()
            vm.done.test {
                expectNoEvents()
                db.status.value = LocalSyncStatus(true, false, false, true)
                awaitItem()
            }
        }

    @Test
    fun `a database that fails to open does not crash the first sync`() =
        runTest(UnconfinedTestDispatcher()) {
            db.openFailure = IllegalStateException("cannot open")
            online.value = true
            val vm = viewModel()
            vm.done.test { expectNoEvents() }
            assertEquals(FirstSyncUiState(offline = false), vm.state.value)
        }

    private class FakeDb : LocalDatabase {
        var connects = 0
        val status = MutableStateFlow(LocalSyncStatus(false, false, false, false))

        /** Makes the status fail, like a database that cannot be opened. */
        var openFailure: Exception? = null

        override fun status(): Flow<LocalSyncStatus> =
            flow {
                openFailure?.let { throw it }
                emitAll(status)
            }

        override fun watchRejections(): Flow<List<SyncRejection>> = MutableStateFlow(emptyList())

        override fun watchCount(sql: String): Flow<Int> = MutableStateFlow(0)

        override suspend fun connect() {
            connects++
        }

        var disconnects = 0

        override suspend fun disconnect() {
            disconnects++
        }

        override suspend fun disconnectAndClear() = Unit
    }

    private class MemoryStore : SecureStore {
        private val values = mutableMapOf<String, String>()

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
