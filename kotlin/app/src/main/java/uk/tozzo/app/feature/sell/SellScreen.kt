package uk.tozzo.app.feature.sell

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import uk.tozzo.app.R
import uk.tozzo.app.domain.Product
import uk.tozzo.app.domain.ProductType
import uk.tozzo.app.ui.components.LoadingState
import uk.tozzo.app.ui.components.ProductPicker
import uk.tozzo.app.ui.components.TozzoButton

/** The Sell module: the catalog, the cart sheet and the snackbar that confirms a sale or an order. */
@Composable
fun SellRoute(viewModel: SellViewModel = hiltViewModel()) {
    val products by viewModel.products.collectAsStateWithLifecycle()
    val types by viewModel.types.collectAsStateWithLifecycle()
    val search by viewModel.search.collectAsStateWithLifecycle()
    val typeId by viewModel.typeId.collectAsStateWithLifecycle()
    val cart by viewModel.cart.collectAsStateWithLifecycle()
    val cartCount by viewModel.cartCount.collectAsStateWithLifecycle()
    val result by viewModel.result.collectAsStateWithLifecycle()
    var sheetOpen by rememberSaveable { mutableStateOf(false) }
    val snackbar = remember { SnackbarHostState() }
    SellResultEffect(
        result = result,
        snackbar = snackbar,
        onConsumed = viewModel::consumeResult,
        // The sheet closes on success; on a failure it stays open so nothing typed is lost.
        onSuccess = { sheetOpen = false },
    )
    // An emptied cart leaves nothing to show in the sheet.
    LaunchedEffect(cart.isEmpty()) { if (cart.isEmpty()) sheetOpen = false }

    Box(Modifier.fillMaxSize()) {
        val list = products
        if (list == null) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { LoadingState() }
        } else {
            SellScreen(
                types = types,
                products = list,
                search = search,
                typeId = typeId,
                cartCount = cartCount,
                onSearch = viewModel::setSearch,
                onType = viewModel::setType,
                onAdd = viewModel::add,
                onViewCart = { sheetOpen = true },
            )
        }
        SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter).padding(bottom = 72.dp))
    }
    if (sheetOpen && cart.isNotEmpty()) CartSheetRoute(viewModel, onDismiss = { sheetOpen = false })
}

/** The catalog in full screen, with "Ver conta (N)" pinned at the bottom while the cart has items. */
@Composable
fun SellScreen(
    types: List<ProductType>,
    products: List<Product>,
    search: String,
    typeId: String?,
    cartCount: Int,
    onSearch: (String) -> Unit,
    onType: (String?) -> Unit,
    onAdd: (Product) -> Unit,
    onViewCart: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        ProductPicker(
            types = types,
            products = products,
            search = search,
            typeId = typeId,
            onSearch = onSearch,
            onType = onType,
            onAdd = onAdd,
            modifier = Modifier.weight(1f),
        )
        if (cartCount > 0) {
            TozzoButton(
                text = stringResource(R.string.sell_view_cart, cartCount),
                onClick = onViewCart,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

/**
 * Shows the snackbar for [result], then hands it back through [onConsumed];
 * [onSuccess] runs for a sale or an order.
 */
@Composable
internal fun SellResultEffect(
    result: SellResult?,
    snackbar: SnackbarHostState,
    onConsumed: () -> Unit,
    onSuccess: () -> Unit,
) {
    val saleSaved = stringResource(R.string.sell_sale_saved)
    val orderCreated = stringResource(R.string.sell_order_created)
    val failed = stringResource(R.string.sell_failed)
    // The snackbar runs in its own scope: consuming the result restarts the effect below, which would
    // cancel a showSnackbar launched from it.
    val scope = rememberCoroutineScope()
    LaunchedEffect(result) {
        val message =
            when (result) {
                SellResult.SALE_SAVED -> saleSaved
                SellResult.ORDER_CREATED -> orderCreated
                SellResult.FAILED -> failed
                null -> return@LaunchedEffect
            }
        if (result != SellResult.FAILED) onSuccess()
        onConsumed()
        // "Ver venda" joins the sale snackbar when the sale detail exists (a later task).
        scope.launch { snackbar.showSnackbar(message) }
    }
}
