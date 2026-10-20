package uk.tozzo.app.feature.shell

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import kotlinx.coroutines.launch
import uk.tozzo.app.R
import uk.tozzo.app.core.session.Binding
import uk.tozzo.app.domain.AppDestination
import uk.tozzo.app.domain.navigationItems
import uk.tozzo.app.domain.resolveNavigationModules
import uk.tozzo.app.ui.theme.TozzoColors

internal const val SHELL_TITLE_TAG = "shell_title"
private const val REJECTIONS_ROUTE = "rejections"

/**
 * The signed-in app: drawer, top bar with the sync badge, and one route per [AppDestination].
 * [settingsContent] and [rejectionsContent] are slots so the screen stays testable without view models.
 */
@Composable
fun ShellScreen(
    binding: Binding,
    start: AppDestination,
    badge: SyncBadgeState,
    paymentRequired: Boolean,
    settingsContent: @Composable () -> Unit,
    rejectionsContent: @Composable () -> Unit,
) {
    val items = remember(binding) { navigationItems(resolveNavigationModules(binding.role, binding.modules)) }
    val labels = remember(items) { items.associate { it.destination to it.label } }
    val navController = rememberNavController()
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val route =
        navController
            .currentBackStackEntryAsState()
            .value
            ?.destination
            ?.route ?: start.name
    val current = AppDestination.entries.firstOrNull { it.name == route }
    val title = if (current == null) R.string.rejections_title else labels[current] ?: R.string.app_name

    ModalNavigationDrawer(
        drawerState = drawerState,
        gesturesEnabled = true,
        drawerContent = {
            AppDrawer(drawerState, binding, items, current) { destination ->
                navController.openTopLevel(destination, start)
                scope.launch { drawerState.close() }
            }
        },
    ) {
        Scaffold(
            topBar = {
                ShellTopBar(
                    title = title,
                    badge = badge,
                    paymentRequired = paymentRequired,
                    onOpenMenu = { scope.launch { drawerState.open() } },
                    onOpenRejections = { navController.navigate(REJECTIONS_ROUTE) { launchSingleTop = true } },
                )
            },
        ) { padding ->
            NavHost(
                navController = navController,
                startDestination = start.name,
                modifier = Modifier.fillMaxSize().padding(padding),
            ) {
                AppDestination.entries.forEach { destination ->
                    composable(destination.name) {
                        if (destination == AppDestination.SETTINGS) {
                            settingsContent()
                        } else {
                            ModulePlaceholderScreen(labels[destination] ?: R.string.app_name)
                        }
                    }
                }
                composable(REJECTIONS_ROUTE) { rejectionsContent() }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ShellTopBar(
    @StringRes title: Int,
    badge: SyncBadgeState,
    paymentRequired: Boolean,
    onOpenMenu: () -> Unit,
    onOpenRejections: () -> Unit,
) {
    Column {
        TopAppBar(
            title = { Text(stringResource(title), modifier = Modifier.testTag(SHELL_TITLE_TAG)) },
            navigationIcon = {
                IconButton(onClick = onOpenMenu) {
                    Icon(MenuIcon, contentDescription = stringResource(R.string.nav_open_menu))
                }
            },
            actions = {
                SyncBadge(badge, onOpenRejections)
                Spacer(Modifier.width(12.dp))
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
        )
        if (paymentRequired) PaymentRequiredBanner()
    }
}

/** Top-level modules replace each other, keeping only the start one below. */
private fun NavHostController.openTopLevel(
    destination: AppDestination,
    start: AppDestination,
) {
    navigate(destination.name) {
        popUpTo(start.name) { saveState = true }
        launchSingleTop = true
        restoreState = true
    }
}

@Composable
private fun PaymentRequiredBanner() {
    Surface(color = TozzoColors.warning, contentColor = Color.Black, modifier = Modifier.fillMaxWidth()) {
        Text(
            stringResource(R.string.payment_required_banner),
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            style = MaterialTheme.typography.bodyMedium,
        )
    }
}

private val MenuIcon: ImageVector =
    ImageVector
        .Builder("Menu", 24.dp, 24.dp, 24f, 24f)
        .apply {
            path(fill = SolidColor(Color.Black)) {
                moveTo(3f, 6f)
                horizontalLineTo(21f)
                verticalLineTo(8f)
                horizontalLineTo(3f)
                close()
                moveTo(3f, 11f)
                horizontalLineTo(21f)
                verticalLineTo(13f)
                horizontalLineTo(3f)
                close()
                moveTo(3f, 16f)
                horizontalLineTo(21f)
                verticalLineTo(18f)
                horizontalLineTo(3f)
                close()
            }
        }.build()
