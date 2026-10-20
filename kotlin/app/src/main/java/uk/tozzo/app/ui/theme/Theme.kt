package uk.tozzo.app.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.dp

private val LightScheme =
    lightColorScheme(
        primary = LightForeground,
        onPrimary = LightBackground,
        background = LightBackground,
        onBackground = LightForeground,
        surface = LightBackground,
        onSurface = LightForeground,
        surfaceVariant = LightMuted,
        onSurfaceVariant = LightMutedForeground,
        outline = LightBorder,
        outlineVariant = LightBorder,
        error = Destructive,
        onError = LightBackground,
    )

private val DarkScheme =
    darkColorScheme(
        primary = DarkForeground,
        onPrimary = DarkBackground,
        background = DarkBackground,
        onBackground = DarkForeground,
        surface = DarkBackground,
        onSurface = DarkForeground,
        surfaceVariant = DarkMuted,
        onSurfaceVariant = DarkMutedForeground,
        outline = DarkBorder,
        outlineVariant = DarkBorder,
        error = Destructive,
        onError = DarkForeground,
    )

private val TozzoShapes =
    Shapes(
        extraSmall = RoundedCornerShape(8.dp),
        small = RoundedCornerShape(8.dp),
        medium = RoundedCornerShape(8.dp),
        large = RoundedCornerShape(8.dp),
        extraLarge = RoundedCornerShape(8.dp),
    )

@Composable
fun TozzoTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkScheme else LightScheme,
        typography = TozzoTypography,
        shapes = TozzoShapes,
        content = content,
    )
}
