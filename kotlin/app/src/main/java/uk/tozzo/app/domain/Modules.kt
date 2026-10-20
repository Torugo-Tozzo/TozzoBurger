package uk.tozzo.app.domain

import androidx.annotation.StringRes
import uk.tozzo.app.R

enum class Role {
    OWNER,
    MANAGER,
    EMPLOYEE,
    COOK,
    DRIVER,
    CUSTOMER,
    ;

    companion object {
        fun parse(raw: String?): Role? = entries.firstOrNull { it.name == raw }
    }
}

enum class BusinessProfile { FOOD, STORE, SERVICES }

enum class BusinessModule {
    ORDERS,
    KITCHEN,
    DELIVERIES,
    INGREDIENT_INVENTORY,
    SALES,
    PRODUCTS,
    STORE_INVENTORY,
    SERVICES,
    ESTIMATES,
    SERVICE_ORDERS,
    EMPLOYEES,
    SCHEDULE,
    DEVICES,
    REPORTS,
    SETTINGS,
}

data class EstablishmentModules(
    val category: String?,
    val businessProfiles: List<BusinessProfile>?,
    val visibleModules: List<BusinessModule>?,
)

private val navigationModules =
    BusinessModule.entries -
        setOf(BusinessModule.INGREDIENT_INVENTORY, BusinessModule.STORE_INVENTORY)

private val legacyNavigationModules =
    navigationModules -
        setOf(BusinessModule.SERVICES, BusinessModule.ESTIMATES, BusinessModule.SERVICE_ORDERS)

private val requiredModules =
    setOf(
        BusinessModule.SALES,
        BusinessModule.PRODUCTS,
        BusinessModule.EMPLOYEES,
        BusinessModule.DEVICES,
        BusinessModule.REPORTS,
        BusinessModule.SETTINGS,
    )

private val profileModules =
    mapOf(
        BusinessProfile.FOOD to
            listOf(
                BusinessModule.ORDERS,
                BusinessModule.KITCHEN,
                BusinessModule.DELIVERIES,
                BusinessModule.INGREDIENT_INVENTORY,
            ),
        BusinessProfile.STORE to listOf(BusinessModule.STORE_INVENTORY),
        BusinessProfile.SERVICES to
            listOf(
                BusinessModule.SERVICES,
                BusinessModule.ESTIMATES,
                BusinessModule.SERVICE_ORDERS,
            ),
    )

private val optInModules = setOf(BusinessModule.INGREDIENT_INVENTORY, BusinessModule.STORE_INVENTORY)

fun canAccessModule(
    role: Role?,
    module: BusinessModule,
): Boolean =
    when (role) {
        Role.COOK -> module == BusinessModule.KITCHEN
        Role.DRIVER -> module == BusinessModule.DELIVERIES
        Role.OWNER, Role.MANAGER, Role.EMPLOYEE ->
            when (module) {
                BusinessModule.DEVICES -> role == Role.OWNER || role == Role.MANAGER
                BusinessModule.REPORTS -> role != Role.EMPLOYEE
                else -> true
            }
        else -> false
    }

private fun modulesForProfiles(
    profiles: List<BusinessProfile>,
    modules: List<BusinessModule>,
): List<BusinessModule> {
    val allowed = requiredModules + BusinessModule.SCHEDULE + profiles.flatMap { profileModules.getValue(it) }
    val selected = requiredModules + modules
    return BusinessModule.entries.filter { it in allowed && it in selected }
}

fun suggestedBusinessModules(profiles: List<BusinessProfile>): List<BusinessModule> {
    val selected = requiredModules.toMutableSet()
    profiles.flatMap { profileModules.getValue(it) }.filterNot { it in optInModules }.let(selected::addAll)
    if (BusinessProfile.FOOD in profiles) selected += BusinessModule.SCHEDULE
    return BusinessModule.entries.filter { it in selected }
}

fun resolveNavigationModules(
    role: Role?,
    establishment: EstablishmentModules?,
): List<BusinessModule> {
    val profiles = establishment?.businessProfiles
    if (role == Role.COOK || role == Role.DRIVER) {
        val foodDisabled = profiles != null && BusinessProfile.FOOD !in profiles
        val own = if (role == Role.COOK) BusinessModule.KITCHEN else BusinessModule.DELIVERIES
        return if (foodDisabled) emptyList() else listOf(own)
    }
    val selected: Set<BusinessModule> =
        if (profiles == null) {
            legacyNavigationModules.toSet()
        } else {
            val visible = establishment.visibleModules?.takeIf { it.isNotEmpty() } ?: suggestedBusinessModules(profiles)
            modulesForProfiles(profiles, visible).toSet()
        } + requiredModules
    return navigationModules.filter { it in selected && canAccessModule(role, it) }
}

enum class AppDestination {
    SELL,
    ORDERS,
    KITCHEN,
    DELIVERIES,
    SALES,
    SERVICE_ORDERS,
    ESTIMATES,
    PRODUCTS,
    SERVICES,
    SCHEDULE,
    REPORTS,
    EMPLOYEES,
    DEVICES,
    SETTINGS,
}

enum class NavGroup { OPERATION, CATALOG, MANAGEMENT, FOOTER }

data class NavItem(
    val destination: AppDestination,
    val group: NavGroup,
    @param:StringRes val label: Int,
)

private data class NavEntry(
    val module: BusinessModule,
    val destination: AppDestination,
    val group: NavGroup,
    @StringRes val label: Int,
)

private val navEntries =
    listOf(
        NavEntry(BusinessModule.SALES, AppDestination.SELL, NavGroup.OPERATION, R.string.nav_sell),
        NavEntry(BusinessModule.ORDERS, AppDestination.ORDERS, NavGroup.OPERATION, R.string.nav_orders),
        NavEntry(BusinessModule.KITCHEN, AppDestination.KITCHEN, NavGroup.OPERATION, R.string.nav_kitchen),
        NavEntry(BusinessModule.DELIVERIES, AppDestination.DELIVERIES, NavGroup.OPERATION, R.string.nav_deliveries),
        NavEntry(BusinessModule.SALES, AppDestination.SALES, NavGroup.OPERATION, R.string.nav_sales),
        NavEntry(
            BusinessModule.SERVICE_ORDERS,
            AppDestination.SERVICE_ORDERS,
            NavGroup.OPERATION,
            R.string.nav_service_orders,
        ),
        NavEntry(BusinessModule.ESTIMATES, AppDestination.ESTIMATES, NavGroup.OPERATION, R.string.nav_estimates),
        NavEntry(BusinessModule.PRODUCTS, AppDestination.PRODUCTS, NavGroup.CATALOG, R.string.nav_products),
        NavEntry(BusinessModule.SERVICES, AppDestination.SERVICES, NavGroup.CATALOG, R.string.nav_services),
        NavEntry(BusinessModule.SCHEDULE, AppDestination.SCHEDULE, NavGroup.CATALOG, R.string.nav_schedule),
        NavEntry(BusinessModule.REPORTS, AppDestination.REPORTS, NavGroup.MANAGEMENT, R.string.nav_reports),
        NavEntry(BusinessModule.EMPLOYEES, AppDestination.EMPLOYEES, NavGroup.MANAGEMENT, R.string.nav_employees),
        NavEntry(BusinessModule.DEVICES, AppDestination.DEVICES, NavGroup.MANAGEMENT, R.string.nav_devices),
        NavEntry(BusinessModule.SETTINGS, AppDestination.SETTINGS, NavGroup.FOOTER, R.string.nav_settings),
    )

fun navigationItems(modules: List<BusinessModule>): List<NavItem> =
    navEntries.filter { it.module in modules }.map { NavItem(it.destination, it.group, it.label) }

private val foodModules = setOf(BusinessModule.ORDERS, BusinessModule.KITCHEN, BusinessModule.DELIVERIES)

/**
 * Only the module list is known here, so "FOOD profile or legacy" is read as "has a food module".
 * Non-food profiles skip SELL and SALES (always present) and land on their first specific operation screen.
 */
fun startDestination(modules: List<BusinessModule>): AppDestination? {
    val items = navigationItems(modules)
    val hasFood = modules.any { it in foodModules }
    return when {
        items.isEmpty() -> null
        hasFood && BusinessModule.SALES in modules -> AppDestination.SELL
        else ->
            (
                items.firstOrNull {
                    it.group == NavGroup.OPERATION &&
                        it.destination != AppDestination.SELL &&
                        it.destination != AppDestination.SALES
                } ?: items.firstOrNull { it.group == NavGroup.OPERATION } ?: items.first()
            ).destination
    }
}

fun needsWebSetup(
    role: Role?,
    establishment: EstablishmentModules?,
): Boolean {
    if (role != Role.OWNER) return false
    val profiles = establishment?.businessProfiles
    return if (profiles == null) establishment?.category == null else profiles.isEmpty()
}
