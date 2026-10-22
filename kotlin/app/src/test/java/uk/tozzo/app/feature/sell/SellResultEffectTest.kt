package uk.tozzo.app.feature.sell

import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import uk.tozzo.app.ui.theme.TozzoTheme

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "pt-rBR")
class SellResultEffectTest {
    @get:Rule
    val rule = createComposeRule()

    private fun show(
        first: SellResult,
        saleId: String? = null,
        onViewSale: (String) -> Unit = {},
    ) {
        rule.setContent {
            // Like the view model: the result is nulled as soon as it is consumed.
            var result by remember { mutableStateOf<SellResult?>(first) }
            val snackbar = remember { SnackbarHostState() }
            TozzoTheme {
                SellResultEffect(
                    result,
                    snackbar,
                    onConsumed = { result = null },
                    onSuccess = {},
                    saleId = saleId,
                    onViewSale = onViewSale,
                )
                SnackbarHost(snackbar)
            }
        }
    }

    @Test
    fun saleSnackbarStaysAfterTheResultIsConsumed() {
        show(SellResult.SALE_SAVED)

        rule.onNodeWithText("Venda registrada").assertExists()
    }

    @Test
    fun orderSnackbarStaysAfterTheResultIsConsumed() {
        show(SellResult.ORDER_CREATED)

        rule.onNodeWithText("Pedido criado").assertExists()
    }

    @Test
    fun failureSnackbarStaysAfterTheResultIsConsumed() {
        show(SellResult.FAILED)

        rule.onNodeWithText("Não foi possível salvar. Tente novamente.").assertExists()
    }

    @Test
    fun theSaleSnackbarOffersToViewTheSaleJustMade() {
        val opened = mutableListOf<String>()
        show(SellResult.SALE_SAVED, saleId = "sale-9", onViewSale = { opened += it })

        rule.onNodeWithText("Ver venda").performClick()
        rule.waitForIdle()

        org.junit.Assert.assertEquals(listOf("sale-9"), opened)
    }

    @Test
    fun anOrderSnackbarHasNoViewAction() {
        show(SellResult.ORDER_CREATED, saleId = "sale-9")

        rule.onNodeWithText("Ver venda").assertDoesNotExist()
    }
}
