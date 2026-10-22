package uk.tozzo.app.feature.shell

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import kotlinx.coroutines.launch
import uk.tozzo.app.R
import uk.tozzo.app.core.session.Binding
import uk.tozzo.app.domain.AppDestination
import uk.tozzo.app.domain.Role
import uk.tozzo.app.domain.navigationItems
import uk.tozzo.app.domain.resolveNavigationModules
import uk.tozzo.app.ui.icons.TozzoIcons
import uk.tozzo.app.ui.theme.TozzoColors

internal const val SHELL_TITLE_TAG = "shell_title"
private const val REJECTIONS_ROUTE = "rejections"
private const val ORDER_EDIT_ROUTE = "order_edit/{orderId}?readOnly={readOnly}"
private const val READ_ONLY_ARG = "readOnly"
private const val SALE_DETAIL_ROUTE = "sale_detail/{saleId}"

/**
 * The signed-in app: top bar with the sync badge, and one route per [AppDestination]. The roles with
 * a single module (COOK, DRIVER) have no drawer: a ⋮ menu offers Settings and Sign out instead.
 * [settingsContent], [rejectionsContent], [productsContent], [sellContent], [ordersContent],
 * [orderEditContent], [kitchenContent], [deliveriesContent], [salesContent] and [saleDetailContent] (the placeholder
 * when absent) are slots, so the screen stays testable without view models. The orders list opens the edit route of an
 * order; "Novo pedido" opens Sell; Deliveries opens the same route read-only ("Ver pedido"). The sales list opens
 * the sale detail, "Nova venda" opens Sell, and Sell's "Ver venda" opens the detail of the sale just made.
 */
@Suppress("LongMethod")
@Composable
fun ShellScreen(
    binding: Binding,
    start: AppDestination,
    badge: SyncBadgeState,
    paymentRequired: Boolean,
    onSignOut: () -> Unit,
    settingsContent: @Composable () -> Unit,
    rejectionsContent: @Composable () -> Unit,
    productsContent: (@Composable () -> Unit)? = null,
    sellContent: (@Composable (onViewSale: (String) -> Unit) -> Unit)? = null,
    ordersContent: (@Composable (onNewOrder: () -> Unit, onEdit: (String) -> Unit) -> Unit)? = null,
    orderEditContent: (@Composable (onExit: () -> Unit) -> Unit)? = null,
    kitchenContent: (@Composable () -> Unit)? = null,
    deliveriesContent: (@Composable (onView: (String) -> Unit) -> Unit)? = null,
    salesContent: (@Composable (onNewSale: () -> Unit, onOpen: (String) -> Unit) -> Unit)? = null,
    saleDetailContent: (@Composable (onExit: () -> Unit) -> Unit)? = null,
) {
    val items = remember(binding) { navigationItems(resolveNavigationModules(binding.role, binding.modules)) }
    val labels = remember(items) { items.associate { it.destination to it.label } }
    val navController = rememberNavController()
    val entry = navController.currentBackStackEntryAsState().value
    val route = entry?.destination?.route ?: start.name
    val readOnly = entry?.arguments?.getBoolean(READ_ONLY_ARG) == true
    val current = AppDestination.entries.firstOrNull { it.name == route }
    val title =
        when {
            route == ORDER_EDIT_ROUTE && readOnly -> R.string.deliveries_details_title
            route == ORDER_EDIT_ROUTE -> R.string.orders_edit_title
            route == SALE_DETAIL_ROUTE -> R.string.sales_detail_title
            current == null -> R.string.rejections_title
            current == AppDestination.SETTINGS -> R.string.nav_settings
            else -> labels[current] ?: R.string.app_name
        }
    val content: @Composable (navigation: ShellNavigation) -> Unit = { navigation ->
        Scaffold(
            topBar = {
                ShellTopBar(
                    title = title,
                    badge = badge,
                    paymentRequired = paymentRequired,
                    navigation = navigation,
                    onOpenRejections = { navController.navigate(REJECTIONS_ROUTE) { launchSingleTop = true } },
                )
            },
        ) { padding ->
            ShellNavHost(
                navController,
                start,
                labels,
                Modifier.padding(padding),
                settingsContent,
                rejectionsContent,
                ShellSlots(
                    productsContent,
                    sellContent,
                    ordersContent,
                    orderEditContent,
                    kitchenContent,
                    deliveriesContent,
                    salesContent,
                    saleDetailContent,
                ),
            )
        }
    }

    if (binding.role == Role.COOK || binding.role == Role.DRIVER) {
        content(
            ShellNavigation.MoreMenu(
                onOpenSettings = { navController.openTopLevel(AppDestination.SETTINGS, start) },
                onSignOut = onSignOut,
            ),
        )
    } else {
        val drawerState = rememberDrawerState(DrawerValue.Closed)
        val scope = rememberCoroutineScope()
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
            content(ShellNavigation.Drawer(onOpenMenu = { scope.launch { drawerState.open() } }))
        }
    }
}

@Composable
private fun ShellNavHost(
    navController: NavHostController,
    start: AppDestination,
    labels: Map<AppDestination, Int>,
    modifier: Modifier,
    settingsContent: @Composable () -> Unit,
    rejectionsContent: @Composable () -> Unit,
    slots: ShellSlots,
) {
    NavHost(navController = navController, startDestination = start.name, modifier = modifier.fillMaxSize()) {
        AppDestination.entries.forEach { destination ->
            composable(destination.name) {
                DestinationContent(destination, navController, start, labels[destination], settingsContent, slots)
            }
        }
        composable(REJECTIONS_ROUTE) { rejectionsContent() }
        composable(SALE_DETAIL_ROUTE) { slots.saleDetail?.invoke { navController.popBackStack() } }
        composable(
            ORDER_EDIT_ROUTE,
            arguments =
                listOf(
                    navArgument(READ_ONLY_ARG) {
                        type = NavType.BoolType
                        defaultValue = false
                    },
                ),
        ) {
            slots.orderEdit?.invoke { navController.popBackStack() }
        }
    }
}

/** The screen of a top-level [destination]: its slot, or the placeholder while the module has none. */
@Composable
private fun DestinationContent(
    destination: AppDestination,
    navController: NavHostController,
    start: AppDestination,
    label: Int?,
    settingsContent: @Composable () -> Unit,
    slots: ShellSlots,
) {
    val title = label ?: R.string.app_name
    val openSell = { navController.openTopLevel(AppDestination.SELL, start) }
    when (destination) {
        AppDestination.SETTINGS -> settingsContent()
        AppDestination.PRODUCTS -> slots.products.orPlaceholder(title) { it() }
        AppDestination.SELL -> slots.sell.orPlaceholder(title) { it { id -> navController.openSale(id) } }
        AppDestination.ORDERS ->
            slots.orders.orPlaceholder(title) {
                it(openSell) { id -> navController.navigate("order_edit/$id") { launchSingleTop = true } }
            }
        AppDestination.KITCHEN -> slots.kitchen.orPlaceholder(title) { it() }
        AppDestination.DELIVERIES ->
            slots.deliveries.orPlaceholder(title) {
                it { id -> navController.navigate("order_edit/$id?$READ_ONLY_ARG=true") { launchSingleTop = true } }
            }
        AppDestination.SALES -> slots.sales.orPlaceholder(title) { it(openSell) { id -> navController.openSale(id) } }
        else -> ModulePlaceholderScreen(title)
    }
}

@Composable
private fun <T> T?.orPlaceholder(
    @StringRes title: Int,
    show: @Composable (T) -> Unit,
) {
    if (this != null) show(this) else ModulePlaceholderScreen(title)
}

/** The screens of the modules that exist; a module without one shows the placeholder. */
private class ShellSlots(
    val products: (@Composable () -> Unit)?,
    val sell: (@Composable (onViewSale: (String) -> Unit) -> Unit)?,
    val orders: (@Composable (onNewOrder: () -> Unit, onEdit: (String) -> Unit) -> Unit)?,
    val orderEdit: (@Composable (onExit: () -> Unit) -> Unit)?,
    val kitchen: (@Composable () -> Unit)? = null,
    val deliveries: (@Composable (onView: (String) -> Unit) -> Unit)? = null,
    val sales: (@Composable (onNewSale: () -> Unit, onOpen: (String) -> Unit) -> Unit)? = null,
    val saleDetail: (@Composable (onExit: () -> Unit) -> Unit)? = null,
)

/** How the user moves around: the drawer's ☰ button, or the ⋮ menu of the roles without a drawer. */
private sealed interface ShellNavigation {
    data class Drawer(
        val onOpenMenu: () -> Unit,
    ) : ShellNavigation

    data class MoreMenu(
        val onOpenSettings: () -> Unit,
        val onSignOut: () -> Unit,
    ) : ShellNavigation
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ShellTopBar(
    @StringRes title: Int,
    badge: SyncBadgeState,
    paymentRequired: Boolean,
    navigation: ShellNavigation,
    onOpenRejections: () -> Unit,
) {
    Column {
        TopAppBar(
            title = { Text(stringResource(title), modifier = Modifier.testTag(SHELL_TITLE_TAG)) },
            navigationIcon = {
                if (navigation is ShellNavigation.Drawer) {
                    IconButton(onClick = navigation.onOpenMenu) {
                        Icon(TozzoIcons.Menu, contentDescription = stringResource(R.string.nav_open_menu))
                    }
                }
            },
            actions = {
                SyncBadge(badge, onOpenRejections)
                if (navigation is ShellNavigation.MoreMenu) {
                    MoreMenu(navigation)
                } else {
                    Spacer(Modifier.width(12.dp))
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background),
        )
        if (paymentRequired) PaymentRequiredBanner()
    }
}

/** ⋮ with "Settings" and "Sign out". */
@Composable
private fun MoreMenu(navigation: ShellNavigation.MoreMenu) {
    var expanded by remember { mutableStateOf(false) }
    IconButton(onClick = { expanded = true }) {
        Icon(TozzoIcons.MoreVertical, contentDescription = stringResource(R.string.nav_more_options))
    }
    DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
        DropdownMenuItem(
            text = { Text(stringResource(R.string.nav_settings)) },
            onClick = {
                expanded = false
                navigation.onOpenSettings()
            },
        )
        DropdownMenuItem(
            text = { Text(stringResource(R.string.action_logout)) },
            onClick = {
                expanded = false
                navigation.onSignOut()
            },
        )
    }
}

private fun NavHostController.openSale(id: String) {
    navigate("sale_detail/$id") { launchSingleTop = true }
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
