package uk.tozzo.app.feature.sell

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uk.tozzo.app.R
import uk.tozzo.app.core.data.CartLine
import uk.tozzo.app.domain.PaymentMethod
import uk.tozzo.app.ui.components.ButtonVariant
import uk.tozzo.app.ui.components.ConfirmDialog
import uk.tozzo.app.ui.components.MoneyText
import uk.tozzo.app.ui.components.PaymentMethodSelector
import uk.tozzo.app.ui.components.TozzoButton
import uk.tozzo.app.ui.components.TozzoTextField
import uk.tozzo.app.ui.icons.TozzoIcons

/** Everything the sheet shows; the view model owns it. */
data class CartSheetState(
    val lines: List<CartLine>,
    val customerName: String,
    val canGenerateOrder: Boolean,
    val isDelivery: Boolean,
    val address: String,
    val payment: PaymentMethod?,
    val totalCents: Long,
    val canSell: Boolean,
    val canCreateOrder: Boolean,
)

/** What the sheet can ask for. */
data class CartSheetActions(
    val onCustomerName: (String) -> Unit,
    val onDelivery: (Boolean) -> Unit,
    val onAddress: (String) -> Unit,
    val onPayment: (PaymentMethod?) -> Unit,
    val onIncrease: (String) -> Unit,
    val onDecrease: (String) -> Unit,
    val onClear: () -> Unit,
    val onCreateOrder: () -> Unit,
    val onSellDirect: () -> Unit,
    val onDismiss: () -> Unit,
)

@Composable
internal fun CartSheetRoute(
    viewModel: SellViewModel,
    onDismiss: () -> Unit,
) {
    val state =
        CartSheetState(
            lines = viewModel.cart.collectAsStateWithLifecycle().value,
            customerName = viewModel.customerName.collectAsStateWithLifecycle().value,
            canGenerateOrder = viewModel.canGenerateOrder.collectAsStateWithLifecycle().value,
            isDelivery = viewModel.isDelivery.collectAsStateWithLifecycle().value,
            address = viewModel.address.collectAsStateWithLifecycle().value,
            payment = viewModel.payment.collectAsStateWithLifecycle().value,
            totalCents = viewModel.totalCents.collectAsStateWithLifecycle().value,
            canSell = viewModel.canSell.collectAsStateWithLifecycle().value,
            canCreateOrder = viewModel.canCreateOrder.collectAsStateWithLifecycle().value,
        )
    CartSheet(
        state,
        CartSheetActions(
            onCustomerName = viewModel::setCustomerName,
            onDelivery = viewModel::setDelivery,
            onAddress = viewModel::setAddress,
            onPayment = viewModel::setPayment,
            onIncrease = viewModel::increase,
            onDecrease = viewModel::decrease,
            onClear = viewModel::clear,
            onCreateOrder = viewModel::createOrder,
            onSellDirect = viewModel::sellDirect,
            onDismiss = onDismiss,
        ),
    )
}

/** The bill: customer, delivery, lines with − and +, total, payment and the three buttons. */
@OptIn(ExperimentalMaterial3Api::class)
@Suppress("LongMethod")
@Composable
fun CartSheet(
    state: CartSheetState,
    actions: CartSheetActions,
) {
    var confirmClear by rememberSaveable { mutableStateOf(false) }
    ModalBottomSheet(
        onDismissRequest = actions.onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        shape = MaterialTheme.shapes.medium,
        containerColor = MaterialTheme.colorScheme.surface,
    ) {
        Column(
            modifier =
                Modifier
                    .verticalScroll(
                        rememberScrollState(),
                    ).padding(horizontal = 16.dp)
                    .padding(bottom = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(stringResource(R.string.cart_title), style = MaterialTheme.typography.titleLarge)
            TozzoTextField(state.customerName, actions.onCustomerName, stringResource(R.string.cart_customer))
            if (state.canGenerateOrder) DeliveryFields(state, actions)
            state.lines.forEach { CartLineRow(it, actions) }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(stringResource(R.string.cart_total), style = MaterialTheme.typography.titleMedium)
                MoneyText(state.totalCents, style = MaterialTheme.typography.titleLarge)
            }
            Text(stringResource(R.string.payment_method_label), style = MaterialTheme.typography.labelLarge)
            PaymentMethodSelector(state.payment, actions.onPayment, allowNone = true)
            if (state.canGenerateOrder) {
                TozzoButton(
                    stringResource(R.string.cart_create_order),
                    actions.onCreateOrder,
                    Modifier.fillMaxWidth(),
                    enabled = state.canCreateOrder,
                )
            }
            TozzoButton(
                stringResource(R.string.cart_direct_sale),
                actions.onSellDirect,
                Modifier.fillMaxWidth(),
                variant = if (state.canGenerateOrder) ButtonVariant.Outline else ButtonVariant.Primary,
                enabled = state.canSell,
            )
            TozzoButton(
                stringResource(R.string.cart_clear),
                { confirmClear = true },
                Modifier.fillMaxWidth(),
                variant = ButtonVariant.Ghost,
            )
        }
    }
    if (confirmClear) {
        ConfirmDialog(
            title = stringResource(R.string.cart_clear_title),
            message = stringResource(R.string.cart_clear_message),
            confirmText = stringResource(R.string.cart_clear),
            onConfirm = {
                confirmClear = false
                actions.onClear()
            },
            onDismiss = { confirmClear = false },
            destructive = true,
        )
    }
}

@Composable
private fun DeliveryFields(
    state: CartSheetState,
    actions: CartSheetActions,
) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Checkbox(state.isDelivery, actions.onDelivery)
        Text(stringResource(R.string.cart_delivery))
    }
    if (state.isDelivery) {
        TozzoTextField(
            state.address,
            actions.onAddress,
            stringResource(R.string.cart_address),
            error = if (state.address.isBlank()) stringResource(R.string.cart_address_required) else null,
        )
    }
}

@Composable
private fun CartLineRow(
    line: CartLine,
    actions: CartSheetActions,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Column(Modifier.weight(1f)) {
            Text(line.name, style = MaterialTheme.typography.titleMedium)
            MoneyText(line.unitPriceCents * line.quantity, style = MaterialTheme.typography.bodyMedium)
        }
        IconButton(onClick = { actions.onDecrease(line.productId) }) {
            val remove = line.quantity <= 1
            Icon(
                if (remove) TozzoIcons.Trash else TozzoIcons.Minus,
                contentDescription =
                    stringResource(if (remove) R.string.cart_remove_item else R.string.cart_decrease_item),
            )
        }
        Text(line.quantity.toString(), style = MaterialTheme.typography.titleMedium)
        IconButton(onClick = { actions.onIncrease(line.productId) }) {
            Icon(TozzoIcons.Plus, contentDescription = stringResource(R.string.cart_increase_item))
        }
    }
}
