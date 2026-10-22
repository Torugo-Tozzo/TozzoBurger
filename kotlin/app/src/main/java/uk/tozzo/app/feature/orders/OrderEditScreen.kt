package uk.tozzo.app.feature.orders

import android.widget.Toast
import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
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
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import uk.tozzo.app.R
import uk.tozzo.app.core.data.EditLine
import uk.tozzo.app.domain.ItemStatus
import uk.tozzo.app.domain.PaymentMethod
import uk.tozzo.app.ui.components.ButtonVariant
import uk.tozzo.app.ui.components.ConfirmDialog
import uk.tozzo.app.ui.components.LoadingState
import uk.tozzo.app.ui.components.MoneyText
import uk.tozzo.app.ui.components.PaymentMethodSelector
import uk.tozzo.app.ui.components.ProductPicker
import uk.tozzo.app.ui.components.TozzoButton
import uk.tozzo.app.ui.components.TozzoTextField
import uk.tozzo.app.ui.components.TypeChip
import uk.tozzo.app.ui.icons.TozzoIcons

/** The edit screen of an open order. [onExit] leaves it, whatever the reason. */
@Composable
fun OrderEditRoute(
    onExit: () -> Unit,
    viewModel: OrderEditViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val message by viewModel.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    var pickerOpen by rememberSaveable { mutableStateOf(false) }

    val context = LocalContext.current
    val closedWarning = stringResource(R.string.orders_already_closed)
    LaunchedEffect(viewModel) {
        viewModel.exits.collect { exit ->
            // The order went away under the user: the warning outlives this screen, so it is a toast.
            if (exit == OrderEditExit.ALREADY_CLOSED) Toast.makeText(context, closedWarning, Toast.LENGTH_LONG).show()
            onExit()
        }
    }
    OrderEditMessageEffect(message, snackbar, viewModel::consumeMessage)

    Box(Modifier.fillMaxSize()) {
        if (!state.loaded) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { LoadingState() }
        } else {
            OrderEditScreen(
                state,
                OrderEditActions(
                    onCustomer = viewModel::setCustomer,
                    onDelivery = viewModel::setDelivery,
                    onAddress = viewModel::setAddress,
                    onPayment = viewModel::setPayment,
                    onIncrease = viewModel::increase,
                    onDecrease = viewModel::decrease,
                    onStatus = viewModel::setStatus,
                    onAddItem = { pickerOpen = true },
                    onSave = viewModel::save,
                    onClose = viewModel::close,
                    onDelete = viewModel::delete,
                ),
            )
        }
        SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter))
    }
    if (pickerOpen) ProductSheet(viewModel, onDismiss = { pickerOpen = false })
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ProductSheet(
    viewModel: OrderEditViewModel,
    onDismiss: () -> Unit,
) {
    val products by viewModel.products.collectAsStateWithLifecycle()
    val types by viewModel.types.collectAsStateWithLifecycle()
    val search by viewModel.search.collectAsStateWithLifecycle()
    val typeId by viewModel.typeId.collectAsStateWithLifecycle()
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        shape = MaterialTheme.shapes.medium,
        containerColor = MaterialTheme.colorScheme.surface,
    ) {
        ProductPicker(
            types = types,
            products = products,
            search = search,
            typeId = typeId,
            onSearch = viewModel::setSearch,
            onType = viewModel::setType,
            onAdd = viewModel::add,
            modifier = Modifier.fillMaxHeight(PICKER_HEIGHT).padding(horizontal = 16.dp),
        )
    }
}

private const val PICKER_HEIGHT = 0.85f

/** What the screen asks of the view model. */
data class OrderEditActions(
    val onCustomer: (String) -> Unit,
    val onDelivery: (Boolean) -> Unit,
    val onAddress: (String) -> Unit,
    val onPayment: (PaymentMethod?) -> Unit,
    val onIncrease: (String) -> Unit,
    val onDecrease: (String) -> Unit,
    val onStatus: (String, ItemStatus) -> Unit,
    val onAddItem: () -> Unit,
    val onSave: () -> Unit,
    val onClose: () -> Unit,
    val onDelete: () -> Unit,
)

@Composable
private fun OrderEditMessageEffect(
    message: OrderEditMessage?,
    snackbar: SnackbarHostState,
    onConsumed: () -> Unit,
) {
    val texts = OrderEditMessage.entries.associateWith { stringResource(it.res()) }
    // The snackbar runs in its own scope: consuming the message restarts the effect, which would cancel it.
    val scope = rememberCoroutineScope()
    LaunchedEffect(message) {
        val text = texts[message ?: return@LaunchedEffect]
        onConsumed()
        scope.launch { snackbar.showSnackbar(text.orEmpty()) }
    }
}

@StringRes
private fun OrderEditMessage.res(): Int =
    when (this) {
        OrderEditMessage.ADDRESS_REQUIRED -> R.string.cart_address_required
        OrderEditMessage.SAVE_FAILED -> R.string.orders_save_failed
        OrderEditMessage.CLOSE_FAILED -> R.string.orders_close_failed
        OrderEditMessage.DELETE_FAILED -> R.string.orders_delete_failed
        OrderEditMessage.STATUS_FAILED -> R.string.orders_status_failed
    }

/** The form: customer, delivery, items with their status, total, "Salvar", then closing and deleting. */
@Suppress("LongMethod")
@Composable
fun OrderEditScreen(
    state: OrderEditState,
    actions: OrderEditActions,
    modifier: Modifier = Modifier,
) {
    var confirmClose by rememberSaveable { mutableStateOf(false) }
    var confirmDelete by rememberSaveable { mutableStateOf(false) }
    val readOnly = !state.canSave

    // An order out for delivery or opened with "Ver pedido" cannot be typed into either.
    val locked = state.readOnly || state.delivering
    Column(
        modifier = modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (state.delivering && !state.readOnly) {
            Text(
                stringResource(R.string.orders_delivering_blocked),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.error,
            )
        }
        TozzoTextField(
            state.customer,
            actions.onCustomer,
            stringResource(R.string.cart_customer),
            enabled = !locked,
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            Checkbox(state.isDelivery, actions.onDelivery, enabled = !readOnly)
            Text(stringResource(R.string.cart_delivery))
        }
        if (state.isDelivery) {
            TozzoTextField(
                state.address,
                actions.onAddress,
                stringResource(R.string.cart_address),
                error =
                    if (state.address.isBlank() && !locked) stringResource(R.string.cart_address_required) else null,
                enabled = !locked,
            )
        }
        Text(stringResource(R.string.orders_items), style = MaterialTheme.typography.titleMedium)
        state.lines.forEach { line ->
            LineRow(line, state, actions, readOnly)
        }
        TozzoButton(
            stringResource(R.string.orders_add_item),
            actions.onAddItem,
            Modifier.fillMaxWidth(),
            variant = ButtonVariant.Outline,
            enabled = !readOnly,
        )
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(stringResource(R.string.cart_total), style = MaterialTheme.typography.titleMedium)
            MoneyText(state.totalCents, style = MaterialTheme.typography.titleLarge)
        }
        if (!state.readOnly) {
            TozzoButton(
                stringResource(if (state.busy) R.string.common_saving else R.string.common_save),
                actions.onSave,
                Modifier.fillMaxWidth(),
                enabled = state.canSave,
                loading = state.busy,
            )
        }
        if (state.showClose) {
            Text(stringResource(R.string.payment_method_label), style = MaterialTheme.typography.labelLarge)
            PaymentMethodSelector(state.payment, actions.onPayment, allowNone = true)
            TozzoButton(
                stringResource(R.string.orders_close),
                { confirmClose = true },
                Modifier.fillMaxWidth(),
                variant = ButtonVariant.Outline,
                enabled = state.canClose,
            )
        }
        if (!state.readOnly) {
            TozzoButton(
                stringResource(R.string.common_delete),
                { confirmDelete = true },
                Modifier.fillMaxWidth(),
                variant = ButtonVariant.Destructive,
                enabled = state.canDelete,
            )
        }
    }
    if (confirmClose) {
        ConfirmDialog(
            title = stringResource(R.string.orders_close),
            message = stringResource(R.string.orders_close_confirm),
            confirmText = stringResource(R.string.orders_close),
            onConfirm = {
                confirmClose = false
                actions.onClose()
            },
            onDismiss = { confirmClose = false },
        )
    }
    if (confirmDelete) {
        ConfirmDialog(
            title = stringResource(R.string.orders_delete_title),
            message = stringResource(R.string.orders_delete_confirm),
            confirmText = stringResource(R.string.common_delete),
            onConfirm = {
                confirmDelete = false
                actions.onDelete()
            },
            onDismiss = { confirmDelete = false },
            destructive = true,
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun LineRow(
    line: EditLine,
    state: OrderEditState,
    actions: OrderEditActions,
    readOnly: Boolean,
) {
    val stored = state.order?.items?.firstOrNull { it.id == line.id }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Column(Modifier.weight(1f)) {
                Text(
                    line.name.ifBlank { stringResource(R.string.orders_item_fallback) },
                    style = MaterialTheme.typography.titleMedium,
                )
                // A price that could not be read counts as 0 and shows as a dash.
                if (line.unitPriceCents > 0) {
                    MoneyText(line.unitPriceCents * line.quantity, style = MaterialTheme.typography.bodyMedium)
                } else {
                    Text("—", style = MaterialTheme.typography.bodyMedium)
                }
            }
            IconButton(onClick = { actions.onDecrease(line.id) }, enabled = !readOnly) {
                val remove = line.quantity <= 1
                Icon(
                    if (remove) TozzoIcons.Trash else TozzoIcons.Minus,
                    contentDescription =
                        stringResource(if (remove) R.string.cart_remove_item else R.string.cart_decrease_item),
                )
            }
            Text(line.quantity.toString(), style = MaterialTheme.typography.titleMedium)
            IconButton(onClick = { actions.onIncrease(line.id) }, enabled = !readOnly) {
                Icon(TozzoIcons.Plus, contentDescription = stringResource(R.string.cart_increase_item))
            }
        }
        // The status exists only for an item the order already has, and writes at once.
        if (stored != null) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ItemStatus.entries.forEach { status ->
                    TypeChip(
                        stringResource(status.labelRes()),
                        selected = stored.status == status,
                        onClick = { actions.onStatus(stored.id, status) },
                        enabled = state.canChangeStatus,
                    )
                }
            }
        }
    }
}

@StringRes
internal fun ItemStatus.labelRes(): Int =
    when (this) {
        ItemStatus.IN_PREPARATION -> R.string.item_status_in_preparation
        ItemStatus.READY -> R.string.item_status_ready
        ItemStatus.DELIVERED -> R.string.item_status_delivered
    }
