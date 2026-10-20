package uk.tozzo.app.feature.settings

import app.cash.turbine.test
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import uk.tozzo.app.R
import uk.tozzo.app.core.session.DeviceBinding
import uk.tozzo.app.core.session.TokenStore
import uk.tozzo.app.core.sync.PENDING_OPS_SQL
import uk.tozzo.app.core.sync.REJECTIONS_SQL
import uk.tozzo.app.core.sync.SignOut
import uk.tozzo.app.core.sync.SyncController
import uk.tozzo.app.testing.CallLog
import uk.tozzo.app.testing.FakeAuthApi
import uk.tozzo.app.testing.FakeConnectivity
import uk.tozzo.app.testing.FakeLocalDatabase
import uk.tozzo.app.testing.FakeSignOutService
import uk.tozzo.app.testing.MemoryStore
import uk.tozzo.app.testing.foodOwnerBinding
import java.io.IOException

@OptIn(ExperimentalCoroutinesApi::class)
class SettingsViewModelTest {
    private val log = CallLog()
    private val store = MemoryStore(log)
    private val binding = DeviceBinding(store)
    private val tokens = TokenStore(store)
    private val db = FakeLocalDatabase(log)
    private val connectivity = FakeConnectivity(initial = true)
    private val authApi = FakeAuthApi(log)
    private val signOutService = FakeSignOutService(log)

    @BeforeEach
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @AfterEach
    fun tearDown() = Dispatchers.resetMain()

    private suspend fun TestScope.viewModel(): SettingsViewModel {
        binding.save(foodOwnerBinding())
        store.put(TokenStore.REFRESH_TOKEN_KEY, "refresh")
        val sync = SyncController(db, connectivity, binding, backgroundScope)
        return SettingsViewModel(sync, connectivity, binding, tokens, authApi, SignOut(signOutService, sync))
    }

    @Test
    fun signOutKeepsBindingAndData() =
        runTest(UnconfinedTestDispatcher()) {
            val vm = viewModel()
            // Always allowed: offline and with changes waiting to be sent.
            connectivity.online.value = false
            db.count(PENDING_OPS_SQL).value = 2
            db.count(REJECTIONS_SQL).value = 1
            assertEquals(false, vm.state.value.canUnbind)
            log.calls.clear()
            vm.signedOut.test {
                vm.signOut()
                awaitItem()
            }
            assertEquals(listOf("session.signOut"), log.calls)
            assertEquals(1, signOutService.signOuts)
            assertEquals(1, db.disconnects)
            assertEquals(0, db.clears)
            assertEquals(foodOwnerBinding(), binding.current.value)
            assertEquals(foodOwnerBinding(), DeviceBinding(store).apply { load() }.current.value)
            assertEquals("refresh", tokens.refreshToken())
        }

    @Test
    fun showsTheBoundUserAndEstablishment() =
        runTest(UnconfinedTestDispatcher()) {
            val state = viewModel().state.value
            assertEquals("Ana", state.userName)
            assertEquals("Burger da Ana", state.establishmentName)
        }

    @Test
    fun pendingOpsBlockTheUnbind() =
        runTest(UnconfinedTestDispatcher()) {
            val vm = viewModel()
            db.count(PENDING_OPS_SQL).value = 2
            assertEquals(false, vm.state.value.canUnbind)
            assertEquals(R.string.unbind_blocked_pending, vm.state.value.unbindBlockedReason)
            vm.unbind()
            assertEquals(0, db.clears)
        }

    @Test
    fun unbindWarnsAboutRejections() =
        runTest(UnconfinedTestDispatcher()) {
            val vm = viewModel()
            assertEquals(0, vm.state.value.rejections)
            db.count(REJECTIONS_SQL).value = 3
            assertEquals(3, vm.state.value.rejections)
            // Still allowed: the dialog warns and asks again.
            assertEquals(true, vm.state.value.canUnbind)
            vm.unbound.test {
                vm.unbind()
                awaitItem()
            }
            assertEquals(1, db.clears)
        }

    @Test
    fun offlineBlocksTheUnbind() =
        runTest(UnconfinedTestDispatcher()) {
            val vm = viewModel()
            connectivity.online.value = false
            assertEquals(false, vm.state.value.canUnbind)
            assertEquals(R.string.unbind_blocked_offline, vm.state.value.unbindBlockedReason)
            vm.unbind()
            assertEquals(0, db.clears)
        }

    @Test
    fun onlineWithoutPendingOpsCanUnbind() =
        runTest(UnconfinedTestDispatcher()) {
            val state = viewModel().state.value
            assertEquals(true, state.canUnbind)
            assertNull(state.unbindBlockedReason)
        }

    @Test
    fun unbindClearsEverythingAndLogsOut() =
        runTest(UnconfinedTestDispatcher()) {
            val vm = viewModel()
            log.calls.clear()
            vm.unbound.test {
                vm.unbind()
                awaitItem()
            }
            assertEquals(
                listOf("db.clear", "store.remove:binding", "api.logout", "store.remove:refresh_token"),
                log.calls,
            )
            assertNull(binding.current.value)
            assertNull(tokens.refreshToken())
        }

    @Test
    fun logoutNetworkFailureDoesNotStopTheUnbind() =
        runTest(UnconfinedTestDispatcher()) {
            val vm = viewModel()
            authApi.logoutFailure = IOException("offline")
            vm.unbound.test {
                vm.unbind()
                awaitItem()
            }
            assertEquals(1, db.clears)
            assertNull(binding.current.value)
            assertNull(tokens.refreshToken())
        }

    @Test
    fun unbindStaysBlockedUntilThePendingCountWasRead() =
        runTest(UnconfinedTestDispatcher()) {
            db.unreadCounts += PENDING_OPS_SQL
            val vm = viewModel()
            assertEquals(false, vm.state.value.canUnbind)
            vm.unbind()
            assertEquals(0, db.clears)
            assertEquals(foodOwnerBinding(), binding.current.value)
        }

    @Test
    fun failedClearKeepsTheDeviceBoundAndShowsTheError() =
        runTest(UnconfinedTestDispatcher()) {
            val vm = viewModel()
            db.clearFailure = IllegalStateException("sqlite")
            vm.unbound.test {
                vm.unbind()
                expectNoEvents()
            }
            assertEquals(R.string.unbind_failed, vm.state.value.unbindError)
            assertEquals(foodOwnerBinding(), binding.current.value)
            assertEquals("refresh", tokens.refreshToken())
            // unbinding was reset: a retry runs again and succeeds
            db.clearFailure = null
            vm.unbound.test {
                vm.unbind()
                awaitItem()
            }
            assertNull(vm.state.value.unbindError)
            assertNull(binding.current.value)
        }

    @Test
    fun aQueueThatCannotBeReadBlocksTheUnbindWithoutCrashing() =
        runTest(UnconfinedTestDispatcher()) {
            db.countFailure = IllegalStateException("cannot open")
            val vm = viewModel()
            assertEquals(false, vm.state.value.canUnbind)
            vm.unbind()
            assertEquals(0, db.clears)
            assertEquals("Ana", vm.state.value.userName)
        }
}
