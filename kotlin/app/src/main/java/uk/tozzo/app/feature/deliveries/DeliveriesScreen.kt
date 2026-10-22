package uk.tozzo.app.feature.deliveries

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.platform.LocalLocale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uk.tozzo.app.R
import uk.tozzo.app.core.data.DeliveryStage
import uk.tozzo.app.core.data.Driver
import uk.tozzo.app.core.data.OrderItemView
import uk.tozzo.app.core.data.OrderView
import uk.tozzo.app.domain.ItemStatus
import uk.tozzo.app.domain.Money
import uk.tozzo.app.domain.PaymentMethod
import uk.tozzo.app.feature.orders.dateTimeText
import uk.tozzo.app.ui.components.ButtonVariant
import uk.tozzo.app.ui.components.EmptyState
import uk.tozzo.app.ui.components.LoadingState
import uk.tozzo.app.ui.components.PaymentMethodSelector
import uk.tozzo.app.ui.components.TozzoButton
import uk.tozzo.app.ui.components.TozzoCard

private const val ORDER_ID_PREFIX = 6
private const val VISIBLE_ITEMS = 3
private const val DIM = 0.5f

/** What the board shows; null [board] is the first read of the database. */
data class DeliveriesUi(
    val board: Map<DeliveryStage, List<OrderView>>?,
    val drivers: List<Driver>,
    val canManage: Boolean,
    val confirmStart: OrderView?,
    val assignTarget: OrderView?,
    val finishTarget: OrderView?,
    val error: DeliveryError?,
)

/** What the screen asks of the view model. */
data class DeliveriesActions(
    val onView: (String) -> Unit,
    val onStart: (OrderView) -> Unit,
    val onConfirmStart: () -> Unit,
    val onDismissConfirm: () -> Unit,
    val onBack: (OrderView) -> Unit,
    val onOpenAssign: (OrderView) -> Unit,
    val onOpenFinish: (OrderView) -> Unit,
    val onCloseFinish: () -> Unit,
    val onFinish: (OrderView, PaymentMethod?) -> Unit,
)

@Composable
fun DeliveriesRoute(
    onView: (String) -> Unit,
    viewModel: DeliveriesViewModel = hiltViewModel(),
) {
    val board by viewModel.board.collectAsStateWithLifecycle()
    val drivers by viewModel.drivers.collectAsStateWithLifecycle()
    val confirm by viewModel.confirmStart.collectAsStateWithLifecycle()
    val assign by viewModel.assignTarget.collectAsStateWithLifecycle()
    val finishing by viewModel.finishTarget.collectAsStateWithLifecycle()
    val error by viewModel.error.collectAsStateWithLifecycle()
    DeliveriesScreen(
        DeliveriesUi(board, drivers, viewModel.canManage, confirm, assign, finishing, error),
        DeliveriesActions(
            onView = onView,
            onStart = viewModel::start,
            onConfirmStart = viewModel::confirmStart,
            onDismissConfirm = viewModel::dismissConfirm,
            onBack = viewModel::back,
            onOpenAssign = viewModel::openAssign,
            onOpenFinish = viewModel::openFinish,
            onCloseFinish = viewModel::closeFinish,
            onFinish = viewModel::finish,
        ),
    )
    assign?.let { order ->
        AssignDriverSheet(
            order = order,
            drivers = drivers,
            error = error,
            actions =
                AssignActions(
                    onDriver = { viewModel.assignDriver(order, it) },
                    onExternal = { name, phone -> viewModel.assignExternal(order, name, phone) },
                    onRemove = { viewModel.unassign(order) },
                    onDismiss = viewModel::closeAssign,
                ),
        )
    }
}

/** Two tabs, "Aguardando (N)" and "Entregando (N)", each a list of delivery cards. */
@Composable
fun DeliveriesScreen(
    ui: DeliveriesUi,
    actions: DeliveriesActions,
    modifier: Modifier = Modifier,
) {
    val board = ui.board
    if (board == null) {
        Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) { LoadingState() }
        return
    }
    var selected by rememberSaveable { mutableStateOf(0) }
    val stage = DeliveryStage.entries[selected]
    val waiting = board[DeliveryStage.WAITING].orEmpty()
    val delivering = board[DeliveryStage.DELIVERING].orEmpty()
    Column(modifier.fillMaxSize()) {
        PrimaryTabRow(selectedTabIndex = selected, containerColor = MaterialTheme.colorScheme.background) {
            Tab(
                selected = stage == DeliveryStage.WAITING,
                onClick = { selected = DeliveryStage.WAITING.ordinal },
                text = { Text(stringResource(R.string.deliveries_tab_waiting, waiting.size)) },
            )
            Tab(
                selected = stage == DeliveryStage.DELIVERING,
                onClick = { selected = DeliveryStage.DELIVERING.ordinal },
                text = { Text(stringResource(R.string.deliveries_tab_delivering, delivering.size)) },
            )
        }
        if (ui.error != null && ui.assignTarget == null && ui.finishTarget == null) {
            Text(
                stringResource(ui.error.messageRes()),
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.padding(16.dp),
            )
        }
        val shown = if (stage == DeliveryStage.WAITING) waiting else delivering
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (ui.canManage) item(key = "roster") { Roster(ui.drivers) }
            if (shown.isEmpty()) item(key = "empty") { EmptyState(stringResource(R.string.deliveries_empty)) }
            items(shown, key = { it.id }) { DeliveryCard(it, stage, ui.canManage, actions) }
            item(key = "end") { Box(Modifier.padding(bottom = 8.dp)) }
        }
    }
    ui.confirmStart?.let { ConfirmStartDialog(it, actions) }
    ui.finishTarget?.let { FinishDialog(it, ui.error, actions) }
}

@StringRes
internal fun DeliveryError.messageRes(): Int =
    when (this) {
        DeliveryError.NOT_READY -> R.string.deliveries_error_not_ready
        DeliveryError.DRIVER_BUSY -> R.string.deliveries_error_driver_busy
        DeliveryError.CONFLICT -> R.string.deliveries_error_conflict
        DeliveryError.DRIVER_REQUIRED -> R.string.deliveries_error_driver_required
        DeliveryError.CHANGE_FAILED -> R.string.deliveries_error_change
        DeliveryError.CLOSE_FAILED -> R.string.deliveries_error_close
    }

/** The drivers with their availability; only for the roles that manage deliveries. */
@Composable
private fun Roster(drivers: List<Driver>) {
    Column(Modifier.padding(top = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(stringResource(R.string.deliveries_drivers_title), style = MaterialTheme.typography.titleMedium)
        if (drivers.isEmpty()) {
            Text(stringResource(R.string.deliveries_no_drivers), style = MaterialTheme.typography.bodyMedium)
        }
        drivers.forEach {
            Text(
                "${it.name} · " +
                    stringResource(if (it.available) R.string.deliveries_available else R.string.deliveries_busy),
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.alpha(if (it.available) 1f else DIM),
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DeliveryCard(
    order: OrderView,
    stage: DeliveryStage,
    canManage: Boolean,
    actions: DeliveriesActions,
) {
    val locale = LocalLocale.current.platformLocale
    val notInformed = stringResource(R.string.common_not_informed)
    TozzoCard(modifier = Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                order.customerName ?: stringResource(R.string.kitchen_order_fallback, order.id.take(ORDER_ID_PREFIX)),
                style = MaterialTheme.typography.titleMedium,
            )
            order.deliveryAddress?.takeIf { it.isNotBlank() }?.let {
                Text(it, style = MaterialTheme.typography.bodyMedium)
            }
            val date = dateTimeText(order.openedAt, locale) ?: notInformed
            Text("$date · ${Money.format(order.totalCents, locale)}", style = MaterialTheme.typography.bodySmall)
            Text(driverLine(order, notInformed), style = MaterialTheme.typography.bodyMedium)
            order.items.take(VISIBLE_ITEMS).forEach { ItemLine(it) }
            if (order.items.size > VISIBLE_ITEMS) {
                val more = stringResource(R.string.deliveries_more_items, order.items.size - VISIBLE_ITEMS)
                Text("…", modifier = Modifier.semantics { contentDescription = more })
            }
        }
        FlowRow(
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (stage == DeliveryStage.WAITING) {
                if (canManage) {
                    val hasDriver = order.driverId != null || order.externalDriverName != null
                    TozzoButton(
                        stringResource(if (hasDriver) R.string.deliveries_edit_driver else R.string.deliveries_assign),
                        { actions.onOpenAssign(order) },
                        variant = ButtonVariant.Outline,
                    )
                }
                ViewButton(order, actions)
                TozzoButton(
                    stringResource(R.string.deliveries_start),
                    { actions.onStart(order) },
                    enabled = order.items.isNotEmpty(),
                )
            } else {
                if (canManage) {
                    TozzoButton(
                        stringResource(R.string.deliveries_back),
                        { actions.onBack(order) },
                        variant = ButtonVariant.Outline,
                    )
                }
                ViewButton(order, actions)
                if (canManage) TozzoButton(stringResource(R.string.deliveries_finish), { actions.onOpenFinish(order) })
            }
        }
    }
}

@Composable
private fun ViewButton(
    order: OrderView,
    actions: DeliveriesActions,
) = TozzoButton(
    stringResource(R.string.deliveries_view),
    { actions.onView(order.id) },
    variant = ButtonVariant.Outline,
)

/** "Entregador: {name} · {phone}"; an internal driver has no phone in the local data. */
@Composable
private fun driverLine(
    order: OrderView,
    notInformed: String,
): String {
    val name = order.driverName ?: order.externalDriverName?.takeIf { it.isNotBlank() } ?: notInformed
    val phone = order.externalDriverPhone?.takeIf { order.driverId == null && it.isNotBlank() }
    return stringResource(R.string.deliveries_driver_line, if (phone == null) name else "$name · $phone")
}

@Composable
private fun ItemLine(item: OrderItemView) {
    val ready = item.status == ItemStatus.READY || item.status == ItemStatus.DELIVERED
    val status =
        stringResource(if (ready) R.string.item_status_ready else R.string.item_status_in_preparation)
    val name = item.productName ?: stringResource(R.string.kitchen_unavailable_product)
    Text("${item.quantity}x $name · $status", style = MaterialTheme.typography.bodyMedium)
}

/** "Itens ainda não estão prontos": the pending items, and the confirmation that sends them out ready. */
@Composable
private fun ConfirmStartDialog(
    order: OrderView,
    actions: DeliveriesActions,
) {
    AlertDialog(
        onDismissRequest = actions.onDismissConfirm,
        title = { Text(stringResource(R.string.deliveries_confirm_ready_title)) },
        shape = MaterialTheme.shapes.medium,
        containerColor = MaterialTheme.colorScheme.surface,
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                order.pendingItems().forEach {
                    val name = it.productName ?: stringResource(R.string.kitchen_unavailable_product)
                    Text("${it.quantity}x $name", style = MaterialTheme.typography.titleSmall)
                }
                Text(
                    stringResource(R.string.deliveries_confirm_ready_description),
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
        },
        confirmButton = {
            TozzoButton(stringResource(R.string.deliveries_confirm_ready_action), actions.onConfirmStart)
        },
        dismissButton = {
            TozzoButton(
                stringResource(R.string.common_cancel),
                actions.onDismissConfirm,
                variant = ButtonVariant.Ghost,
            )
        },
    )
}

/** "Finalizar entrega": the payment method, then the close that generates the sale. */
@Composable
private fun FinishDialog(
    order: OrderView,
    error: DeliveryError?,
    actions: DeliveriesActions,
) {
    var payment by rememberSaveable { mutableStateOf<PaymentMethod?>(null) }
    AlertDialog(
        onDismissRequest = actions.onCloseFinish,
        title = { Text(stringResource(R.string.deliveries_finish_title)) },
        shape = MaterialTheme.shapes.medium,
        containerColor = MaterialTheme.colorScheme.surface,
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(stringResource(R.string.deliveries_finish_description))
                Text(stringResource(R.string.payment_method_label), style = MaterialTheme.typography.labelLarge)
                PaymentMethodSelector(payment, { payment = it }, allowNone = true)
                if (error == DeliveryError.CLOSE_FAILED) {
                    Text(stringResource(error.messageRes()), color = MaterialTheme.colorScheme.error)
                }
            }
        },
        confirmButton = {
            Row {
                TozzoButton(stringResource(R.string.deliveries_confirm_finish), { actions.onFinish(order, payment) })
            }
        },
        dismissButton = {
            TozzoButton(
                stringResource(R.string.common_cancel),
                actions.onCloseFinish,
                variant = ButtonVariant.Ghost,
            )
        },
    )
}
