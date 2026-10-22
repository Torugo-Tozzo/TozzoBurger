package uk.tozzo.app.ui.components

import androidx.annotation.StringRes
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import uk.tozzo.app.R
import uk.tozzo.app.domain.ProductType
import java.text.Normalizer
import java.util.Locale

private val ACCENTS = Regex("\\p{InCombiningDiacriticalMarks}+")
private val SEPARATORS = Regex("[\\s-]+")

/** Like `normalizeCode` of the web labels: no accents, spaces and hyphens as `_`, upper case. */
private fun normalizeCode(value: String): String =
    Normalizer
        .normalize(value, Normalizer.Form.NFD)
        .replace(ACCENTS, "")
        .trim()
        .replace(SEPARATORS, "_")
        .uppercase(Locale.ROOT)

/** The string of a type code the web translates (`getCatalogLabel`), or null for a name the user typed. */
@StringRes
fun catalogLabelRes(description: String): Int? =
    when (normalizeCode(description)) {
        "BURGER" -> R.string.catalog_burger
        "PIZZA" -> R.string.catalog_pizza
        "DRINK", "DRINKS" -> R.string.catalog_drink
        "FRIES" -> R.string.catalog_fries
        "DESSERT", "DESSERTS" -> R.string.catalog_dessert
        "SIDE", "SIDES" -> R.string.catalog_side
        "HOT_DOG", "HOTDOG" -> R.string.catalog_hot_dog
        "EXTRA" -> R.string.catalog_extra
        "OTHER" -> R.string.catalog_other
        else -> null
    }

/** The label of [type]: the translation of a known code, otherwise its description. */
@Composable
fun typeLabel(type: ProductType): String =
    catalogLabelRes(type.description)?.let { stringResource(it) } ?: type.description

/** A filter chip: 1 dp outline, 8 dp radius, filled when [selected]. */
@Composable
fun TypeChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
) {
    val scheme = MaterialTheme.colorScheme
    Surface(
        onClick = onClick,
        modifier = modifier.alpha(if (enabled) 1f else DISABLED_ALPHA),
        enabled = enabled,
        shape = MaterialTheme.shapes.medium,
        color = if (selected) scheme.primary else scheme.background,
        contentColor = if (selected) scheme.onPrimary else scheme.onBackground,
        border = BorderStroke(1.dp, scheme.outline),
    ) {
        Text(
            label,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            style = MaterialTheme.typography.labelLarge,
        )
    }
}

private const val DISABLED_ALPHA = 0.5f
