package uk.tozzo.app.ui.catalog

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import uk.tozzo.app.ui.components.ButtonVariant
import uk.tozzo.app.ui.components.ConfirmDialog
import uk.tozzo.app.ui.components.EmptyState
import uk.tozzo.app.ui.components.LoadingState
import uk.tozzo.app.ui.components.TozzoButton
import uk.tozzo.app.ui.components.TozzoCard
import uk.tozzo.app.ui.components.TozzoTextField

/** Developer-only gallery of the base components; texts are hardcoded on purpose (debug source set). */
@Composable
fun UiCatalogScreen() {
    var text by remember { mutableStateOf("") }
    var showDialog by remember { mutableStateOf(false) }
    Surface {
        Column(
            modifier = Modifier.verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            ButtonVariant.entries.forEach { variant ->
                TozzoButton(text = variant.name, onClick = {}, variant = variant)
            }
            TozzoButton(text = "Loading", onClick = {}, loading = true)
            TozzoButton(text = "Open dialog", onClick = { showDialog = true })
            TozzoTextField(value = text, onValueChange = { text = it }, label = "Name", error = "Required field")
            TozzoCard { Text("Card content") }
            EmptyState(title = "Nothing here", message = "Add the first item")
            LoadingState(message = "Loading data")
        }
        if (showDialog) {
            ConfirmDialog(
                title = "Delete item",
                message = "This cannot be undone.",
                confirmText = "Delete",
                onConfirm = { showDialog = false },
                onDismiss = { showDialog = false },
                destructive = true,
            )
        }
    }
}
