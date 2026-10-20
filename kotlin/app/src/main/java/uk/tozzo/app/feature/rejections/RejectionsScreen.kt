package uk.tozzo.app.feature.rejections

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uk.tozzo.app.R
import uk.tozzo.app.core.sync.SyncRejection
import uk.tozzo.app.core.sync.rejectionMessage
import uk.tozzo.app.core.sync.tableLabel
import uk.tozzo.app.ui.components.EmptyState
import uk.tozzo.app.ui.components.LoadingState
import uk.tozzo.app.ui.components.TozzoCard
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.time.format.FormatStyle

@Composable
fun RejectionsRoute(viewModel: RejectionsViewModel = hiltViewModel()) {
    val rejections by viewModel.rejections.collectAsStateWithLifecycle()
    RejectionsScreen(rejections)
}

/** The changes the server refused, newest first, explained in the app language; null while loading. */
@Composable
fun RejectionsScreen(rejections: List<SyncRejection>?) {
    when {
        rejections == null ->
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { LoadingState() }
        rejections.isEmpty() ->
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                EmptyState(title = stringResource(R.string.rejections_empty))
            }
        else ->
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(rejections, key = { it.id }) { RejectionRow(it) }
            }
    }
}

@Composable
private fun RejectionRow(rejection: SyncRejection) {
    val date = remember(rejection.createdAt) { formatInstant(rejection.createdAt) }
    val label = tableLabel(rejection.tableName)?.let { stringResource(it) } ?: rejection.tableName
    TozzoCard(modifier = Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(label, style = MaterialTheme.typography.titleSmall)
            Text(stringResource(rejectionMessage(rejection.code)), style = MaterialTheme.typography.bodyMedium)
            rejection.summary?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
            Text(date, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

/** Local short date and time; an unparseable value is shown as stored. */
private fun formatInstant(iso: String): String =
    try {
        DateTimeFormatter
            .ofLocalizedDateTime(FormatStyle.SHORT)
            .withZone(ZoneId.systemDefault())
            .format(Instant.parse(iso))
    } catch (_: DateTimeParseException) {
        iso
    }
