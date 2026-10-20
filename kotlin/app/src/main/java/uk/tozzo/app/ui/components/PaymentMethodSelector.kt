package uk.tozzo.app.ui.components

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import uk.tozzo.app.R
import uk.tozzo.app.domain.PaymentMethod

@StringRes
fun paymentMethodRes(method: PaymentMethod): Int =
    when (method) {
        PaymentMethod.CASH -> R.string.payment_cash
        PaymentMethod.PIX -> R.string.payment_pix
        PaymentMethod.CREDIT_CARD -> R.string.payment_credit_card
        PaymentMethod.DEBIT_CARD -> R.string.payment_debit_card
        PaymentMethod.ON_ACCOUNT -> R.string.payment_on_account
    }

/**
 * The payment methods as chips, in the order of [PaymentMethod]. With [allowNone] a first chip, "Not
 * specified", selects null (a direct sale may leave the payment out; closing an order may not).
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun PaymentMethodSelector(
    selected: PaymentMethod?,
    onSelect: (PaymentMethod?) -> Unit,
    modifier: Modifier = Modifier,
    allowNone: Boolean = false,
) {
    FlowRow(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (allowNone) {
            TypeChip(stringResource(R.string.payment_not_informed), selected == null, { onSelect(null) })
        }
        PaymentMethod.entries.forEach { method ->
            TypeChip(stringResource(paymentMethodRes(method)), selected == method, { onSelect(method) })
        }
    }
}
