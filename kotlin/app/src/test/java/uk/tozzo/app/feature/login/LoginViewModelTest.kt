package uk.tozzo.app.feature.login

import app.cash.turbine.test
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import uk.tozzo.app.R
import uk.tozzo.app.core.network.ApiProblem
import uk.tozzo.app.core.session.Binding
import uk.tozzo.app.core.session.LoginResult
import uk.tozzo.app.core.session.LoginService
import uk.tozzo.app.domain.EstablishmentModules
import uk.tozzo.app.domain.Role
import uk.tozzo.app.ui.UiText

@OptIn(ExperimentalCoroutinesApi::class)
class LoginViewModelTest {
    private class FakeLogin(
        var result: CompletableDeferred<LoginResult> = CompletableDeferred(),
    ) : LoginService {
        val calls = mutableListOf<Pair<String, String>>()

        override suspend fun login(
            email: String,
            password: String,
        ): LoginResult {
            calls += email to password
            return result.await()
        }
    }

    private var login = FakeLogin()

    @BeforeEach
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @AfterEach
    fun tearDown() = Dispatchers.resetMain()

    private fun viewModel(result: LoginResult? = null): LoginViewModel {
        result?.let { login.result.complete(it) }
        return LoginViewModel(login).apply {
            onEmail("  ana@x.com ")
            onPassword(" secret ")
        }
    }

    private fun assertError(
        result: LoginResult,
        expected: UiText,
    ) {
        login = FakeLogin()
        val vm = viewModel(result)
        vm.submit()
        assertEquals(expected, vm.state.value.error)
        assertNull(vm.state.value.notice)
        assertFalse(vm.state.value.loading)
    }

    private fun assertNotice(
        result: LoginResult,
        expected: Notice,
    ) {
        login = FakeLogin()
        val vm = viewModel(result)
        vm.submit()
        assertEquals(expected, vm.state.value.notice)
        assertNull(vm.state.value.error)
        assertFalse(vm.state.value.loading)
    }

    @Test
    fun `loading is on while the repository works and off after`() {
        val vm = viewModel()
        vm.submit()
        assertTrue(vm.state.value.loading)
        login.result.complete(LoginResult.InvalidCredentials)
        assertFalse(vm.state.value.loading)
    }

    @Test
    fun `email and password are trimmed before the call`() {
        val vm = viewModel(LoginResult.InvalidCredentials)
        vm.submit()
        assertEquals(listOf("ana@x.com" to "secret"), login.calls)
    }

    @Test
    fun `errors map to strings`() {
        assertError(LoginResult.InvalidCredentials, UiText(R.string.login_error_credentials))
        assertError(LoginResult.EmailNotVerified, UiText(R.string.login_error_email_not_verified))
        assertError(LoginResult.OtherUserBound, UiText(R.string.login_error_other_user))
        assertError(LoginResult.UnsentDataOfUnknownUser, UiText(R.string.login_error_unsent_data))
        assertError(LoginResult.DeviceLimitReached(3), UiText(R.string.login_error_device_limit, listOf(3)))
        assertError(LoginResult.DeviceLimitReached(null), UiText(R.string.login_error_device_limit_generic))
        assertError(LoginResult.Offline, UiText(R.string.login_error_offline))
        assertError(LoginResult.Failed(null), UiText(R.string.login_error_generic))
        assertError(LoginResult.Failed(ApiProblem(500, "X", "t", null)), UiText(R.string.login_error_generic))
    }

    @Test
    fun `refusals map to notices`() {
        assertNotice(LoginResult.NoAccess, Notice.NO_ACCESS)
        assertNotice(LoginResult.RoleNotYetSupported, Notice.ROLE_NOT_YET_SUPPORTED)
        assertNotice(LoginResult.NeedsWebSetup, Notice.NEEDS_WEB_SETUP)
        assertNotice(LoginResult.EstablishmentDeleted, Notice.ESTABLISHMENT_DELETED)
    }

    @Test
    fun `success emits loggedIn once`() =
        runTest {
            val vm = viewModel(LoginResult.Success(binding))
            vm.loggedIn.test {
                vm.submit()
                awaitItem()
                expectNoEvents()
            }
        }

    @Test
    fun `empty email or password does not call the repository`() {
        val noEmail = LoginViewModel(login).apply { onPassword("x") }
        noEmail.submit()
        val noPassword = LoginViewModel(login).apply { onEmail("a@b.c") }
        noPassword.submit()
        val blank =
            LoginViewModel(login).apply {
                onEmail("   ")
                onPassword("x")
            }
        blank.submit()
        assertTrue(login.calls.isEmpty())
        listOf(noEmail, noPassword, blank).forEach {
            assertEquals(UiText(R.string.login_error_required), it.state.value.error)
        }
    }

    @Test
    fun `typing clears the error and a new submit clears the notice`() {
        val vm = viewModel(LoginResult.NoAccess)
        vm.submit()
        assertEquals(Notice.NO_ACCESS, vm.state.value.notice)
        vm.dismissNotice()
        assertNull(vm.state.value.notice)
        vm.onEmail("b@c.d")
        assertNull(vm.state.value.error)
    }

    private val binding =
        Binding("u1", "e1", Role.OWNER, "Ana", "Tozzo", EstablishmentModules(null, null, null), "PAGO")
}
