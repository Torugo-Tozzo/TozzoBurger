package uk.tozzo.app.domain

import java.math.BigDecimal
import java.text.NumberFormat
import java.util.Currency
import java.util.Locale

private const val CENT_SCALE = 2
private val DECIMAL = Regex("""\d+(\.\d+)?""")
private val BRL: Currency = Currency.getInstance("BRL")

/** Money is always `Long` cents; the database holds it as decimal text and `BigDecimal` is the only bridge. */
object Money {
    /** "12.5" -> 1250; null, blank, negative, not a decimal or with more than 2 places -> null. Never Double. */
    fun parseDecimalToCents(raw: String?): Long? {
        val text = raw?.trim()
        if (text.isNullOrEmpty() || !DECIMAL.matches(text)) return null
        val value = BigDecimal(text).stripTrailingZeros()
        return if (value.scale() > CENT_SCALE) {
            null
        } else {
            try {
                value.movePointRight(CENT_SCALE).longValueExact()
            } catch (_: ArithmeticException) {
                null
            }
        }
    }

    /** 1250 -> "12.50" (what the sync sends as numeric text). */
    fun centsToDecimal(cents: Long): String = BigDecimal.valueOf(cents, CENT_SCALE).toPlainString()

    /** Digits typed into a price field, as cents ("1250" -> 1250), like `centsFromInput` of the web. */
    fun centsFromInput(typed: String): Long = typed.filter { it in '0'..'9' }.toLongOrNull() ?: 0L

    /** BRL, written the way [locale] writes currency. */
    fun format(
        cents: Long,
        locale: Locale,
    ): String =
        NumberFormat
            .getCurrencyInstance(locale)
            .apply { currency = BRL }
            .format(BigDecimal.valueOf(cents, CENT_SCALE))
}
