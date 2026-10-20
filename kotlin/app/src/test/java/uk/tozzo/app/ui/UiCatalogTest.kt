package uk.tozzo.app.ui

import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import uk.tozzo.app.ui.catalog.UiCatalogScreen
import uk.tozzo.app.ui.components.TozzoButton
import uk.tozzo.app.ui.theme.TozzoTheme

@RunWith(RobolectricTestRunner::class)
class UiCatalogTest {
    @get:Rule
    val rule = createComposeRule()

    private val samples =
        listOf("Primary", "Outline", "Destructive", "Ghost", "Required field", "Card content", "Nothing here")

    private fun assertCatalogShowsSamples(dark: Boolean) {
        rule.setContent { TozzoTheme(darkTheme = dark) { UiCatalogScreen() } }
        samples.forEach { rule.onNodeWithText(it).assertExists() }
    }

    @Test
    fun catalogRendersInLightTheme() = assertCatalogShowsSamples(dark = false)

    @Test
    fun catalogRendersInDarkTheme() = assertCatalogShowsSamples(dark = true)

    @Test
    fun loadingButtonDoesNotClick() {
        var clicks = 0
        rule.setContent {
            TozzoTheme { TozzoButton(text = "Save", onClick = { clicks++ }, loading = true) }
        }
        rule.onNodeWithText("Save").performClick()
        assertEquals(0, clicks)
    }

    @Test
    fun enabledButtonClicks() {
        var clicks = 0
        rule.setContent {
            TozzoTheme { TozzoButton(text = "Save", onClick = { clicks++ }) }
        }
        rule.onNodeWithText("Save").performClick()
        assertEquals(1, clicks)
    }
}
