package uk.tozzo.app.feature.products

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLocale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.OffsetMapping
import androidx.compose.ui.text.input.TransformedText
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import uk.tozzo.app.R
import uk.tozzo.app.domain.Money
import uk.tozzo.app.domain.ProductType
import uk.tozzo.app.ui.components.ButtonVariant
import uk.tozzo.app.ui.components.TozzoButton
import uk.tozzo.app.ui.components.TozzoTextField
import uk.tozzo.app.ui.components.TypeChip
import uk.tozzo.app.ui.components.typeLabel
import java.text.DecimalFormatSymbols

private const val MAX_PRICE_DIGITS = 10
private const val MAX_NAME = 200
private const val MAX_INGREDIENTS = 2000

/** Create or edit one product, full screen. The image is only offered while editing, and only online. */
@OptIn(ExperimentalLayoutApi::class)
@Suppress("LongMethod")
@Composable
fun ProductFormScreen(
    state: ProductFormState,
    types: List<ProductType>,
    online: Boolean,
    onChange: ((ProductFormState) -> ProductFormState) -> Unit,
    onSave: () -> Unit,
    onCancel: () -> Unit,
    onPickImage: () -> Unit,
) {
    val required = stringResource(R.string.products_required)
    val uploading = state.upload == ImageUploadState.Uploading
    FormColumn {
        Text(
            stringResource(if (state.id == null) R.string.products_add_title else R.string.products_edit_title),
            style = MaterialTheme.typography.titleLarge,
        )
        TozzoTextField(
            value = state.name,
            onValueChange = { onChange { s -> s.copy(name = it.take(MAX_NAME), nameError = false) } },
            label = stringResource(R.string.products_field_name),
            error = required.takeIf { state.nameError },
        )
        TozzoTextField(
            value = state.priceDigits,
            onValueChange = { typed ->
                onChange { s -> s.copy(priceDigits = cleanPrice(typed, s.priceDigits), priceError = false) }
            },
            label = stringResource(R.string.products_field_price),
            error = required.takeIf { state.priceError },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            visualTransformation = rememberCentsTransformation(),
        )
        Text(stringResource(R.string.products_field_type), style = MaterialTheme.typography.labelLarge)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            TypeChip(
                stringResource(R.string.products_no_type),
                state.typeId == null,
                { onChange { it.copy(typeId = null) } },
            )
            // The inactive types are offered too, like the web, so a product can keep or take one.
            types.forEach { type ->
                val label = typeLabel(type)
                val text = if (type.isActive) label else "$label ${stringResource(R.string.products_inactive_suffix)}"
                TypeChip(text, state.typeId == type.id, { onChange { it.copy(typeId = type.id) } })
            }
        }
        TozzoTextField(
            value = state.ingredients,
            onValueChange = { onChange { s -> s.copy(ingredients = it.take(MAX_INGREDIENTS)) } },
            label = stringResource(R.string.products_field_ingredients),
        )
        ImageSection(state, online, uploading, onPickImage)
        if (state.saveError) {
            Text(stringResource(R.string.products_save_failed), color = MaterialTheme.colorScheme.error)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TozzoButton(
                text = stringResource(R.string.common_cancel),
                onClick = onCancel,
                variant = ButtonVariant.Outline,
                modifier = Modifier.weight(1f),
            )
            TozzoButton(
                text = stringResource(if (state.saving) R.string.common_saving else R.string.common_save),
                onClick = onSave,
                enabled = !state.loading && !uploading,
                loading = state.saving,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun ImageSection(
    state: ProductFormState,
    online: Boolean,
    uploading: Boolean,
    onPickImage: () -> Unit,
) {
    Text(stringResource(R.string.products_image_label), style = MaterialTheme.typography.labelLarge)
    if (state.id == null) {
        Text(stringResource(R.string.products_image_save_first), style = MaterialTheme.typography.bodyMedium)
        return
    }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        ProductImage(state.imageKey, stringResource(R.string.products_image_preview), Modifier.size(64.dp))
        // The upload needs the server: offline it stays disabled and says why right below.
        TozzoButton(
            text = stringResource(R.string.products_image_choose),
            onClick = onPickImage,
            enabled = online && !uploading && !state.saving && !state.loading,
            variant = ButtonVariant.Outline,
        )
        if (uploading) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
    }
    if (!online) {
        Text(stringResource(R.string.products_image_offline), style = MaterialTheme.typography.bodyMedium)
    }
    uploadStateMessage(state.upload)?.let { message ->
        val failed = state.upload is ImageUploadState.Failed
        Text(
            stringResource(message),
            color = if (failed) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface,
        )
    }
}

/** What a price field holds after [typed]: only digits, no leading zeros, at most the 10 the API takes. */
internal fun cleanPrice(
    typed: String,
    previous: String,
): String {
    val digits = typed.filter { it in '0'..'9' }
    val trimmed = digits.trimStart('0')
    return when {
        trimmed.length > MAX_PRICE_DIGITS -> previous
        trimmed.isEmpty() && digits.isNotEmpty() -> "0"
        else -> trimmed
    }
}

/** Shows the digits as an amount typed from the cents ("1250" as 12.50), with the locale's decimal sign. */
@Composable
private fun rememberCentsTransformation(): VisualTransformation {
    val locale = LocalLocale.current.platformLocale
    return remember(locale) {
        val sign = DecimalFormatSymbols.getInstance(locale).decimalSeparator
        VisualTransformation { text ->
            val shown =
                if (text.isEmpty()) {
                    ""
                } else {
                    Money.centsToDecimal(Money.centsFromInput(text.text)).replace('.', sign)
                }
            TransformedText(
                AnnotatedString(shown),
                object : OffsetMapping {
                    // The cursor always sits at the end: digits are only appended or removed there.
                    override fun originalToTransformed(offset: Int) = shown.length

                    override fun transformedToOriginal(offset: Int) = text.length
                },
            )
        }
    }
}

/** The scrolling column of the full-screen forms. */
@Composable
internal fun FormColumn(content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        content = content,
    )
}
