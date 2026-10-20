package uk.tozzo.app.feature.products

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import uk.tozzo.app.ui.theme.TozzoColors

class ProductTypeFormTest {
    private fun hex(color: Color) = "#%06X".format(color.toArgb() and 0xFFFFFF)

    @Test
    fun thePaletteHasTwelveDistinctColorsWithTheGreyAndTheStateColors() {
        assertEquals(12, TYPE_COLOR_PALETTE.size)
        assertEquals(12, TYPE_COLOR_PALETTE.toSet().size)
        assertTrue("#9E9E9E" in TYPE_COLOR_PALETTE)
        listOf(TozzoColors.success, TozzoColors.warning, TozzoColors.danger, TozzoColors.info).forEach {
            assertTrue(hex(it) in TYPE_COLOR_PALETTE, "missing ${hex(it)}")
        }
    }

    @Test
    fun typeColorsParseBothApiFormats() {
        val grey = Color(0xFF9E9E9E)
        assertEquals(Color(0xFFEF4444), parseTypeColor("#EF4444", grey))
        assertEquals(Color(0x80EF4444), parseTypeColor("#EF444480", grey))
        assertEquals(grey, parseTypeColor("red", grey))
        assertEquals(grey, parseTypeColor(null, grey))
    }

    @Test
    fun aPriceFieldKeepsOnlyDigitsWithinTheApiRange() {
        assertEquals("1250", cleanPrice("12.50", ""))
        assertEquals("5", cleanPrice("005", ""))
        assertEquals("0", cleanPrice("000", ""))
        assertEquals("", cleanPrice("", "12"))
        assertEquals("9999999999", cleanPrice("9999999999", ""))
        assertEquals("9999999999", cleanPrice("99999999999", "9999999999"))
    }
}
