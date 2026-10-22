package uk.tozzo.app.feature.sales

import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import uk.tozzo.app.core.data.SaleRepository
import uk.tozzo.app.domain.Money
import uk.tozzo.app.testing.RobolectricSql
import uk.tozzo.app.testing.seedProduct
import uk.tozzo.app.testing.seedSale
import uk.tozzo.app.testing.seedSaleItem
import uk.tozzo.app.testing.seedUser
import uk.tozzo.app.ui.theme.TozzoTheme
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.Locale
import java.util.TimeZone

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "pt-rBR-w411dp-h2400dp")
class SalesScreenTest {
    @get:Rule
    val rule = createComposeRule()

    private lateinit var sql: RobolectricSql
    private val clock = Clock.fixed(Instant.parse("2026-10-20T15:00:00Z"), ZoneOffset.UTC)

    @Before
    fun setUp() =
        runBlocking {
            TimeZone.setDefault(TimeZone.getTimeZone("UTC"))
            sql = RobolectricSql()
            sql.seedUser("u1", "Ana")
            sql.seedProduct("p1", "X-Burger", "12.50")
            sql.seedSale(
                "a",
                soldAt = "2026-10-20 10:00:00.000",
                total = "25.00",
                customer = "Mesa 10",
                payment = "PIX",
            )
            sql.seedSaleItem("ia", "a", "p1", 2, "12.50")
            sql.seedSale("b", soldAt = "2026-10-20 12:00:00.000", total = "5.50")
            sql.seedSale("old", soldAt = "2026-10-01 12:00:00.000", total = "99.00")
        }

    @After
    fun tearDown() = sql.close()

    private fun show(onOpen: (String) -> Unit = {}) {
        val viewModel = SalesViewModel(SaleRepository(sql), clock)
        rule.setContent { TozzoTheme { SalesRoute(onNewSale = {}, onOpen = onOpen, viewModel = viewModel) } }
        rule.waitUntil(timeoutMillis = 10_000) {
            rule.onAllNodesWithTextCount("Fechamento do período") > 0 &&
                rule.onAllNodesWithTextCount("Total de registros: 2") > 0
        }
    }

    private fun androidx.compose.ui.test.junit4.ComposeContentTestRule.onAllNodesWithTextCount(text: String) =
        onAllNodesWithText(text).fetchSemanticsNodes().size

    @Test
    fun theClosingShowsTheFormattedSumOfThePeriod() {
        show()

        rule.onNodeWithText(Money.format(3050L, Locale.forLanguageTag("pt-BR"))).assertExists()
        rule.onNodeWithText("Total de registros: 2").assertExists()
        rule.onNodeWithText("Mesa 10").assertExists()
        rule.onNodeWithText("2x X-Burger").assertExists()
    }

    @Test
    fun aRowOpensTheDetail() {
        val opened = mutableListOf<String>()
        show { opened += it }

        rule.onNodeWithText("Mesa 10").performClick()

        assertEquals(listOf("a"), opened)
    }
}
