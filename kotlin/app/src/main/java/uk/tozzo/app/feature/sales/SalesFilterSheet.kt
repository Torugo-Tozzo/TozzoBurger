@file:Suppress("MatchingDeclarationName")

package uk.tozzo.app.feature.sales

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import uk.tozzo.app.R
import uk.tozzo.app.domain.Money
import uk.tozzo.app.ui.components.ButtonVariant
import uk.tozzo.app.ui.components.TozzoButton
import uk.tozzo.app.ui.components.TozzoTextField

/** What the filter sheet asks of the view model; [onApply] says whether the form was accepted. */
data class SalesFilterActions(
    val onFromDate: (String) -> Unit,
    val onFromTime: (String) -> Unit,
    val onToDate: (String) -> Unit,
    val onToTime: (String) -> Unit,
    val onCustomer: (String) -> Unit,
    val onSeller: (String) -> Unit,
    val onMin: (String) -> Unit,
    val onMax: (String) -> Unit,
    val onApply: () -> Boolean,
    val onClear: () -> Unit,
    val onDismiss: () -> Unit,
)

/** The period (date and time, start and end), customer, seller and amounts; they apply only on "Aplicar". */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SalesFilterSheet(
    form: SalesFilterForm,
    hasError: Boolean,
    actions: SalesFilterActions,
) {
    ModalBottomSheet(
        onDismissRequest = actions.onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        shape = MaterialTheme.shapes.medium,
        containerColor = MaterialTheme.colorScheme.surface,
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(stringResource(R.string.sales_filters), style = MaterialTheme.typography.titleLarge)
            PeriodFields(form, actions)
            if (hasError) {
                Text(stringResource(R.string.sales_filter_invalid), color = MaterialTheme.colorScheme.error)
            }
            TozzoTextField(form.customer, actions.onCustomer, stringResource(R.string.cart_customer))
            TozzoTextField(form.seller, actions.onSeller, stringResource(R.string.orders_filter_seller))
            AmountFields(form, actions)
            TozzoButton(
                stringResource(R.string.sales_apply),
                { if (actions.onApply()) actions.onDismiss() },
                Modifier.fillMaxWidth(),
            )
            TozzoButton(
                stringResource(R.string.sales_clear),
                {
                    actions.onClear()
                    actions.onDismiss()
                },
                Modifier.fillMaxWidth(),
                variant = ButtonVariant.Outline,
            )
        }
    }
}

private fun Long?.masked(): String = this?.let { Money.centsToDecimal(it) }.orEmpty()

private val numbers = KeyboardOptions(keyboardType = KeyboardType.Number)

@Composable
private fun PeriodFields(
    form: SalesFilterForm,
    actions: SalesFilterActions,
) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        TozzoTextField(
            form.fromDate,
            actions.onFromDate,
            stringResource(R.string.sales_date_from),
            Modifier.weight(1f),
            keyboardOptions = numbers,
        )
        TozzoTextField(
            form.fromTime,
            actions.onFromTime,
            stringResource(R.string.sales_time_from),
            Modifier.weight(1f),
            keyboardOptions = numbers,
        )
    }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        TozzoTextField(
            form.toDate,
            actions.onToDate,
            stringResource(R.string.sales_date_to),
            Modifier.weight(1f),
            keyboardOptions = numbers,
        )
        TozzoTextField(
            form.toTime,
            actions.onToTime,
            stringResource(R.string.sales_time_to),
            Modifier.weight(1f),
            keyboardOptions = numbers,
        )
    }
}

@Composable
private fun AmountFields(
    form: SalesFilterForm,
    actions: SalesFilterActions,
) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        TozzoTextField(
            form.minCents.masked(),
            actions.onMin,
            stringResource(R.string.orders_filter_min),
            Modifier.weight(1f),
            keyboardOptions = numbers,
        )
        TozzoTextField(
            form.maxCents.masked(),
            actions.onMax,
            stringResource(R.string.orders_filter_max),
            Modifier.weight(1f),
            keyboardOptions = numbers,
        )
    }
}
