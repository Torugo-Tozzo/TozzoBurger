package uk.tozzo.app.domain

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import java.text.NumberFormat
import java.util.Currency
import java.util.Locale

class MoneyTest {
    @Test
    fun parsesDecimalTextToExactCents() {
        assertEquals(1250L, Money.parseDecimalToCents("12.5"))
        assertEquals(1250L, Money.parseDecimalToCents("12.50"))
        assertEquals(0L, Money.parseDecimalToCents("0"))
        assertEquals(123456789L, Money.parseDecimalToCents("1234567.89"))
        assertEquals(1999L, Money.parseDecimalToCents("19.99"))
    }

    @Test
    fun trailingZerosBeyondTwoPlacesAreStillExact() {
        assertEquals(1250L, Money.parseDecimalToCents("12.5000"))
    }

    @Test
    fun invalidIsNull() {
        assertNull(Money.parseDecimalToCents(null))
        assertNull(Money.parseDecimalToCents(""))
        assertNull(Money.parseDecimalToCents("   "))
        assertNull(Money.parseDecimalToCents("abc"))
        assertNull(Money.parseDecimalToCents("1e3"))
        assertNull(Money.parseDecimalToCents("-1.00"))
    }

    @Test
    fun moreThanTwoPlacesIsInvalidData() {
        assertNull(Money.parseDecimalToCents("12.345"))
    }

    @Test
    fun aValueBeyondLongIsNullNotACrash() {
        assertNull(Money.parseDecimalToCents("99999999999999999999.00"))
    }

    @Test
    fun centsToDecimalKeepsTwoPlaces() {
        assertEquals("0.05", Money.centsToDecimal(5))
        assertEquals("12.50", Money.centsToDecimal(1250))
        assertEquals("0.00", Money.centsToDecimal(0))
        assertEquals("1234567.89", Money.centsToDecimal(123456789))
    }

    @Test
    fun centsFromInputKeepsOnlyDigits() {
        assertEquals(1250L, Money.centsFromInput("12a50"))
        assertEquals(1250L, Money.centsFromInput("1250"))
        assertEquals(5L, Money.centsFromInput("0005"))
        assertEquals(0L, Money.centsFromInput(""))
        assertEquals(0L, Money.centsFromInput("abc"))
    }

    @Test
    fun formatsInBrlWhateverTheLocale() {
        val pt =
            Locale
                .Builder()
                .setLanguage("pt")
                .setRegion("BR")
                .build()
        val expectedPt = NumberFormat.getCurrencyInstance(pt).apply { currency = Currency.getInstance("BRL") }
        assertEquals(expectedPt.format(12.50), Money.format(1250, pt))
        val formatted = Money.format(1250, pt)
        assertEquals(true, formatted.startsWith("R$") && formatted.endsWith("12,50"), formatted)

        val expectedUs = NumberFormat.getCurrencyInstance(Locale.US).apply { currency = Currency.getInstance("BRL") }
        assertEquals(expectedUs.format(12.50), Money.format(1250, Locale.US))
        assertEquals(true, Money.format(1250, Locale.US).contains("R$"))
    }
}
