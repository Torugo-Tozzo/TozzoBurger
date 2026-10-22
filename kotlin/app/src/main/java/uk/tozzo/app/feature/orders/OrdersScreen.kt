@file:Suppress("MatchingDeclarationName")

package uk.tozzo.app.feature.orders

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLocale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uk.tozzo.app.R
import uk.tozzo.app.core.data.OrderItemView
import uk.tozzo.app.core.data.OrderView
import uk.tozzo.app.domain.Money
import uk.tozzo.app.ui.components.ButtonVariant
import uk.tozzo.app.ui.components.EmptyState
import uk.tozzo.app.ui.components.LoadingState
import uk.tozzo.app.ui.components.MoneyText
import uk.tozzo.app.ui.components.TozzoButton
import uk.tozzo.app.ui.components.TozzoCard
import uk.tozzo.app.ui.components.TozzoTextField
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale

/** What the screen asks of the view model. */
data class OrdersActions(
    val onCustomer: (String) -> Unit,
    val onSeller: (String) -> Unit,
    val onMin: (String) -> Unit,
    val onMax: (String) -> Unit,
    val onSearch: () -> Unit,
    val onNewOrder: () -> Unit,
    val onEdit: (String) -> Unit,
)

@Composable
fun OrdersRoute(
    onNewOrder: () -> Unit,
    onEdit: (String) -> Unit,
    viewModel: OrdersViewModel = hiltViewModel(),
) {
    val orders by viewModel.orders.collectAsStateWithLifecycle()
    val form by viewModel.form.collectAsStateWithLifecycle()
    OrdersScreen(
        orders = orders,
        form = form,
        actions =
            OrdersActions(
                viewModel::setCustomer,
                viewModel::setSeller,
                viewModel::setMin,
                viewModel::setMax,
                viewModel::search,
                onNewOrder,
                onEdit,
            ),
    )
}

/** The open orders: "Novo pedido" and the filters on top, then one card per order. */
@Composable
fun OrdersScreen(
    orders: List<OrderView>?,
    form: OrdersFilterForm,
    actions: OrdersActions,
    modifier: Modifier = Modifier,
) {
    if (orders == null) {
        Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) { LoadingState() }
        return
    }
    LazyColumn(
        modifier = modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item(key = "filters") { FiltersCard(form, actions) }
        if (orders.isEmpty()) {
            item(key = "empty") { EmptyState(stringResource(R.string.orders_empty)) }
        }
        items(orders, key = { it.id }) { OrderCard(it, onClick = { actions.onEdit(it.id) }) }
        item(key = "end") { Box(Modifier.padding(bottom = 8.dp)) }
    }
}

@Composable
private fun FiltersCard(
    form: OrdersFilterForm,
    actions: OrdersActions,
) {
    val numbers = KeyboardOptions(keyboardType = KeyboardType.Number)
    Column(Modifier.padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        TozzoButton(stringResource(R.string.orders_new), actions.onNewOrder, Modifier.fillMaxWidth())
        TozzoTextField(form.customer, actions.onCustomer, stringResource(R.string.cart_customer))
        TozzoTextField(form.seller, actions.onSeller, stringResource(R.string.orders_filter_seller))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TozzoTextField(
                form.minCents.maskedMoney(),
                actions.onMin,
                stringResource(R.string.orders_filter_min),
                Modifier.weight(1f),
                keyboardOptions = numbers,
            )
            TozzoTextField(
                form.maxCents.maskedMoney(),
                actions.onMax,
                stringResource(R.string.orders_filter_max),
                Modifier.weight(1f),
                keyboardOptions = numbers,
            )
        }
        TozzoButton(
            stringResource(R.string.orders_search),
            actions.onSearch,
            Modifier.fillMaxWidth(),
            variant = ButtonVariant.Outline,
        )
    }
}

private fun Long?.maskedMoney(): String = this?.let { Money.centsToDecimal(it) }.orEmpty()

@Composable
private fun OrderCard(
    order: OrderView,
    onClick: () -> Unit,
) {
    val notInformed = stringResource(R.string.common_not_informed)
    TozzoCard(modifier = Modifier.fillMaxWidth(), onClick = onClick) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(order.customerName ?: notInformed, style = MaterialTheme.typography.titleMedium)
            deliveryLine(order)?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
            if (order.items.isNotEmpty()) {
                Text(
                    orderSummary(order.items, stringResource(R.string.orders_item_fallback)),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                stringResource(R.string.orders_created_by, order.sellerName ?: notInformed),
                style = MaterialTheme.typography.bodySmall,
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                val locale = LocalLocale.current.platformLocale
                Text(
                    dateTimeText(order.updatedAt ?: order.openedAt, locale) ?: notInformed,
                    style = MaterialTheme.typography.bodySmall,
                )
                MoneyText(order.totalCents, style = MaterialTheme.typography.titleMedium)
            }
        }
    }
}

@Composable
internal fun deliveryLine(order: OrderView): String? {
    val address = order.deliveryAddress?.takeIf { order.isDelivery && it.isNotBlank() } ?: return null
    val line = if (order.delivering) R.string.orders_delivering_line else R.string.orders_delivery_line
    return stringResource(line, address)
}

/** "2x X, 1x Y": the quantities and names of the items. */
internal fun orderSummary(
    items: List<OrderItemView>,
    fallback: String,
): String = items.joinToString(", ") { "${it.quantity}x ${it.productName ?: fallback}" }

internal fun dateTimeText(
    instant: Instant?,
    locale: Locale,
): String? =
    instant?.let {
        DateTimeFormatter
            .ofLocalizedDateTime(FormatStyle.SHORT)
            .withLocale(locale)
            .withZone(ZoneId.systemDefault())
            .format(it)
    }
