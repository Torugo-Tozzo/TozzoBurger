package uk.tozzo.app.ui.components

import androidx.compose.material3.LocalTextStyle
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalLocale
import androidx.compose.ui.text.TextStyle
import uk.tozzo.app.domain.Money

/** [cents] as BRL, written the way the app's locale writes currency. */
@Composable
fun MoneyText(
    cents: Long,
    modifier: Modifier = Modifier,
    style: TextStyle = LocalTextStyle.current,
    color: Color = Color.Unspecified,
) {
    val locale = LocalLocale.current.platformLocale
    Text(Money.format(cents, locale), modifier = modifier, style = style, color = color)
}
