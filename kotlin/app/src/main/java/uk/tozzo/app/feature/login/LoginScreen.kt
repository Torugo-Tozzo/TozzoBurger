package uk.tozzo.app.feature.login

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uk.tozzo.app.R
import uk.tozzo.app.ui.components.ButtonVariant
import uk.tozzo.app.ui.components.TozzoButton
import uk.tozzo.app.ui.components.TozzoTextField
import uk.tozzo.app.ui.components.openWebPath

/** Gets the [LoginViewModel] and forwards its one-shot events. */
@Composable
fun LoginRoute(
    onLoggedIn: () -> Unit,
    onNotice: (Notice) -> Unit,
    viewModel: LoginViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    LaunchedEffect(viewModel) { viewModel.loggedIn.collect { onLoggedIn() } }
    LaunchedEffect(state.notice) {
        state.notice?.let {
            onNotice(it)
            viewModel.dismissNotice()
        }
    }
    LoginScreen(state, viewModel::onEmail, viewModel::onPassword, viewModel::submit)
}

@Composable
fun LoginScreen(
    state: LoginUiState,
    onEmail: (String) -> Unit,
    onPassword: (String) -> Unit,
    onSubmit: () -> Unit,
) {
    val context = LocalContext.current
    Surface(modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
        ) {
            Text(stringResource(R.string.app_name), style = MaterialTheme.typography.displaySmall)
            TozzoTextField(
                value = state.email,
                onValueChange = onEmail,
                label = stringResource(R.string.login_email),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            )
            TozzoTextField(
                value = state.password,
                onValueChange = onPassword,
                label = stringResource(R.string.login_password),
                error = state.error?.asString(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                visualTransformation = PasswordVisualTransformation(),
            )
            TozzoButton(
                text = stringResource(R.string.login_submit),
                onClick = onSubmit,
                modifier = Modifier.fillMaxWidth(),
                loading = state.loading,
            )
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                TozzoButton(
                    text = stringResource(R.string.login_create_account),
                    onClick = { context.openWebPath("/register") },
                    variant = ButtonVariant.Ghost,
                )
                TozzoButton(
                    text = stringResource(R.string.login_forgot_password),
                    onClick = { context.openWebPath("/forgot-password") },
                    variant = ButtonVariant.Ghost,
                )
            }
        }
    }
}
