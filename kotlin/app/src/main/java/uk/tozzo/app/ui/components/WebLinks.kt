package uk.tozzo.app.ui.components

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import androidx.core.net.toUri
import uk.tozzo.app.BuildConfig

/** Opens [path] of the Tozzo website in the browser. */
fun Context.openWebPath(path: String) {
    val intent = Intent(Intent.ACTION_VIEW, (BuildConfig.WEB_BASE_URL + path).toUri())
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
        startActivity(intent)
    } catch (_: ActivityNotFoundException) {
        // no browser installed: nothing to open
    }
}
