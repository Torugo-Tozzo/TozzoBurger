package uk.tozzo.app.feature.shell

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DrawerState
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.NavigationDrawerItemDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import uk.tozzo.app.R
import uk.tozzo.app.core.session.Binding
import uk.tozzo.app.domain.AppDestination
import uk.tozzo.app.domain.NavGroup
import uk.tozzo.app.domain.NavItem
import uk.tozzo.app.domain.Role

internal const val DRAWER_TAG = "drawer"
internal const val DRAWER_ITEM_TAG = "drawer_item"

/** Drawer content: header, the [items] grouped in their order, and the footer group pinned at the bottom. */
@Composable
fun AppDrawer(
    drawerState: DrawerState,
    binding: Binding,
    items: List<NavItem>,
    selected: AppDestination?,
    onSelect: (AppDestination) -> Unit,
) {
    ModalDrawerSheet(
        drawerState = drawerState,
        modifier = Modifier.testTag(DRAWER_TAG),
        drawerShape = MaterialTheme.shapes.medium,
        drawerContainerColor = MaterialTheme.colorScheme.background,
    ) {
        Column(Modifier.padding(16.dp)) {
            Text(stringResource(R.string.app_name), style = MaterialTheme.typography.titleLarge)
            Text(binding.establishmentName, style = MaterialTheme.typography.bodyMedium)
            Text(
                stringResource(binding.role.label()),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        HorizontalDivider()
        Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 12.dp)) {
            items
                .filter { it.group != NavGroup.FOOTER }
                .groupBy { it.group }
                .forEach { (group, groupItems) ->
                    group.title()?.let { title ->
                        Text(
                            stringResource(title),
                            modifier = Modifier.padding(start = 16.dp, top = 16.dp, bottom = 4.dp),
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    groupItems.forEach { DrawerItem(it, it.destination == selected, onSelect) }
                }
        }
        val footer = items.filter { it.group == NavGroup.FOOTER }
        if (footer.isNotEmpty()) {
            HorizontalDivider()
            Column(Modifier.padding(12.dp)) {
                footer.forEach { DrawerItem(it, it.destination == selected, onSelect) }
            }
        }
    }
}

/** Selected item in inverted colors, as on the web: foreground background, background text. */
@Composable
private fun DrawerItem(
    item: NavItem,
    selected: Boolean,
    onSelect: (AppDestination) -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    NavigationDrawerItem(
        label = { Text(stringResource(item.label)) },
        selected = selected,
        onClick = { onSelect(item.destination) },
        modifier = Modifier.testTag(DRAWER_ITEM_TAG),
        shape = MaterialTheme.shapes.medium,
        colors =
            NavigationDrawerItemDefaults.colors(
                selectedContainerColor = scheme.onBackground,
                selectedTextColor = scheme.background,
                unselectedContainerColor = scheme.background,
                unselectedTextColor = scheme.onBackground,
            ),
    )
}

@StringRes
private fun NavGroup.title(): Int? =
    when (this) {
        NavGroup.OPERATION -> R.string.nav_group_operation
        NavGroup.CATALOG -> R.string.nav_group_catalog
        NavGroup.MANAGEMENT -> R.string.nav_group_management
        NavGroup.FOOTER -> null
    }

@StringRes
private fun Role.label(): Int =
    when (this) {
        Role.OWNER -> R.string.role_owner
        Role.MANAGER -> R.string.role_manager
        Role.EMPLOYEE -> R.string.role_employee
        Role.COOK -> R.string.role_cook
        Role.DRIVER -> R.string.role_driver
        Role.CUSTOMER -> R.string.role_customer
    }
