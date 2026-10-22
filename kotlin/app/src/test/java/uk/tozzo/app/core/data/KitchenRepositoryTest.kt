package uk.tozzo.app.core.data

import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import uk.tozzo.app.domain.KitchenStage
import uk.tozzo.app.testing.RobolectricSql
import uk.tozzo.app.testing.seedItem
import uk.tozzo.app.testing.seedOrder
import uk.tozzo.app.testing.seedProduct
import java.time.Instant

@RunWith(RobolectricTestRunner::class)
class KitchenRepositoryTest {
    private lateinit var sql: RobolectricSql
    private lateinit var repo: KitchenRepository

    @Before
    fun setUp() =
        runTest {
            sql = RobolectricSql()
            repo = KitchenRepository(sql)
            sql.seedProduct("p1", "X-Burger", "12.50")
            sql.seedProduct("p2", "Coke", "6.00")
        }

    @After
    fun tearDown() = sql.close()

    private suspend fun board() = repo.board().first()

    @Test
    fun sameProductAndStageInAnOrderMergeIntoOneCard() =
        runTest {
            sql.seedOrder("o1", customer = "Mesa 1")
            sql.seedItem("i1", "o1", "p1", 2)
            sql.seedItem("i2", "o1", "p1", 3)
            sql.seedItem("i3", "o1", "p2", 1)
            sql.seedOrder("o2", customer = null, openedAt = "2026-10-20 12:30:00.000")
            sql.seedItem("i4", "o2", "p1", 1)

            val cards = board().getValue(KitchenStage.IN_PREPARATION)

            assertEquals(listOf("o1", "o1", "o2"), cards.map { it.orderId })
            assertEquals(5, cards[0].quantity)
            assertEquals(listOf("i1", "i2"), cards[0].itemIds)
            assertEquals("X-Burger", cards[0].productName)
            assertEquals("Mesa 1", cards[0].customerName)
            assertEquals(listOf("i3"), cards[1].itemIds)
            assertNull(cards[2].customerName)
            assertEquals(Instant.parse("2026-10-20T12:30:00Z"), cards[2].openedAt)
            assertEquals(emptyList<KitchenCard>(), board().getValue(KitchenStage.READY))
        }

    @Test
    fun requestedCountsAsInPreparationAndKitchenReadyAtAsReady() =
        runTest {
            sql.seedOrder("o1")
            sql.seedItem("i1", "o1", "p1", 1, status = "REQUESTED")
            sql.seedItem("i2", "o1", "p1", 1, kitchenReadyAt = "2026-10-20 12:10:00.000")
            sql.seedItem("i3", "o1", "p2", 1, status = "READY")

            val board = board()

            assertEquals(listOf("i1"), board.getValue(KitchenStage.IN_PREPARATION).flatMap { it.itemIds })
            assertEquals(
                listOf("i2", "i3"),
                board.getValue(KitchenStage.READY).flatMap { it.itemIds },
            )
        }

    @Test
    fun deliveringClosedAndDeletedOrdersAndDeliveredItemsAreLeftOut() =
        runTest {
            sql.seedOrder("deliv", isDelivery = 1, address = "Rua", deliveryStartedAt = "2026-10-20 13:00:00.000")
            sql.seedOrder("closed", isOpen = 0)
            sql.seedOrder("deleted", deletedAt = "2026-10-20 13:00:00.000")
            sql.seedOrder("ok")
            listOf("deliv", "closed", "deleted", "ok").forEachIndexed { n, id -> sql.seedItem("a$n", id, "p1", 1) }
            sql.seedItem("done", "ok", "p2", 1, status = "DELIVERED")
            sql.seedItem("gone", "ok", "p2", 1, deletedAt = "2026-10-20 13:00:00.000")

            val all = board().values.flatten()

            assertEquals(listOf("a3"), all.flatMap { it.itemIds })
        }

    @Test
    fun ordersAreOldestFirst() =
        runTest {
            sql.seedOrder("late", openedAt = "2026-10-20 14:00:00.000")
            sql.seedOrder("early", openedAt = "2026-10-20 11:00:00.000")
            sql.seedItem("a", "late", "p1", 1)
            sql.seedItem("b", "early", "p1", 1)

            assertEquals(listOf("early", "late"), board().getValue(KitchenStage.IN_PREPARATION).map { it.orderId })
        }

    @Test
    fun anItemWithoutItsProductHasNoName() =
        runTest {
            sql.seedOrder("o1")
            sql.seedItem("a", "o1", "gone", 1)

            assertNull(board().getValue(KitchenStage.IN_PREPARATION).single().productName)
        }

    @Test
    fun serverFormatRowsSortByInstantAgainstLocalFormatRows() =
        runTest {
            // The server row is older (10:00) but 'T' sorts after ' ' as text; the ids would also put "a" first.
            sql.seedOrder("b-server", openedAt = "2026-10-20T10:00:00.000000")
            sql.seedOrder("a-local", openedAt = "2026-10-20 12:00:00.000")
            sql.seedItem("i1", "b-server", "p1", 1)
            sql.seedItem("i2", "a-local", "p1", 1)

            val cards = board().getValue(KitchenStage.IN_PREPARATION)

            assertEquals(listOf("b-server", "a-local"), cards.map { it.orderId })
            assertEquals(Instant.parse("2026-10-20T10:00:00Z"), cards[0].openedAt)
        }
}
