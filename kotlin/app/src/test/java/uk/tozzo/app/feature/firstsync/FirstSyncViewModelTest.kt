package uk.tozzo.app.feature.firstsync

import app.cash.turbine.test
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
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
import uk.tozzo.app.core.sync.SyncController
import uk.tozzo.app.core.sync.SyncRejection
import uk.tozzo.app.domain.EstablishmentModules
import uk.tozzo.app.domain.Role

@OptIn(ExperimentalCoroutinesApi::class)
class FirstSyncViewModelTest {
    private val online = MutableStateFlow(false)
    private val db = FakeDb()
    private val binding = DeviceBinding(MemoryStore())

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
        return FirstSyncViewModel(SyncController(db, connectivity, binding, backgroundScope))
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

    private class FakeDb : LocalDatabase {
        var connects = 0
        val status = MutableStateFlow(LocalSyncStatus(false, false, false, false))

        override fun status(): Flow<LocalSyncStatus> = status

        override fun watchRejections(): Flow<List<SyncRejection>> = MutableStateFlow(emptyList())

        override fun watchCount(sql: String): Flow<Int> = MutableStateFlow(0)

        override suspend fun connect() {
            connects++
        }

        override suspend fun disconnect() = Unit

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
