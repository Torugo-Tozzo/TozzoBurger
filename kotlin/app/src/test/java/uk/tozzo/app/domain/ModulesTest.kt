package uk.tozzo.app.domain

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import uk.tozzo.app.domain.BusinessModule.DELIVERIES
import uk.tozzo.app.domain.BusinessModule.DEVICES
import uk.tozzo.app.domain.BusinessModule.EMPLOYEES
import uk.tozzo.app.domain.BusinessModule.ESTIMATES
import uk.tozzo.app.domain.BusinessModule.INGREDIENT_INVENTORY
import uk.tozzo.app.domain.BusinessModule.KITCHEN
import uk.tozzo.app.domain.BusinessModule.ORDERS
import uk.tozzo.app.domain.BusinessModule.PRODUCTS
import uk.tozzo.app.domain.BusinessModule.REPORTS
import uk.tozzo.app.domain.BusinessModule.SALES
import uk.tozzo.app.domain.BusinessModule.SCHEDULE
import uk.tozzo.app.domain.BusinessModule.SERVICES
import uk.tozzo.app.domain.BusinessModule.SERVICE_ORDERS
import uk.tozzo.app.domain.BusinessModule.SETTINGS
import uk.tozzo.app.domain.BusinessModule.STORE_INVENTORY
import uk.tozzo.app.domain.BusinessProfile.FOOD
import uk.tozzo.app.domain.BusinessProfile.STORE
import uk.tozzo.app.domain.Role.COOK
import uk.tozzo.app.domain.Role.CUSTOMER
import uk.tozzo.app.domain.Role.DRIVER
import uk.tozzo.app.domain.Role.EMPLOYEE
import uk.tozzo.app.domain.Role.MANAGER
import uk.tozzo.app.domain.Role.OWNER

class ModulesTest {
    private fun establishment(
        profiles: List<BusinessProfile>?,
        visible: List<BusinessModule>? = null,
    ) = EstablishmentModules(category = null, businessProfiles = profiles, visibleModules = visible)

    @Test
    fun `keeps the current restaurant menu for a legacy establishment`() {
        val legacy = EstablishmentModules("HAMBURGUERIA", null, null)
        assertEquals(
            listOf(ORDERS, KITCHEN, DELIVERIES, SALES, PRODUCTS, EMPLOYEES, SCHEDULE, DEVICES, REPORTS, SETTINGS),
            resolveNavigationModules(OWNER, legacy),
        )
    }

    @Test
    fun `suggests both food and service modules for combined profiles`() {
        val combined = suggestedBusinessModules(listOf(FOOD, BusinessProfile.SERVICES))
        assertTrue(KITCHEN in combined)
        assertTrue(SERVICES in combined)
        assertTrue(ESTIMATES in combined)
        assertTrue(SERVICE_ORDERS in suggestedBusinessModules(listOf(BusinessProfile.SERVICES)))
        assertEquals(
            listOf(SALES, PRODUCTS, EMPLOYEES, DEVICES, REPORTS, SETTINGS),
            suggestedBusinessModules(listOf(STORE)),
        )
    }

    @Test
    fun `leaves store and ingredient stock unchecked until the owner selects them`() {
        val suggested = suggestedBusinessModules(listOf(FOOD, STORE))
        assertFalse(INGREDIENT_INVENTORY in suggested)
        assertFalse(STORE_INVENTORY in suggested)
    }

    @Test
    fun `shows only available store and shared modules selected by the owner`() {
        assertEquals(
            listOf(SALES, PRODUCTS, EMPLOYEES, DEVICES, REPORTS, SETTINGS),
            resolveNavigationModules(OWNER, establishment(listOf(STORE), listOf(SALES, SETTINGS))),
        )
    }

    @Test
    fun `adds Services and Estimates for service profiles without granting them to specialist roles`() {
        val services = establishment(listOf(BusinessProfile.SERVICES), listOf(SERVICES, ESTIMATES))
        assertTrue(SERVICES in resolveNavigationModules(OWNER, services))
        assertTrue(ESTIMATES in resolveNavigationModules(MANAGER, services))
        assertTrue(SERVICES in resolveNavigationModules(EMPLOYEE, services))
        assertFalse(canAccessModule(COOK, SERVICES))
        assertFalse(canAccessModule(DRIVER, ESTIMATES))
    }

    @Test
    fun `does not show food modules left in saved preferences after food is disabled`() {
        assertEquals(
            listOf(SALES, PRODUCTS, EMPLOYEES, SCHEDULE, DEVICES, REPORTS, SETTINGS),
            resolveNavigationModules(
                OWNER,
                establishment(listOf(STORE), listOf(ORDERS, KITCHEN, DELIVERIES, SALES, SCHEDULE)),
            ),
        )
    }

    @Test
    fun `keeps all standard modules when a member hides the food modules`() {
        assertEquals(
            listOf(SALES, PRODUCTS, EMPLOYEES, DEVICES, REPORTS, SETTINGS),
            resolveNavigationModules(MANAGER, establishment(listOf(FOOD), listOf(SALES, SETTINGS))),
        )
    }

    @Test
    fun `keeps specialised roles restricted to their operational screen`() {
        val store = establishment(listOf(STORE), listOf(SALES, SETTINGS))
        assertEquals(emptyList<BusinessModule>(), resolveNavigationModules(COOK, store))
        assertEquals(emptyList<BusinessModule>(), resolveNavigationModules(DRIVER, store))
        assertEquals(listOf(KITCHEN), resolveNavigationModules(COOK, establishment(listOf(FOOD))))
        assertEquals(listOf(DELIVERIES), resolveNavigationModules(DRIVER, establishment(listOf(FOOD))))
    }

    @Test
    fun `keeps direct access role protected even when a module is visible to the establishment`() {
        assertFalse(canAccessModule(COOK, SERVICE_ORDERS))
        assertFalse(canAccessModule(DRIVER, SERVICE_ORDERS))
        assertTrue(canAccessModule(EMPLOYEE, SERVICE_ORDERS))
        assertFalse(canAccessModule(COOK, ORDERS))
        assertTrue(canAccessModule(COOK, KITCHEN))
        assertFalse(canAccessModule(DRIVER, KITCHEN))
        assertTrue(canAccessModule(DRIVER, DELIVERIES))
        assertFalse(canAccessModule(EMPLOYEE, REPORTS))
        assertTrue(canAccessModule(OWNER, REPORTS))
        assertFalse(canAccessModule(CUSTOMER, ORDERS))
        assertFalse(canAccessModule(Role.parse("UNKNOWN"), SALES))
    }

    @Test
    fun `allows execution independently of catalog visibility and respects owner opt-out`() {
        val profiles = listOf(BusinessProfile.SERVICES)
        assertTrue(
            SERVICE_ORDERS in
                resolveNavigationModules(OWNER, establishment(profiles, listOf(ESTIMATES, SERVICE_ORDERS))),
        )
        assertFalse(
            SERVICE_ORDERS in resolveNavigationModules(OWNER, establishment(profiles, listOf(ESTIMATES))),
        )
    }

    @Test
    fun `navigation of a full food profile is grouped and ordered`() {
        val modules = resolveNavigationModules(OWNER, EstablishmentModules("HAMBURGUERIA", null, null))
        val items = navigationItems(modules)
        assertEquals(
            listOf(
                AppDestination.SELL,
                AppDestination.ORDERS,
                AppDestination.KITCHEN,
                AppDestination.DELIVERIES,
                AppDestination.SALES,
            ),
            items.take(5).map { it.destination },
        )
        assertTrue(items.take(5).all { it.group == NavGroup.OPERATION })
        assertEquals(AppDestination.SETTINGS, items.last().destination)
        assertEquals(NavGroup.FOOTER, items.last().group)
    }

    @Test
    fun `start destination is sell for food and service orders for pure services`() {
        val food = resolveNavigationModules(OWNER, establishment(listOf(FOOD)))
        assertEquals(AppDestination.SELL, startDestination(food))
        val services = resolveNavigationModules(OWNER, establishment(listOf(BusinessProfile.SERVICES)))
        assertEquals(AppDestination.SERVICE_ORDERS, startDestination(services))
        assertNull(startDestination(emptyList()))
    }

    @Test
    fun `web setup is needed only by owners without a business profile`() {
        val empty = EstablishmentModules(null, emptyList(), null)
        assertTrue(needsWebSetup(OWNER, empty))
        assertFalse(needsWebSetup(MANAGER, empty))
        assertTrue(needsWebSetup(OWNER, EstablishmentModules(null, null, null)))
        assertFalse(needsWebSetup(OWNER, EstablishmentModules("HAMBURGUERIA", null, null)))
        assertFalse(needsWebSetup(OWNER, establishment(listOf(FOOD))))
    }

    @Test
    fun `unknown role string parses to null`() {
        assertNull(Role.parse("x"))
        assertNull(Role.parse(null))
        assertEquals(OWNER, Role.parse("OWNER"))
    }
}
