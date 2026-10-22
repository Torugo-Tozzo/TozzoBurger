@file:Suppress("MatchingDeclarationName")

package uk.tozzo.app.feature.sales

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLocale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uk.tozzo.app.R
import uk.tozzo.app.core.data.SaleLineView
import uk.tozzo.app.core.data.SaleView
import uk.tozzo.app.core.data.SalesSummary
import uk.tozzo.app.ui.components.ButtonVariant
import uk.tozzo.app.ui.components.EmptyState
import uk.tozzo.app.ui.components.LoadingState
import uk.tozzo.app.ui.components.MoneyText
import uk.tozzo.app.ui.components.TozzoButton
import uk.tozzo.app.ui.components.TozzoCard
import uk.tozzo.app.ui.components.paymentMethodRes
import uk.tozzo.app.ui.theme.TozzoColors
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

/** What the list asks of its caller. */
data class SalesActions(
    val onFilters: () -> Unit,
    val onLoadMore: () -> Unit,
    val onNewSale: () -> Unit,
    val onOpen: (String) -> Unit,
)

@Composable
fun SalesRoute(
    onNewSale: () -> Unit,
    onOpen: (String) -> Unit,
    viewModel: SalesViewModel = hiltViewModel(),
) {
    val sales by viewModel.sales.collectAsStateWithLifecycle()
    val summary by viewModel.summary.collectAsStateWithLifecycle()
    val canLoadMore by viewModel.canLoadMore.collectAsStateWithLifecycle()
    val form by viewModel.form.collectAsStateWithLifecycle()
    val hasError by viewModel.formError.collectAsStateWithLifecycle()
    var sheetOpen by rememberSaveable { mutableStateOf(false) }
    SalesScreen(
        sales = sales,
        summary = summary,
        canLoadMore = canLoadMore,
        actions = SalesActions({ sheetOpen = true }, viewModel::loadMore, onNewSale, onOpen),
    )
    if (sheetOpen) {
        SalesFilterSheet(
            form = form,
            hasError = hasError,
            actions =
                SalesFilterActions(
                    onFromDate = viewModel::setFromDate,
                    onFromTime = viewModel::setFromTime,
                    onToDate = viewModel::setToDate,
                    onToTime = viewModel::setToTime,
                    onCustomer = viewModel::setCustomer,
                    onSeller = viewModel::setSeller,
                    onMin = viewModel::setMin,
                    onMax = viewModel::setMax,
                    onApply = viewModel::apply,
                    onClear = viewModel::clear,
                    onDismiss = { sheetOpen = false },
                ),
        )
    }
}

/** The closing of the period on top, then the sales grouped by day; "Nova venda" stays at the corner. */
@Composable
fun SalesScreen(
    sales: List<SaleView>?,
    summary: SalesSummary?,
    canLoadMore: Boolean,
    actions: SalesActions,
    modifier: Modifier = Modifier,
) {
    if (sales == null) {
        Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) { LoadingState() }
        return
    }
    val zone = remember { ZoneId.systemDefault() }
    val days = remember(sales) { sales.groupBy { it.soldAt?.atZone(zone)?.toLocalDate() } }
    Box(modifier.fillMaxSize()) {
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item(key = "header") { ClosingHeader(summary, actions.onFilters) }
            if (sales.isEmpty()) item(key = "empty") { EmptyState(stringResource(R.string.sales_empty)) }
            days.forEach { (day, daySales) ->
                item(key = "day-$day") { DayTitle(day) }
                items(daySales, key = { it.id }) { SaleCard(it, onClick = { actions.onOpen(it.id) }) }
            }
            // Reached only by scrolling to the end: the next 50 are read, and the effect restarts for the next page.
            if (canLoadMore) item(key = "more") { LaunchedEffect(sales.size) { actions.onLoadMore() } }
            item(key = "end") { Box(Modifier.padding(bottom = 72.dp)) }
        }
        TozzoButton(
            stringResource(R.string.sales_new),
            actions.onNewSale,
            Modifier.align(Alignment.BottomEnd).padding(16.dp),
        )
    }
}

@Composable
private fun ClosingHeader(
    summary: SalesSummary?,
    onFilters: () -> Unit,
) {
    Column(Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        TozzoCard(modifier = Modifier.fillMaxWidth()) {
            Text(stringResource(R.string.sales_closing), style = MaterialTheme.typography.titleMedium)
            MoneyText(
                summary?.totalCents ?: 0L,
                style = MaterialTheme.typography.headlineMedium.copy(fontWeight = FontWeight.Bold),
                color = TozzoColors.success,
            )
            Text(
                stringResource(R.string.sales_total_records, summary?.count ?: 0),
                style = MaterialTheme.typography.bodyMedium,
            )
        }
        TozzoButton(
            stringResource(R.string.sales_filters),
            onFilters,
            Modifier.fillMaxWidth(),
            variant = ButtonVariant.Outline,
        )
    }
}

@Composable
private fun DayTitle(day: LocalDate?) {
    val locale = LocalLocale.current.platformLocale
    Text(
        day?.let { DateTimeFormatter.ofLocalizedDate(FormatStyle.LONG).withLocale(locale).format(it) }
            ?: stringResource(R.string.common_not_informed),
        style = MaterialTheme.typography.titleSmall,
        modifier = Modifier.padding(top = 4.dp),
    )
}

@Composable
private fun SaleCard(
    sale: SaleView,
    onClick: () -> Unit,
) {
    val notInformed = stringResource(R.string.common_not_informed)
    val locale = LocalLocale.current.platformLocale
    TozzoCard(modifier = Modifier.fillMaxWidth(), onClick = onClick) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(sale.customerName ?: notInformed, style = MaterialTheme.typography.titleMedium)
            if (sale.lines.isNotEmpty()) {
                Text(
                    saleSummary(sale.lines, stringResource(R.string.orders_item_fallback)),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                stringResource(R.string.orders_created_by, sale.sellerName ?: notInformed),
                style = MaterialTheme.typography.bodySmall,
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                val payment = sale.payment?.let { stringResource(paymentMethodRes(it)) } ?: notInformed
                val time = timeText(sale.soldAt, locale) ?: notInformed
                Text("$time · $payment", style = MaterialTheme.typography.bodySmall)
                MoneyText(sale.totalCents, style = MaterialTheme.typography.titleMedium)
            }
        }
    }
}

/** "2x X, 1x Y": the quantities and names of the lines. */
internal fun saleSummary(
    lines: List<SaleLineView>,
    fallback: String,
): String = lines.joinToString(", ") { "${it.quantity}x ${it.productName ?: fallback}" }

private fun timeText(
    instant: Instant?,
    locale: Locale,
): String? =
    instant?.let {
        DateTimeFormatter
            .ofLocalizedTime(FormatStyle.SHORT)
            .withLocale(locale)
            .withZone(ZoneId.systemDefault())
            .format(it)
    }
