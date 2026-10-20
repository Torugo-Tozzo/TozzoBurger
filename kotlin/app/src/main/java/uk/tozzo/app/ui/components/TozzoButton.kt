@file:Suppress("MatchingDeclarationName")

package uk.tozzo.app.ui.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

enum class ButtonVariant { Primary, Outline, Destructive, Ghost }

@Composable
fun TozzoButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    variant: ButtonVariant = ButtonVariant.Primary,
    enabled: Boolean = true,
    loading: Boolean = false,
) {
    val scheme = MaterialTheme.colorScheme
    val colors =
        when (variant) {
            ButtonVariant.Primary -> ButtonDefaults.buttonColors()
            ButtonVariant.Outline ->
                ButtonDefaults.buttonColors(containerColor = scheme.background, contentColor = scheme.onBackground)
            ButtonVariant.Destructive ->
                ButtonDefaults.buttonColors(containerColor = scheme.error, contentColor = scheme.onError)
            ButtonVariant.Ghost ->
                ButtonDefaults.buttonColors(containerColor = scheme.background, contentColor = scheme.onBackground)
        }
    val border = if (variant == ButtonVariant.Outline) BorderStroke(1.dp, scheme.outline) else null
    Button(
        onClick = onClick,
        modifier = modifier.heightIn(min = 40.dp),
        enabled = enabled && !loading,
        shape = MaterialTheme.shapes.medium,
        colors =
            colors.copy(
                disabledContainerColor = colors.containerColor,
                disabledContentColor = colors.contentColor.copy(alpha = DISABLED_ALPHA),
            ),
        border = border,
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
            if (loading) {
                CircularProgressIndicator(
                    modifier = Modifier.size(16.dp),
                    strokeWidth = 2.dp,
                    color = colors.contentColor,
                )
            }
            Text(text)
        }
    }
}

private const val DISABLED_ALPHA = 0.5f
