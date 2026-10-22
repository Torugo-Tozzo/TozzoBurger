package uk.tozzo.app.core.data

import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import uk.tozzo.app.testing.RobolectricSql
import uk.tozzo.app.testing.seedItem
import uk.tozzo.app.testing.seedOrder
import uk.tozzo.app.testing.seedProduct
import uk.tozzo.app.testing.seedUser

@RunWith(RobolectricTestRunner::class)
class DeliveryRepositoryTest {
    private lateinit var sql: RobolectricSql
    private lateinit var repository: DeliveryRepository

    @Before
    fun setUp() {
        sql = RobolectricSql()
        repository = DeliveryRepository(sql)
    }

    @After
    fun tearDown() = sql.close()

    @Test
    fun boardHoldsOnlyOpenDeliveryOrders() =
        runTest {
            sql.seedProduct("p1", "X-Burger", "12.50")
            sql.seedOrder("d1", isDelivery = 1, address = "Rua A")
            sql.seedOrder("table", isDelivery = 0)
            sql.seedOrder("closed", isDelivery = 1, isOpen = 0)
            sql.seedOrder("gone", isDelivery = 1, deletedAt = "2026-10-20 13:00:00.000")
            sql.seedItem("i1", "d1", "p1", 2)

            val board = repository.board().first()

            val all = board.values.flatten()
            assertEquals(listOf("d1"), all.map { it.id })
            assertEquals(
                2,
                all
                    .single()
                    .items
                    .single()
                    .quantity,
            )
        }

    @Test
    fun boardSplitsByDeliveryStartedAtOldestFirst() =
        runTest {
            sql.seedOrder("late", isDelivery = 1, openedAt = "2026-10-20 12:30:00.000")
            sql.seedOrder("early", isDelivery = 1, openedAt = "2026-10-20 12:00:00.000")
            sql.seedOrder(
                "out",
                isDelivery = 1,
                openedAt = "2026-10-20 12:10:00.000",
                deliveryStartedAt = "2026-10-20 12:40:00.000",
            )
            sql.seedOrder("blank", isDelivery = 1, openedAt = "2026-10-20 12:20:00.000", deliveryStartedAt = "")

            val board = repository.board().first()

            assertEquals(listOf("early", "blank", "late"), board[DeliveryStage.WAITING]?.map { it.id })
            assertEquals(listOf("out"), board[DeliveryStage.DELIVERING]?.map { it.id })
        }

    @Test
    fun boardShowsTheInternalDriverName() =
        runTest {
            sql.seedUser("d1", "Beto", role = "DRIVER")
            sql.seedOrder("o1", isDelivery = 1, driverId = "d1")
            sql.seedOrder("o2", isDelivery = 1, externalDriverName = "Joao iFood", externalDriverPhone = "999")

            val orders =
                repository
                    .board()
                    .first()[DeliveryStage.WAITING]
                    .orEmpty()
                    .associateBy { it.id }

            assertEquals("Beto", orders.getValue("o1").driverName)
            assertEquals("Joao iFood", orders.getValue("o2").externalDriverName)
        }

    @Test
    fun aDriverWithAnOrderOutForDeliveryIsUnavailable() =
        runTest {
            sql.seedUser("d1", "Beto", role = "DRIVER")
            sql.seedUser("d2", "Ana", role = "DRIVER")
            sql.seedUser("d3", "Caio", role = "DRIVER")
            sql.seedUser("m1", "Gerente", role = "MANAGER")
            sql.seedOrder("out", isDelivery = 1, driverId = "d1", deliveryStartedAt = "2026-10-20 12:40:00.000")
            sql.seedOrder("waiting", isDelivery = 1, driverId = "d2")
            sql.seedOrder(
                "done",
                isDelivery = 1,
                isOpen = 0,
                driverId = "d3",
                deliveryStartedAt = "2026-10-20 12:40:00.000",
            )

            val drivers = repository.drivers().first()

            assertEquals(listOf("Ana", "Beto", "Caio"), drivers.map { it.name })
            assertTrue(drivers.first { it.id == "d2" }.available)
            assertFalse(drivers.first { it.id == "d1" }.available)
            assertTrue(drivers.first { it.id == "d3" }.available)
        }
}
