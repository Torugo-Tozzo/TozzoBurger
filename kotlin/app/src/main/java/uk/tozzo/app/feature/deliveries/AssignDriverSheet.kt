package uk.tozzo.app.feature.deliveries

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import uk.tozzo.app.R
import uk.tozzo.app.core.data.Driver
import uk.tozzo.app.core.data.OrderView
import uk.tozzo.app.ui.components.ButtonVariant
import uk.tozzo.app.ui.components.TozzoButton
import uk.tozzo.app.ui.components.TozzoTextField
import uk.tozzo.app.ui.components.TypeChip

private const val MAX_NAME = 120
private const val MAX_PHONE = 40

/** What the sheet asks of the view model. */
data class AssignActions(
    val onDriver: (String) -> Unit,
    val onExternal: (String, String?) -> Unit,
    val onRemove: () -> Unit,
    val onDismiss: () -> Unit,
)

/**
 * Chooses the driver of a waiting order: a registered one who is available ("Entregador fixo") or a third party
 * with a name and an optional contact ("Terceirizado"). A busy driver cannot be chosen.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AssignDriverSheet(
    order: OrderView,
    drivers: List<Driver>,
    error: DeliveryError?,
    actions: AssignActions,
) {
    var external by rememberSaveable { mutableStateOf(order.driverId == null && order.externalDriverName != null) }
    var selected by rememberSaveable { mutableStateOf(order.driverId) }
    var name by rememberSaveable { mutableStateOf(order.externalDriverName.orEmpty()) }
    var phone by rememberSaveable { mutableStateOf(order.externalDriverPhone.orEmpty()) }
    ModalBottomSheet(
        onDismissRequest = actions.onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        shape = MaterialTheme.shapes.medium,
        containerColor = MaterialTheme.colorScheme.surface,
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(stringResource(R.string.deliveries_assign_title), style = MaterialTheme.typography.titleLarge)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TypeChip(stringResource(R.string.deliveries_fixed_driver), !external, { external = false })
                TypeChip(stringResource(R.string.deliveries_external_driver), external, { external = true })
            }
            if (external) {
                TozzoTextField(
                    name,
                    { name = it.take(MAX_NAME) },
                    stringResource(R.string.deliveries_external_name),
                    error = if (error == DeliveryError.DRIVER_REQUIRED) stringResource(error.messageRes()) else null,
                )
                TozzoTextField(
                    phone,
                    { phone = it.take(MAX_PHONE) },
                    stringResource(R.string.deliveries_external_phone),
                )
            } else {
                DriverChoices(drivers, selected, order.driverId) { selected = it }
            }
            if (error != null && error != DeliveryError.DRIVER_REQUIRED) {
                Text(stringResource(error.messageRes()), color = MaterialTheme.colorScheme.error)
            }
            val canSave = if (external) name.isNotBlank() else selected != null
            TozzoButton(
                stringResource(R.string.deliveries_save_driver),
                {
                    if (external) actions.onExternal(name, phone.ifBlank { null }) else selected?.let(actions.onDriver)
                },
                Modifier.fillMaxWidth(),
                enabled = canSave,
            )
            if (order.driverId != null || order.externalDriverName != null) {
                TozzoButton(
                    stringResource(R.string.deliveries_remove_driver),
                    actions.onRemove,
                    Modifier.fillMaxWidth(),
                    variant = ButtonVariant.Outline,
                )
            }
        }
    }
}

/** The registered drivers; a busy one is dimmed and cannot be selected (the driver of this order always can). */
@Composable
private fun DriverChoices(
    drivers: List<Driver>,
    selected: String?,
    current: String?,
    onSelect: (String) -> Unit,
) {
    if (drivers.isEmpty()) Text(stringResource(R.string.deliveries_no_drivers))
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        drivers.forEach { driver ->
            val free = driver.available || driver.id == current
            val state = stringResource(if (free) R.string.deliveries_available else R.string.deliveries_busy)
            TypeChip(
                "${driver.name} · $state",
                selected == driver.id,
                { onSelect(driver.id) },
                enabled = free,
            )
        }
    }
}
