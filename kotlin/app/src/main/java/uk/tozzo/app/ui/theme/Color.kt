package uk.tozzo.app.ui.theme

import androidx.compose.ui.graphics.Color

internal val LightBackground = Color(0xFFFFFFFF)
internal val LightForeground = Color(0xFF000000)
internal val LightMuted = Color(0xFFF5F5F5)
internal val LightMutedForeground = Color(0xFF454545)
internal val LightBorder = Color(0xFF000000)

internal val DarkBackground = Color(0xFF161616)
internal val DarkForeground = Color(0xFFFFFFFF)
internal val DarkMuted = Color(0xFF2D2D2D)
internal val DarkMutedForeground = Color(0xFFBABABA)
internal val DarkBorder = Color(0xFFFFFFFF)

// hsl(0 84.2% 60.2%)
internal val Destructive = Color(0xFFEF4444)

/** Semantic state colors, identical in light and dark themes. */
object TozzoColors {
    val success = Color(0xFF10B981)
    val warning = Color(0xFFF59E0B)
    val danger = Color(0xFFEF4444)
    val info = Color(0xFF3B82F6)
}
