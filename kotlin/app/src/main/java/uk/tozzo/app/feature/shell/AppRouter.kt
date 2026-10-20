package uk.tozzo.app.feature.shell

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import uk.tozzo.app.feature.firstsync.FirstSyncRoute
import uk.tozzo.app.feature.login.LoginRoute
import uk.tozzo.app.feature.login.Notice
import uk.tozzo.app.feature.notice.NoticeScreen
import uk.tozzo.app.feature.products.ProductsRoute
import uk.tozzo.app.feature.rejections.RejectionsRoute
import uk.tozzo.app.feature.settings.SettingsRoute
import uk.tozzo.app.ui.components.LoadingState

private const val LOADING_ROUTE = "loading"
private const val LOGIN_ROUTE = "login"
private const val FIRST_SYNC_ROUTE = "first_sync"
private const val BLOCKED_ROUTE = "blocked"
private const val SHELL_ROUTE = "shell"

/**
 * The root of the app: shows the screen of the current [RootState]. Each state is its own
 * destination with nothing below it, so the view models of a screen left behind are cleared
 * (a second login or first sync after an unbind starts fresh).
 */
@Composable
fun AppRouter(viewModel: RootViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val navController = rememberNavController()
    val route = state.route()
    LaunchedEffect(route) {
        if (navController.currentDestination?.route != route) {
            navController.navigate(route) {
                popUpTo(navController.graph.id) { inclusive = true }
                launchSingleTop = true
            }
        }
    }
    NavHost(navController = navController, startDestination = LOADING_ROUTE) {
        composable(LOADING_ROUTE) {
            Surface(Modifier.fillMaxSize()) {
                Box(contentAlignment = Alignment.Center) { LoadingState() }
            }
        }
        composable(LOGIN_ROUTE) {
            LoginRoute(onLoggedIn = viewModel::onLoggedIn, onNotice = viewModel::onNotice)
        }
        composable(FIRST_SYNC_ROUTE) {
            FirstSyncRoute(onDone = viewModel::onFirstSyncDone, onSignedOut = viewModel::onSignedOut)
        }
        composable(BLOCKED_ROUTE) {
            (state as? RootState.Blocked)?.let { BlockedRoute(it.notice, onBackToLogin = viewModel::onBackToLogin) }
        }
        composable(SHELL_ROUTE) {
            (state as? RootState.Ready)?.let { ShellRoute(it, viewModel) }
        }
    }
}

/** A notice is the only entry of the root back stack: system back leads to the login, like its button. */
@Composable
internal fun BlockedRoute(
    notice: Notice,
    onBackToLogin: () -> Unit,
) {
    BackHandler(onBack = onBackToLogin)
    NoticeScreen(notice, onBackToLogin)
}

private fun RootState.route(): String =
    when (this) {
        RootState.Loading -> LOADING_ROUTE
        RootState.Login -> LOGIN_ROUTE
        RootState.FirstSync -> FIRST_SYNC_ROUTE
        is RootState.Blocked -> BLOCKED_ROUTE
        is RootState.Ready -> SHELL_ROUTE
    }

@Composable
private fun ShellRoute(
    ready: RootState.Ready,
    viewModel: RootViewModel,
) {
    val badge by viewModel.syncBadge.collectAsStateWithLifecycle()
    val paymentRequired by viewModel.paymentRequired.collectAsStateWithLifecycle()
    Surface(Modifier.fillMaxSize()) {
        ShellScreen(
            binding = ready.binding,
            start = ready.start,
            badge = badge,
            paymentRequired = paymentRequired,
            onSignOut = viewModel::signOut,
            settingsContent = {
                SettingsRoute(onUnbound = viewModel::onUnbound, onSignedOut = viewModel::onSignedOut)
            },
            rejectionsContent = { RejectionsRoute() },
            productsContent = { ProductsRoute() },
        )
    }
}
