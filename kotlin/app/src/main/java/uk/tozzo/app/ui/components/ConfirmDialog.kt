package uk.tozzo.app.ui.components

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource

/** Confirmation dialog; the cancel label is the platform's own localized "Cancel". */
@Composable
fun ConfirmDialog(
    title: String,
    message: String,
    confirmText: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
    destructive: Boolean = false,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(message) },
        shape = MaterialTheme.shapes.medium,
        containerColor = MaterialTheme.colorScheme.surface,
        confirmButton = {
            TozzoButton(
                text = confirmText,
                onClick = onConfirm,
                variant = if (destructive) ButtonVariant.Destructive else ButtonVariant.Primary,
            )
        },
        dismissButton = {
            TozzoButton(
                text = stringResource(android.R.string.cancel),
                onClick = onDismiss,
                variant = ButtonVariant.Ghost,
            )
        },
    )
}
