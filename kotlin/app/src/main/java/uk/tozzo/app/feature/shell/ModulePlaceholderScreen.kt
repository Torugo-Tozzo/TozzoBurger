package uk.tozzo.app.feature.shell

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import uk.tozzo.app.R
import uk.tozzo.app.ui.components.EmptyState

/** Stands in for a module whose screens come in a later stage. */
@Composable
fun ModulePlaceholderScreen(
    @StringRes title: Int,
) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        EmptyState(title = stringResource(title), message = stringResource(R.string.module_coming_soon))
    }
}
