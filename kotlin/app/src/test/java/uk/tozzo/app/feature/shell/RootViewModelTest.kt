package uk.tozzo.app.feature.shell

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import uk.tozzo.app.core.session.DeviceBinding
import uk.tozzo.app.core.session.SessionEvent
import uk.tozzo.app.core.session.SessionEvents
import uk.tozzo.app.core.session.TokenStore
import uk.tozzo.app.core.sync.LocalSyncStatus
import uk.tozzo.app.core.sync.SignOut
import uk.tozzo.app.core.sync.SyncController
import uk.tozzo.app.core.sync.SyncState
import uk.tozzo.app.domain.AppDestination
import uk.tozzo.app.domain.BusinessProfile
import uk.tozzo.app.domain.EstablishmentModules
import uk.tozzo.app.domain.Role
import uk.tozzo.app.feature.login.Notice
import uk.tozzo.app.testing.FakeConnectivity
import uk.tozzo.app.testing.FakeLocalDatabase
import uk.tozzo.app.testing.FakeSignOutService
import uk.tozzo.app.testing.MemoryStore
import uk.tozzo.app.testing.foodOwnerBinding

@OptIn(ExperimentalCoroutinesApi::class)
class RootViewModelTest {
    private val store = MemoryStore()
    private val binding = DeviceBinding(store)
    private val tokens = TokenStore(store)
    private val events = SessionEvents()
    private val db = FakeLocalDatabase()
    private val connectivity = FakeConnectivity(initial = true)

    @BeforeEach
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @AfterEach
    fun tearDown() = Dispatchers.resetMain()

    private val signOutService = FakeSignOutService()

    private fun TestScope.viewModel(): RootViewModel {
        val sync = SyncController(db, connectivity, binding, backgroundScope)
        return RootViewModel(binding, tokens, sync, events, SignOut(signOutService, sync))
    }

    private suspend fun signedIn(hasSynced: Boolean?) {
        DeviceBinding(store).save(foodOwnerBinding())
        store.put(TokenStore.REFRESH_TOKEN_KEY, "refresh")
        db.status.value = LocalSyncStatus(false, false, false, hasSynced)
    }

    @Test
    fun noBindingGoesToLogin() =
        runTest(UnconfinedTestDispatcher()) {
            db.status.value = LocalSyncStatus(false, false, false, false)
            assertEquals(RootState.Login, viewModel().state.value)
        }

    @Test
    fun bindingWithoutRefreshTokenGoesToLoginKeepingTheBinding() =
        runTest(UnconfinedTestDispatcher()) {
            signedIn(hasSynced = true)
            store.put(TokenStore.REFRESH_TOKEN_KEY, null)
            assertEquals(RootState.Login, viewModel().state.value)
            assertNotNull(binding.current.value)
            assertEquals(0, db.clears)
        }

    @Test
    fun unreadableRefreshTokenCountsAsSignedIn() =
        runTest(UnconfinedTestDispatcher()) {
            signedIn(hasSynced = true)
            store.failingReads += TokenStore.REFRESH_TOKEN_KEY
            assertEquals(RootState.Ready(foodOwnerBinding(), AppDestination.SELL), viewModel().state.value)
        }

    @Test
    fun killedDuringFirstSyncReturnsToFirstSync() =
        runTest(UnconfinedTestDispatcher()) {
            signedIn(hasSynced = false)
            assertEquals(RootState.FirstSync, viewModel().state.value)
        }

    @Test
    fun waitsForTheStoredSyncStatusBeforeRouting() =
        runTest(UnconfinedTestDispatcher()) {
            signedIn(hasSynced = null)
            val vm = viewModel()
            assertEquals(RootState.Loading, vm.state.value)
            db.status.value = LocalSyncStatus(false, false, false, true)
            assertEquals(RootState.Ready(foodOwnerBinding(), AppDestination.SELL), vm.state.value)
        }

    @Test
    fun readyWithoutNetwork() =
        runTest(UnconfinedTestDispatcher()) {
            connectivity.online.value = false
            signedIn(hasSynced = true)
            assertEquals(RootState.Ready(foodOwnerBinding(), AppDestination.SELL), viewModel().state.value)
        }

    @Test
    fun firstSyncAndReadyStartTheSync() =
        runTest(UnconfinedTestDispatcher()) {
            signedIn(hasSynced = false)
            viewModel()
            assertEquals(1, db.connects)
        }

    @Test
    fun noStartDestinationIsBlocked() =
        runTest(UnconfinedTestDispatcher()) {
            signedIn(hasSynced = true)
            binding.save(
                foodOwnerBinding(Role.COOK).copy(
                    modules = EstablishmentModules(null, listOf(BusinessProfile.STORE), null),
                ),
            )
            assertEquals(RootState.Blocked(Notice.NoAccess), viewModel().state.value)
            assertEquals(0, db.connects)
        }

    @Test
    fun cookAndDriverStartOnTheirOwnModule() =
        runTest(UnconfinedTestDispatcher()) {
            signedIn(hasSynced = true)
            val starts = listOf(Role.COOK to AppDestination.KITCHEN, Role.DRIVER to AppDestination.DELIVERIES)
            for ((role, start) in starts) {
                binding.save(foodOwnerBinding(role))
                assertEquals(RootState.Ready(foodOwnerBinding(role), start), viewModel().state.value)
            }
        }

    @Test
    fun signOutGoesToLoginKeepingBindingAndData() =
        runTest(UnconfinedTestDispatcher()) {
            signedIn(hasSynced = true)
            val vm = viewModel()
            assertTrue(vm.state.value is RootState.Ready)

            vm.signOut()

            assertEquals(RootState.Login, vm.state.value)
            assertEquals(1, signOutService.signOuts)
            assertEquals(1, db.disconnects)
            assertEquals(0, db.clears)
            assertNotNull(binding.current.value)
        }

    @Test
    fun signOutGoesToLoginEvenWhenTheSecureStoreFails() =
        runTest(UnconfinedTestDispatcher()) {
            signedIn(hasSynced = true)
            val vm = viewModel()
            signOutService.failure = java.io.IOException("keystore")

            vm.signOut()

            assertEquals(RootState.Login, vm.state.value)
            assertEquals(1, db.disconnects)
        }

    @Test
    fun revokedGoesToLoginKeepingBindingAndData() =
        runTest(UnconfinedTestDispatcher()) {
            signedIn(hasSynced = true)
            val vm = viewModel()
            events.emit(SessionEvent.Revoked)
            assertEquals(RootState.Login, vm.state.value)
            assertNotNull(binding.current.value)
            assertEquals(0, db.clears)
            assertTrue(events.events.replayCache.isEmpty())
        }

    @Test
    fun revokedStopsSync() =
        runTest(UnconfinedTestDispatcher()) {
            signedIn(hasSynced = true)
            val vm = viewModel()
            assertEquals(1, db.connects)
            events.emit(SessionEvent.Revoked)
            assertEquals(1, db.disconnects)
            assertEquals(RootState.Login, vm.state.value)

            vm.onLoggedIn()
            assertEquals(RootState.Ready(foodOwnerBinding(), AppDestination.SELL), vm.state.value)
            assertEquals(2, db.connects)
        }

    @Test
    fun establishmentDeletedClearsEverythingAndBlocks() =
        runTest(UnconfinedTestDispatcher()) {
            signedIn(hasSynced = true)
            val vm = viewModel()
            events.emit(SessionEvent.EstablishmentDeleted)
            assertEquals(RootState.Blocked(Notice.EstablishmentDeleted), vm.state.value)
            assertEquals(1, db.clears)
            assertNull(binding.current.value)
            assertNull(DeviceBinding(store).apply { load() }.current.value)
            assertNull(tokens.refreshToken())
            assertTrue(events.events.replayCache.isEmpty())
            vm.onBackToLogin()
            assertEquals(RootState.Login, vm.state.value)
        }

    @Test
    fun paymentRequiredStaysReadyWithTheBanner() =
        runTest(UnconfinedTestDispatcher()) {
            signedIn(hasSynced = true)
            val vm = viewModel()
            assertFalse(vm.paymentRequired.value)
            events.emit(SessionEvent.PaymentRequired)
            assertEquals(RootState.Ready(foodOwnerBinding(), AppDestination.SELL), vm.state.value)
            assertTrue(vm.paymentRequired.value)
            assertTrue(events.events.replayCache.isEmpty())
        }

    @Test
    fun eventEmittedBeforeTheViewModelIsHandled() =
        runTest(UnconfinedTestDispatcher()) {
            signedIn(hasSynced = true)
            events.emit(SessionEvent.Revoked)
            assertEquals(RootState.Login, viewModel().state.value)
            assertTrue(events.events.replayCache.isEmpty())
        }

    @Test
    fun loggedInReloadsTheBindingAndGoesToFirstSync() =
        runTest(UnconfinedTestDispatcher()) {
            db.status.value = LocalSyncStatus(false, false, false, false)
            val vm = viewModel()
            assertEquals(RootState.Login, vm.state.value)
            // What a successful login leaves behind, written by another DeviceBinding instance.
            DeviceBinding(store).save(foodOwnerBinding())
            store.put(TokenStore.REFRESH_TOKEN_KEY, "refresh")
            vm.onLoggedIn()
            assertEquals(RootState.FirstSync, vm.state.value)
        }

    @Test
    fun firstSyncDoneGoesToReady() =
        runTest(UnconfinedTestDispatcher()) {
            signedIn(hasSynced = false)
            val vm = viewModel()
            vm.onFirstSyncDone()
            assertEquals(RootState.Ready(foodOwnerBinding(), AppDestination.SELL), vm.state.value)
        }

    @Test
    fun loginNoticeIsShownAndBackReturnsToLogin() =
        runTest(UnconfinedTestDispatcher()) {
            db.status.value = LocalSyncStatus(false, false, false, false)
            val vm = viewModel()
            vm.onNotice(Notice.NeedsWebSetup)
            assertEquals(RootState.Blocked(Notice.NeedsWebSetup), vm.state.value)
            vm.onBackToLogin()
            assertEquals(RootState.Login, vm.state.value)
        }

    @Test
    fun unboundGoesToLogin() =
        runTest(UnconfinedTestDispatcher()) {
            signedIn(hasSynced = true)
            val vm = viewModel()
            vm.onUnbound()
            assertEquals(RootState.Login, vm.state.value)
        }

    @Test
    fun establishmentDeletedStillBlocksWhenTheClearFails() =
        runTest(UnconfinedTestDispatcher()) {
            signedIn(hasSynced = true)
            val vm = viewModel()
            db.clearFailure = IllegalStateException("sqlite")
            events.emit(SessionEvent.EstablishmentDeleted)
            assertEquals(RootState.Blocked(Notice.EstablishmentDeleted), vm.state.value)
            assertNull(binding.current.value)
            assertNull(tokens.refreshToken())
            assertTrue(events.events.replayCache.isEmpty())
            // the collector survived
            events.emit(SessionEvent.PaymentRequired)
            assertTrue(vm.paymentRequired.value)
        }

    @Test
    fun unreadableSyncStatusGoesToFirstSync() =
        runTest(UnconfinedTestDispatcher()) {
            signedIn(hasSynced = true)
            val controller = SyncController(db, connectivity, binding, backgroundScope)
            db.statusFailure = IllegalStateException("cannot open")
            val vm = RootViewModel(binding, tokens, controller, events, SignOut(signOutService, controller))
            assertEquals(RootState.FirstSync, vm.state.value)
        }

    @Test
    fun aDatabaseThatFailsToOpenKeepsTheBadgeAndTheRouting() =
        runTest(UnconfinedTestDispatcher()) {
            signedIn(hasSynced = true)
            db.statusFailure = IllegalStateException("cannot open")
            db.countFailure = IllegalStateException("cannot open")
            val vm = viewModel()
            backgroundScope.launch { vm.syncBadge.collect {} }
            assertEquals(RootState.FirstSync, vm.state.value)
            assertEquals(SyncBadgeState(SyncState.SYNCING, rejections = 0), vm.syncBadge.value)
        }
}
