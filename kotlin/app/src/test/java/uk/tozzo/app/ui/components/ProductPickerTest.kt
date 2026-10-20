package uk.tozzo.app.ui.components

import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import uk.tozzo.app.domain.Money
import uk.tozzo.app.domain.Product
import uk.tozzo.app.domain.ProductType
import uk.tozzo.app.ui.theme.TozzoTheme
import java.util.Locale

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "pt-rBR")
class ProductPickerTest {
    @get:Rule
    val rule = createComposeRule()

    private val types =
        listOf(ProductType("t1", "BURGER", null, true), ProductType("t2", "Combos da casa", null, true))
    private val burger = Product("p1", "X-Burger", 2050, null, "t1", null)

    private fun show(
        typeId: String? = "t1",
        onType: (String?) -> Unit = {},
        onAdd: (Product) -> Unit = {},
    ) = rule.setContent {
        TozzoTheme {
            ProductPicker(types, listOf(burger), "", typeId, onSearch = {}, onType = onType, onAdd = onAdd)
        }
    }

    @Test
    fun tappingAProductAddsIt() {
        val added = mutableListOf<Product>()
        show(onAdd = { added += it })

        rule.onNodeWithText("X-Burger").performClick()

        assertEquals(listOf(burger), added)
    }

    @Test
    fun showsThePriceInBrl() {
        show()

        rule
            .onNodeWithText(
                Money.format(
                    2050,
                    Locale
                        .Builder()
                        .setLanguage("pt")
                        .setRegion("BR")
                        .build(),
                ),
            ).assertExists()
    }

    @Test
    fun theAllChipClearsTheType() {
        val chosen = mutableListOf<String?>("start")
        show(onType = { chosen += it })

        rule.onNodeWithText("Todas").performClick()

        assertEquals(listOf("start", null), chosen)
    }

    @Test
    fun typeChipsTranslateKnownCodesAndKeepOtherDescriptions() {
        val chosen = mutableListOf<String?>()
        show(typeId = null, onType = { chosen += it })

        rule.onNodeWithText("BURGER").assertDoesNotExist()
        rule.onNodeWithText("Hambúrguer").performClick()
        rule.onNodeWithText("Combos da casa").performClick()

        assertEquals(listOf<String?>("t1", "t2"), chosen)
    }

    @Test
    fun emptyListShowsTheEmptyMessage() {
        rule.setContent {
            TozzoTheme { ProductPicker(types, emptyList(), "", null, {}, {}, {}) }
        }

        rule.onNodeWithText("Nenhum produto encontrado.").assertExists()
    }
}
