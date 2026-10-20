package uk.tozzo.app.feature.products

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import uk.tozzo.app.R
import uk.tozzo.app.ui.components.ButtonVariant
import uk.tozzo.app.ui.components.TozzoButton
import uk.tozzo.app.ui.components.TozzoTextField

/**
 * The colours a type can take: no free picker on a phone. They include the API's default grey, black (the
 * web form's default) and the four state colours of `TozzoColors` (success, warning, danger, info).
 */
val TYPE_COLOR_PALETTE: List<String> =
    listOf(
        "#9E9E9E",
        "#000000",
        "#10B981",
        "#F59E0B",
        "#EF4444",
        "#3B82F6",
        "#8B5CF6",
        "#EC4899",
        "#14B8A6",
        "#F97316",
        "#795548",
        "#607D8B",
    )

private const val MAX_DESCRIPTION = 120

/** Create or edit one product type, full screen: a description and a colour from the fixed palette. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ProductTypeFormScreen(
    state: TypeFormState,
    onChange: ((TypeFormState) -> TypeFormState) -> Unit,
    onSave: () -> Unit,
    onCancel: () -> Unit,
) {
    // A type made on the web may have a colour outside the palette: it stays selectable until another is picked.
    val colors = if (state.color in TYPE_COLOR_PALETTE) TYPE_COLOR_PALETTE else TYPE_COLOR_PALETTE + state.color
    FormColumn {
        Text(
            stringResource(
                if (state.id ==
                    null
                ) {
                    R.string.products_add_type_title
                } else {
                    R.string.products_edit_type_title
                },
            ),
            style = MaterialTheme.typography.titleLarge,
        )
        TozzoTextField(
            value = state.description,
            onValueChange = {
                onChange { s ->
                    s.copy(description = it.take(MAX_DESCRIPTION), descriptionError = false)
                }
            },
            label = stringResource(R.string.products_field_description),
            error = stringResource(R.string.products_required).takeIf { state.descriptionError },
        )
        Text(stringResource(R.string.products_field_color), style = MaterialTheme.typography.labelLarge)
        FlowRow(
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            colors.forEach { hex ->
                ColorSwatch(hex, selected = hex == state.color) { onChange { it.copy(color = hex) } }
            }
        }
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
                loading = state.saving,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun ColorSwatch(
    hex: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    Surface(
        selected = selected,
        onClick = onClick,
        modifier = Modifier.size(44.dp).semantics { contentDescription = hex },
        shape = MaterialTheme.shapes.medium,
        color = parseTypeColor(hex, Color.Gray),
        border = BorderStroke(if (selected) 4.dp else 1.dp, MaterialTheme.colorScheme.outline),
    ) {}
}
