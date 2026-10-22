package uk.tozzo.app.feature.sell

import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import uk.tozzo.app.domain.Product
import uk.tozzo.app.ui.theme.TozzoTheme

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "pt-rBR")
class SellScreenTest {
    @get:Rule
    val rule = createComposeRule()

    private val burger = Product("p1", "X-Burger", 1250, null, null, null)

    private fun show(
        cartCount: Int,
        onViewCart: () -> Unit = {},
        onAdd: (Product) -> Unit = {},
    ) = rule.setContent {
        TozzoTheme {
            SellScreen(
                types = emptyList(),
                products = listOf(burger),
                search = "",
                typeId = null,
                cartCount = cartCount,
                onSearch = {},
                onType = {},
                onAdd = onAdd,
                onViewCart = onViewCart,
            )
        }
    }

    @Test
    fun viewCartShowsTheItemCount() {
        show(cartCount = 3)

        rule.onNodeWithText("Ver conta (3)").assertExists()
    }

    @Test
    fun viewCartIsHiddenWithAnEmptyCart() {
        show(cartCount = 0)

        rule.onNodeWithText("Ver conta (0)").assertDoesNotExist()
    }

    @Test
    fun tappingViewCartOpensIt() {
        var opened = 0
        show(cartCount = 2, onViewCart = { opened++ })

        rule.onNodeWithText("Ver conta (2)").performClick()

        assertEquals(1, opened)
    }

    @Test
    fun tappingAProductAddsIt() {
        val added = mutableListOf<Product>()
        show(cartCount = 0, onAdd = { added += it })

        rule.onNodeWithText("X-Burger").performClick()

        assertEquals(listOf(burger), added)
    }
}
