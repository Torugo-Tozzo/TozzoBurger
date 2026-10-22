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
import uk.tozzo.app.domain.PaymentMethod
import uk.tozzo.app.testing.RobolectricSql
import uk.tozzo.app.testing.seedProduct
import uk.tozzo.app.testing.seedSale
import uk.tozzo.app.testing.seedSaleItem
import uk.tozzo.app.testing.seedUser
import java.time.Instant

@RunWith(RobolectricTestRunner::class)
class SaleRepositoryTest {
    private lateinit var sql: RobolectricSql
    private lateinit var repo: SaleRepository

    private val from = Instant.parse("2026-10-20T00:00:00Z")

    @Before
    fun setUp() =
        runTest {
            sql = RobolectricSql()
            repo = SaleRepository(sql)
            sql.seedUser("u1", "Ana")
            sql.seedUser("u2", "Bruno")
            sql.seedProduct("p1", "X-Burger", "12.50")
        }

    @After
    fun tearDown() = sql.close()

    private suspend fun ids(
        filter: SaleFilter = SaleFilter(from),
        limit: Int = 50,
    ) = repo.sales(filter, limit).first().map { it.id }

    @Test
    fun cancelledSalesDoNotAppearNorCount() =
        runTest {
            sql.seedSale("ok", total = "10.00")
            sql.seedSale("gone", total = "99.00", cancelled = 1)

            assertEquals(listOf("ok"), ids())
            assertEquals(SalesSummary(1, 1000L), repo.summary(SaleFilter(from)).first())
        }

    @Test
    fun theWindowComparesInstantsNotLocalDates() =
        runTest {
            // 23:30 UTC on the 19th is already the 20th in UTC-3 (the user's day): only the instant tells.
            sql.seedSale("before", soldAt = "2026-10-19 23:30:00.000")
            sql.seedSale("late", soldAt = "2026-10-20 23:30:00.000")
            sql.seedSale("iso", soldAt = "2026-10-20T10:00:00Z")
            sql.seedSale("after", soldAt = "2026-10-21 00:00:00.001")

            val window =
                SaleFilter(from = Instant.parse("2026-10-20T02:30:00Z"), to = Instant.parse("2026-10-21T00:00:00Z"))

            assertEquals(listOf("late", "iso"), ids(window))
            assertEquals(2, repo.summary(window).first().count)
            // An open end keeps the newest sales.
            assertEquals(listOf("after", "late", "iso"), ids(SaleFilter(window.from)))
        }

    @Test
    fun summaryCountsEverySaleNotOnlyTheLimit() =
        runTest {
            sql.seedSale("a", soldAt = "2026-10-20 10:00:00.000", total = "10.10")
            sql.seedSale("b", soldAt = "2026-10-20 11:00:00.000", total = "20.20")
            sql.seedSale("c", soldAt = "2026-10-20 12:00:00.000", total = "0.30")

            assertEquals(listOf("c", "b"), ids(limit = 2))
            assertEquals(SalesSummary(3, 3060L), repo.summary(SaleFilter(from)).first())
        }

    @Test
    fun linesUseThePriceOfTheSaleEvenIfTheProductCostsMoreToday() =
        runTest {
            sql.seedSale("s", total = "25.00")
            sql.seedSaleItem("i1", "s", "p1", 2, "10.00")
            sql.seedSaleItem("i2", "s", "gone", 1, "5.00")

            val sale = repo.sale("s").first()!!

            assertEquals(
                listOf(SaleLineView("X-Burger", 2, 1000L), SaleLineView(null, 1, 500L)),
                sale.lines,
            )
            assertEquals(2500L, sale.totalCents)
            assertEquals(
                sale.lines,
                repo
                    .sales(SaleFilter(from), 50)
                    .first()
                    .single()
                    .lines,
            )
        }

    @Test
    fun aSaleWithoutLinesIsStillListed() =
        runTest {
            sql.seedSale("s", payment = "PIX", customer = "Mesa 2")

            val sale = repo.sales(SaleFilter(from), 50).first().single()

            assertEquals(emptyList<SaleLineView>(), sale.lines)
            assertEquals(PaymentMethod.PIX, sale.payment)
            assertEquals("Mesa 2", sale.customerName)
            assertEquals("Ana", sale.sellerName)
            assertNull(repo.sale("missing").first())
        }

    @Test
    fun customerSellerAndAmountFilters() =
        runTest {
            sql.seedSale("a", customer = "Mesa 10", sellerId = "u1", total = "10.00")
            sql.seedSale("b", customer = "Joao", sellerId = "u2", total = "30.00")
            sql.seedSale("c", customer = "100% fan_", sellerId = "u2", total = "50.00")

            assertEquals(listOf("a"), ids(SaleFilter(from, customer = " mesa ")))
            assertEquals(setOf("b", "c"), ids(SaleFilter(from, seller = "bru")).toSet())
            assertEquals(setOf("b"), ids(SaleFilter(from, minCents = 2000, maxCents = 4000)).toSet())
            assertEquals(setOf("c"), ids(SaleFilter(from, minCents = 5000)).toSet())
            assertEquals(listOf("c"), ids(SaleFilter(from, customer = "100%")))
            assertEquals(listOf("c"), ids(SaleFilter(from, customer = "n_")))
            assertEquals(SalesSummary(2, 8000L), repo.summary(SaleFilter(from, seller = "Bruno")).first())
        }

    @Test
    fun serverFormatSalesSortByInstantAgainstLocalFormatSales() =
        runTest {
            sql.seedSale("a-old-server", soldAt = "2026-10-20T10:00:00.000000")
            sql.seedSale("b-new-local", soldAt = "2026-10-20 12:00:00.000")
            sql.seedSale("c-newest-server", soldAt = "2026-10-20T13:00:00.000000")

            assertEquals(listOf("c-newest-server", "b-new-local", "a-old-server"), ids())
            assertEquals(listOf("c-newest-server", "b-new-local"), ids(limit = 2))
        }
}
