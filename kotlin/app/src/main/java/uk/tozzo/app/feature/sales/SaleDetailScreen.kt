package uk.tozzo.app.feature.sales

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uk.tozzo.app.R
import uk.tozzo.app.core.data.SaleLineView
import uk.tozzo.app.core.data.SaleView
import uk.tozzo.app.domain.Money
import uk.tozzo.app.feature.orders.dateTimeText
import uk.tozzo.app.ui.components.ButtonVariant
import uk.tozzo.app.ui.components.ConfirmDialog
import uk.tozzo.app.ui.components.EmptyState
import uk.tozzo.app.ui.components.LoadingState
import uk.tozzo.app.ui.components.MoneyText
import uk.tozzo.app.ui.components.TozzoButton
import uk.tozzo.app.ui.components.paymentMethodRes

/** The detail of a sale. [onExit] leaves it, once the sale is cancelled or when the user goes back. */
@Composable
fun SaleDetailRoute(
    onExit: () -> Unit,
    viewModel: SaleDetailViewModel = hiltViewModel(),
) {
    val state by viewModel.sale.collectAsStateWithLifecycle()
    val cancelling by viewModel.cancelling.collectAsStateWithLifecycle()
    val failed by viewModel.cancelFailed.collectAsStateWithLifecycle()
    val cancelled by viewModel.cancelled.collectAsStateWithLifecycle()
    var confirming by rememberSaveable { mutableStateOf(false) }
    LaunchedEffect(cancelled) { if (cancelled) onExit() }
    when (val s = state) {
        SaleResultState.Loading -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { LoadingState() }
        is SaleResultState.Loaded ->
            SaleDetailScreen(s.sale, cancelling, failed, onCancel = { confirming = true })
    }
    if (confirming) {
        ConfirmDialog(
            title = stringResource(R.string.sales_cancel),
            message = stringResource(R.string.sales_cancel_confirm),
            confirmText = stringResource(R.string.sales_cancel),
            onConfirm = {
                confirming = false
                viewModel.cancel()
            },
            onDismiss = { confirming = false },
            destructive = true,
        )
    }
}

@Composable
fun SaleDetailScreen(
    sale: SaleView?,
    cancelling: Boolean,
    cancelFailed: Boolean,
    onCancel: () -> Unit,
    modifier: Modifier = Modifier,
) {
    if (sale == null) {
        Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            EmptyState(stringResource(R.string.sales_not_found))
        }
        return
    }
    val notInformed = stringResource(R.string.common_not_informed)
    val locale = LocalLocale.current.platformLocale
    Column(
        modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(sale.customerName ?: notInformed, style = MaterialTheme.typography.titleLarge)
        Field(R.string.sales_date, dateTimeText(sale.soldAt, locale) ?: notInformed)
        Field(R.string.orders_filter_seller, sale.sellerName ?: notInformed)
        Field(R.string.sales_payment, sale.payment?.let { stringResource(paymentMethodRes(it)) } ?: notInformed)
        Text(stringResource(R.string.orders_items), style = MaterialTheme.typography.titleMedium)
        sale.lines.forEach { LineRow(it, locale) }
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(stringResource(R.string.sales_total), style = MaterialTheme.typography.titleMedium)
            MoneyText(sale.totalCents, style = MaterialTheme.typography.titleLarge)
        }
        if (cancelFailed) Text(stringResource(R.string.sales_cancel_failed), color = MaterialTheme.colorScheme.error)
        if (!sale.isCancelled) {
            TozzoButton(
                text = stringResource(if (cancelling) R.string.sales_cancelling else R.string.sales_cancel),
                onClick = onCancel,
                modifier = Modifier.fillMaxWidth(),
                variant = ButtonVariant.Destructive,
                enabled = !cancelling,
                loading = cancelling,
            )
        }
    }
}

@Composable
private fun Field(
    label: Int,
    value: String,
) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(stringResource(label), style = MaterialTheme.typography.bodyMedium)
        Text(value, style = MaterialTheme.typography.bodyMedium)
    }
}

/** "Name", then "N unidades × price" and the subtotal. */
@Composable
private fun LineRow(
    line: SaleLineView,
    locale: java.util.Locale,
) {
    val name = line.productName ?: stringResource(R.string.orders_item_fallback)
    val units = pluralStringResource(R.plurals.sales_units, line.quantity, line.quantity)
    val price = remember(line.unitPriceCents, locale) { Money.format(line.unitPriceCents, locale) }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Column(Modifier.weight(1f)) {
            Text(name, style = MaterialTheme.typography.bodyLarge)
            Text("$units × $price", style = MaterialTheme.typography.bodySmall)
        }
        MoneyText(line.unitPriceCents * line.quantity, style = MaterialTheme.typography.bodyLarge)
    }
}
