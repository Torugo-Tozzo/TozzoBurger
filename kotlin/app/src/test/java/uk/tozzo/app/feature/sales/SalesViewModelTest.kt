package uk.tozzo.app.feature.sales

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import uk.tozzo.app.core.data.SaleRepository
import uk.tozzo.app.testing.RobolectricSql
import uk.tozzo.app.testing.seedSale
import uk.tozzo.app.testing.seedUser
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.TimeZone

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
class SalesViewModelTest {
    private lateinit var sql: RobolectricSql
    private lateinit var viewModel: SalesViewModel

    private val clock = Clock.fixed(Instant.parse("2026-10-20T15:00:00Z"), ZoneOffset.UTC)

    @Before
    fun setUp() =
        runBlocking {
            TimeZone.setDefault(TimeZone.getTimeZone("UTC"))
            Dispatchers.setMain(UnconfinedTestDispatcher())
            sql = RobolectricSql()
            sql.seedUser("u1", "Ana")
            repeat(120) {
                sql.seedSale(
                    "s%03d".format(it),
                    soldAt =
                        "2026-10-20 %02d:%02d:00.000".format(
                            it / 60 + 8,
                            it % 60,
                        ),
                )
            }
            viewModel = SalesViewModel(SaleRepository(sql), clock)
        }

    @After
    fun tearDown() {
        sql.close()
        Dispatchers.resetMain()
    }

    @Test
    fun startsWithTheLast24HoursAndNoEnd() {
        assertEquals(Instant.parse("2026-10-19T15:00:00Z"), viewModel.applied.value.from)
        assertEquals(null, viewModel.applied.value.to)
        assertEquals(50, viewModel.limit.value)
    }

    @Test
    fun loadMoreAddsFiftyAndAFilterChangeGoesBackToFifty() =
        runTest {
            viewModel.sales.launchIn(backgroundScope)
            viewModel.canLoadMore.launchIn(backgroundScope)
            assertEquals(50, viewModel.sales.first { it != null }!!.size)
            assertTrue(viewModel.canLoadMore.first { it })

            viewModel.loadMore()
            assertEquals(100, viewModel.limit.value)
            assertEquals(100, viewModel.sales.first { it?.size == 100 }!!.size)

            viewModel.setCustomer("Mesa")
            viewModel.apply()
            assertEquals(50, viewModel.limit.value)
        }

    @Test
    fun theFilterOnlyAppliesOnApplyAndAnInvalidDateKeepsTheOldOne() {
        val before = viewModel.applied.value
        viewModel.setCustomer("Mesa")
        assertEquals(before, viewModel.applied.value)

        viewModel.setFromDate("not a date")
        assertFalse(viewModel.apply())
        assertTrue(viewModel.formError.value)
        assertEquals(before, viewModel.applied.value)
    }

    @Test
    fun theEndIsSentOnlyWhenTyped() {
        viewModel.setToDate("2026-10-20")
        viewModel.setToTime("18:30")
        assertTrue(viewModel.apply())

        assertEquals(Instant.parse("2026-10-20T18:30:59.999Z"), viewModel.applied.value.to)

        viewModel.clear()
        assertEquals(null, viewModel.applied.value.to)
        assertEquals("", viewModel.form.value.toDate)
    }
}
