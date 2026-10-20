package uk.tozzo.app.feature.products

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.junit4.ComposeContentTestRule
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import uk.tozzo.app.core.data.ManagedProduct
import uk.tozzo.app.domain.ProductType
import uk.tozzo.app.ui.theme.TozzoTheme

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "pt-rBR")
class ProductsScreenTest {
    @get:Rule
    val rule = createComposeRule()

    private val types =
        listOf(
            ProductType("t1", "Lanches", "#EF4444", true),
            ProductType("t2", "Sazonal", "#9E9E9E", false),
        )
    private val products =
        listOf(
            ManagedProduct("p1", "X-Burger", 1250, null, "t1", null),
            ManagedProduct("p2", "Sem preço", null, null, null, null),
        )
    private val deletedTypes = mutableListOf<String>()
    private val deletedProducts = mutableListOf<String>()

    private fun show(
        startTab: ProductsTab = ProductsTab.PRODUCTS,
        canEdit: Boolean = true,
    ) = rule.setContent {
        var tab by remember { mutableStateOf(startTab) }
        TozzoTheme {
            ProductsScreen(
                tab = tab,
                search = "",
                products = products,
                types = types,
                onTab = { tab = it },
                onSearch = {},
                onLoadMore = {},
                onNewProduct = {},
                onEditProduct = {},
                onDeleteProduct = { deletedProducts += it },
                onNewType = {},
                onEditType = {},
                onDeleteType = { deletedTypes += it },
                canEdit = canEdit,
            )
        }
    }

    @Test
    fun theTabsSwitchTheNewButton() {
        show()
        rule.onNodeWithText("Novo produto").assertExists()
        rule.onNodeWithText("Novo tipo").assertDoesNotExist()

        rule.onNodeWithText("Tipos").performClick()
        rule.onNodeWithText("Novo tipo").assertExists()
        rule.onNodeWithText("Novo produto").assertDoesNotExist()

        rule.onNodeWithText("Produtos").performClick()
        rule.onNodeWithText("Novo produto").assertExists()
    }

    @Test
    fun theInactiveTypeShowsWithItsSuffix() {
        show(ProductsTab.TYPES)
        rule.onNodeWithText("Lanches").assertExists()
        rule.onNodeWithText("Sazonal (inativo)").assertExists()
    }

    @Test
    fun aProductListsItsNameTypeAndPrice() {
        show()
        rule.onNodeWithText("X-Burger").assertExists()
        rule.onNodeWithText("Lanches").assertExists()
        rule.onNodeWithText("12,50", substring = true).assertExists()
    }

    @Test
    fun deletingATypeWarnsThatItsProductsGoToo() {
        show(ProductsTab.TYPES)
        rule.onNodeWithText("Lanches").assertExists()
        rule.onAllNodesWithTextFirst("Excluir").performClick()

        rule
            .onNodeWithText("Excluir este tipo também excluirá todos os produtos associados. Deseja continuar?")
            .assertExists()
        assertEquals(emptyList<String>(), deletedTypes)
        rule.onDialogConfirm("Excluir")

        assertEquals(listOf("t1"), deletedTypes)
    }

    @Test
    fun deletingAProductAsksFirst() {
        show()
        rule.onAllNodesWithTextFirst("Excluir").performClick()
        rule.onNodeWithText("Tem certeza que deseja excluir este produto?").assertExists()
        rule.onDialogConfirm("Excluir")

        assertEquals(listOf("p1"), deletedProducts)
    }

    @Test
    fun aReadOnlyViewHasNoNewEditOrDelete() {
        show(canEdit = false)
        rule.onNodeWithText("X-Burger").assertExists()
        rule.onNodeWithText("Novo produto").assertDoesNotExist()
        rule.onNodeWithText("Editar").assertDoesNotExist()
        rule.onNodeWithText("Excluir").assertDoesNotExist()

        rule.onNodeWithText("Tipos").performClick()
        rule.onNodeWithText("Sazonal (inativo)").assertExists()
        rule.onNodeWithText("Novo tipo").assertDoesNotExist()
        rule.onNodeWithText("Editar").assertDoesNotExist()
        rule.onNodeWithText("Excluir").assertDoesNotExist()
    }

    @Test
    fun anEditorSeesNewEditAndDelete() {
        show(canEdit = true)
        rule.onNodeWithText("Novo produto").assertExists()
        rule.onAllNodesWithText("Editar")[0].assertExists()
        rule.onAllNodesWithText("Excluir")[0].assertExists()
    }
}

private fun ComposeContentTestRule.onAllNodesWithTextFirst(text: String): SemanticsNodeInteraction =
    onAllNodesWithText(text)[0]

/** The dialog is composed after the screen, so its button is the last node with the text. */
private fun ComposeContentTestRule.onDialogConfirm(text: String) {
    val nodes = onAllNodesWithText(text)
    nodes[nodes.fetchSemanticsNodes().size - 1].performClick()
}
