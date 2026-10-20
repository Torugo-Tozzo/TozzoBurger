package uk.tozzo.app.ui

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource

/** A string resource with its format arguments, so view models never touch a Context. */
data class UiText(
    @param:StringRes val res: Int,
    val args: List<Any> = emptyList(),
) {
    @Composable
    fun asString(): String = stringResource(res, *args.toTypedArray())
}
