package uk.tozzo.app.feature.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uk.tozzo.app.BuildConfig
import uk.tozzo.app.R
import uk.tozzo.app.ui.components.ButtonVariant
import uk.tozzo.app.ui.components.ConfirmDialog
import uk.tozzo.app.ui.components.TozzoButton
import uk.tozzo.app.ui.components.TozzoCard

/** Gets the [SettingsViewModel] and reports when the device was unbound. */
@Composable
fun SettingsRoute(
    onUnbound: () -> Unit,
    viewModel: SettingsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(viewModel) { viewModel.unbound.collect { onUnbound() } }
    SettingsScreen(state, BuildConfig.VERSION_NAME, viewModel::unbind)
}

@Composable
fun SettingsScreen(
    state: SettingsUiState,
    versionName: String,
    onUnbind: () -> Unit,
) {
    // 0 = no dialog, 1 = the usual confirmation, 2 = the extra one when rejections would be deleted.
    var step by rememberSaveable { mutableIntStateOf(0) }
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        TozzoCard {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Field(stringResource(R.string.settings_user), state.userName)
                Field(stringResource(R.string.settings_establishment), state.establishmentName)
                Field(stringResource(R.string.settings_version), versionName)
            }
        }
        TozzoButton(
            text = stringResource(R.string.settings_unbind),
            onClick = { step = 1 },
            modifier = Modifier.fillMaxWidth(),
            variant = ButtonVariant.Destructive,
            enabled = state.canUnbind,
        )
        state.unbindBlockedReason?.let {
            Text(
                stringResource(it),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        state.unbindError?.let {
            Text(
                stringResource(it),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
        }
    }
    UnbindDialogs(step, state.rejections, onStep = { step = it }, onUnbind = onUnbind)
}

/** The unbind confirmation ([step] 1) and, when rejections would be deleted, the extra one ([step] 2). */
@Composable
private fun UnbindDialogs(
    step: Int,
    rejections: Int,
    onStep: (Int) -> Unit,
    onUnbind: () -> Unit,
) {
    if (step == 1) {
        ConfirmDialog(
            title = stringResource(R.string.settings_unbind_confirm_title),
            message = stringResource(R.string.settings_unbind_confirm_message),
            confirmText = stringResource(R.string.settings_unbind_confirm),
            onConfirm = {
                if (rejections > 0) {
                    onStep(2)
                } else {
                    onStep(0)
                    onUnbind()
                }
            },
            onDismiss = { onStep(0) },
            destructive = true,
        )
    }
    if (step == 2) {
        ConfirmDialog(
            title = stringResource(R.string.settings_unbind_rejections_title),
            message = pluralStringResource(R.plurals.unbind_rejections_warning, rejections, rejections),
            confirmText = stringResource(R.string.settings_unbind_rejections_confirm),
            onConfirm = {
                onStep(0)
                onUnbind()
            },
            onDismiss = { onStep(0) },
            destructive = true,
        )
    }
}

@Composable
private fun Field(
    label: String,
    value: String,
) {
    Column {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyLarge)
    }
}
