package uk.tozzo.app.core.data

import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import uk.tozzo.app.domain.ItemStatus
import uk.tozzo.app.testing.RobolectricSql
import uk.tozzo.app.testing.seedItem
import uk.tozzo.app.testing.seedOrder
import uk.tozzo.app.testing.seedProduct
import uk.tozzo.app.testing.seedUser
import java.time.Instant

@RunWith(RobolectricTestRunner::class)
class OrderRepositoryTest {
    private lateinit var sql: RobolectricSql
    private lateinit var repo: OrderRepository

    @Before
    fun setUp() =
        runTest {
            sql = RobolectricSql()
            repo = OrderRepository(sql)
            sql.seedUser("u1", "Ana")
            sql.seedUser("u2", "Bruno")
            sql.seedProduct("p1", "X-Burger", "12.50")
            sql.seedProduct("p2", "Coke", "6.00")
        }

    @After
    fun tearDown() = sql.close()

    private suspend fun ids(filter: OrderFilter = OrderFilter()) = repo.openOrders(filter).first().map { it.id }

    @Test
    fun closedAndDeletedOrdersDoNotAppear() =
        runTest {
            sql.seedOrder("open")
            sql.seedOrder("closed", isOpen = 0)
            sql.seedOrder("deleted", deletedAt = "2026-10-20 13:00:00.000")

            assertEquals(listOf("open"), ids())
            assertNull(repo.order("closed").first())
            assertNull(repo.order("deleted").first())
            assertNull(repo.order("missing").first())
        }

    @Test
    fun newestUpdatedFirstAndDeletedItemsAreLeftOut() =
        runTest {
            sql.seedOrder("old", updatedAt = "2026-10-20 12:00:00.000")
            sql.seedOrder("new", updatedAt = "2026-10-20 14:00:00.000")
            sql.seedItem("i1", "new", "p1", 2, "12.50")
            sql.seedItem("i2", "new", "p2", 1, "6.00", deletedAt = "2026-10-20 14:00:00.000")

            val orders = repo.openOrders(OrderFilter()).first()

            assertEquals(listOf("new", "old"), orders.map { it.id })
            assertEquals(listOf("i1"), orders[0].items.map { it.id })
            assertEquals(2500L, orders[0].totalCents)
            assertEquals(Instant.parse("2026-10-20T14:00:00Z"), orders[0].updatedAt)
            assertEquals("Ana", orders[0].sellerName)
            assertEquals(ItemStatus.IN_PREPARATION, orders[0].items[0].status)
            assertEquals("X-Burger", orders[0].items[0].productName)
        }

    @Test
    fun anItemWithoutAPriceTakesTheProductPriceOrCountsZero() =
        runTest {
            sql.seedOrder("o1")
            sql.seedItem("i1", "o1", "p1", 2, unitPrice = null)
            sql.seedItem("i2", "o1", "gone", 3, unitPrice = "abc")

            val order = repo.order("o1").first()!!

            assertEquals(listOf(1250L, 0L), order.items.sortedBy { it.id }.map { it.unitPriceCents })
            assertEquals(2500L, order.totalCents)
        }

    @Test
    fun filtersByCustomerSellerAndTotal() =
        runTest {
            sql.seedOrder("a", customer = "Mesa 10", sellerId = "u1")
            sql.seedItem("ia", "a", "p1", 1, "10.00")
            sql.seedOrder("b", customer = "João", sellerId = "u2")
            sql.seedItem("ib", "b", "p1", 3, "10.00")
            sql.seedOrder("c", customer = null, sellerId = "u2")

            assertEquals(setOf("a"), ids(OrderFilter(customer = "mesa")).toSet())
            assertEquals(setOf("b"), ids(OrderFilter(customer = "joao")).toSet())
            assertEquals(setOf("b", "c"), ids(OrderFilter(seller = "BRUN")).toSet())
            assertEquals(setOf("b"), ids(OrderFilter(minCents = 2000)).toSet())
            assertEquals(setOf("a", "c"), ids(OrderFilter(maxCents = 1000)).toSet())
            assertEquals(setOf("a"), ids(OrderFilter(minCents = 1000, maxCents = 1000)).toSet())
        }

    @Test
    fun deliveringComesFromDeliveryStartedAt() =
        runTest {
            sql.seedOrder("d1", isDelivery = 1, address = "Rua A", deliveryStartedAt = "2026-10-20 13:00:00.000")
            sql.seedOrder("d2", isDelivery = 1, address = "Rua B")

            val byId = repo.openOrders(OrderFilter()).first().associateBy { it.id }

            assertTrue(byId.getValue("d1").delivering)
            assertFalse(byId.getValue("d2").delivering)
            assertEquals("Rua A", byId.getValue("d1").deliveryAddress)
            assertTrue(byId.getValue("d1").isDelivery)
        }

    @Test
    fun serverFormatRowsSortByInstantAgainstLocalFormatRows() =
        runTest {
            sql.seedOrder("a-old-server", updatedAt = "2026-10-20T10:00:00.000000")
            sql.seedOrder("b-new-local", updatedAt = "2026-10-20 12:00:00.000")
            sql.seedOrder("c-newest-server", updatedAt = "2026-10-20T13:00:00.000000")

            assertEquals(listOf("c-newest-server", "b-new-local", "a-old-server"), ids())
        }
}
