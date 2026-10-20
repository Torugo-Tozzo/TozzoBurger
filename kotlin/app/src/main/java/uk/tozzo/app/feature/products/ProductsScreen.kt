package uk.tozzo.app.feature.products

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.StringRes
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import uk.tozzo.app.R
import uk.tozzo.app.core.data.ManagedProduct
import uk.tozzo.app.core.data.foldForSearch
import uk.tozzo.app.core.data.mediaUrl
import uk.tozzo.app.domain.ProductType
import uk.tozzo.app.ui.components.ButtonVariant
import uk.tozzo.app.ui.components.ConfirmDialog
import uk.tozzo.app.ui.components.EmptyState
import uk.tozzo.app.ui.components.LoadingState
import uk.tozzo.app.ui.components.MoneyText
import uk.tozzo.app.ui.components.TozzoButton
import uk.tozzo.app.ui.components.TozzoCard
import uk.tozzo.app.ui.components.TozzoTextField
import uk.tozzo.app.ui.components.typeLabel

private const val LOAD_MORE_DISTANCE = 3
private const val INACTIVE_ALPHA = 0.6f
private val FALLBACK_CHIP_COLOR = Color(0xFF111827)

/** The Products module: the list, or the full-screen form of a product or type being edited. */
@Suppress("LongMethod")
@Composable
fun ProductsRoute(viewModel: ProductsViewModel = hiltViewModel()) {
    val tab by viewModel.tab.collectAsStateWithLifecycle()
    val search by viewModel.search.collectAsStateWithLifecycle()
    val products by viewModel.products.collectAsStateWithLifecycle()
    val types by viewModel.types.collectAsStateWithLifecycle()
    val message by viewModel.message.collectAsStateWithLifecycle()
    val online by viewModel.online.collectAsStateWithLifecycle()
    val productForm by viewModel.productForm.collectAsStateWithLifecycle()
    val typeForm by viewModel.typeForm.collectAsStateWithLifecycle()
    // The Photo Picker needs no permission: it hands back the one image the user chose.
    val picker =
        rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
            if (uri != null) viewModel.uploadImage(uri)
        }

    val product = productForm
    val type = typeForm
    when {
        product != null -> {
            BackHandler(onBack = viewModel::closeProductForm)
            ProductFormScreen(
                state = product,
                types = types.orEmpty(),
                online = online,
                onChange = viewModel::editProduct,
                onSave = viewModel::saveProduct,
                onCancel = viewModel::closeProductForm,
                onPickImage = {
                    picker.launch(
                        PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly),
                    )
                },
            )
        }
        type != null -> {
            BackHandler(onBack = viewModel::closeTypeForm)
            ProductTypeFormScreen(
                state = type,
                onChange = viewModel::editType,
                onSave = viewModel::saveType,
                onCancel = viewModel::closeTypeForm,
            )
        }
        else ->
            ProductsScreen(
                tab = tab,
                search = search,
                products = products,
                types = types,
                onTab = viewModel::setTab,
                onSearch = viewModel::setSearch,
                onLoadMore = viewModel::loadMore,
                onNewProduct = { viewModel.openProductForm(null) },
                onEditProduct = viewModel::openProductForm,
                onDeleteProduct = viewModel::deleteProduct,
                onNewType = { viewModel.openTypeForm(null) },
                onEditType = viewModel::openTypeForm,
                onDeleteType = viewModel::deleteType,
                message = message,
                onDismissMessage = viewModel::clearMessage,
            )
    }
}

/**
 * The Products and Types tabs, each with its search and its "new" button. The Products list pages by
 * scrolling ([onLoadMore]); the Types list is whole, narrowed here by [search]. Every role sees it: the API
 * decides who may write, like the web.
 */
@Composable
fun ProductsScreen(
    tab: ProductsTab,
    search: String,
    products: List<ManagedProduct>?,
    types: List<ProductType>?,
    onTab: (ProductsTab) -> Unit,
    onSearch: (String) -> Unit,
    onLoadMore: () -> Unit,
    onNewProduct: () -> Unit,
    onEditProduct: (String) -> Unit,
    onDeleteProduct: (String) -> Unit,
    onNewType: () -> Unit,
    onEditType: (String) -> Unit,
    onDeleteType: (String) -> Unit,
    message: Int? = null,
    onDismissMessage: () -> Unit = {},
) {
    Column(modifier = Modifier.fillMaxSize()) {
        PrimaryTabRow(selectedTabIndex = tab.ordinal, containerColor = MaterialTheme.colorScheme.background) {
            Tab(
                selected = tab == ProductsTab.PRODUCTS,
                onClick = { onTab(ProductsTab.PRODUCTS) },
                text = { Text(stringResource(R.string.products_tab_products)) },
            )
            Tab(
                selected = tab == ProductsTab.TYPES,
                onClick = { onTab(ProductsTab.TYPES) },
                text = { Text(stringResource(R.string.products_tab_types)) },
            )
        }
        Column(
            modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            val isProducts = tab == ProductsTab.PRODUCTS
            TozzoTextField(
                value = search,
                onValueChange = onSearch,
                label =
                    stringResource(
                        if (isProducts) R.string.products_search_products else R.string.products_search_types,
                    ),
            )
            TozzoButton(
                text = stringResource(if (isProducts) R.string.products_new_product else R.string.products_new_type),
                onClick = if (isProducts) onNewProduct else onNewType,
                modifier = Modifier.fillMaxWidth(),
            )
            if (message != null) {
                Text(
                    stringResource(message),
                    color = MaterialTheme.colorScheme.error,
                    modifier = Modifier.clickable(onClick = onDismissMessage),
                )
            }
            if (isProducts) {
                ProductList(products, types.orEmpty(), onLoadMore, onEditProduct, onDeleteProduct)
            } else {
                TypeList(types, search, onEditType, onDeleteType)
            }
        }
    }
}

@Composable
private fun ProductList(
    products: List<ManagedProduct>?,
    types: List<ProductType>,
    onLoadMore: () -> Unit,
    onEdit: (String) -> Unit,
    onDelete: (String) -> Unit,
) {
    var pendingDelete by remember { mutableStateOf<String?>(null) }
    val listState = rememberLazyListState()
    val atEnd by remember {
        derivedStateOf {
            val info = listState.layoutInfo
            (info.visibleItemsInfo.lastOrNull()?.index ?: -1) >= info.totalItemsCount - LOAD_MORE_DISTANCE
        }
    }
    // Also fires when a page arrives and the list is still short: the next page follows.
    LaunchedEffect(atEnd, products?.size) { if (atEnd) onLoadMore() }

    when {
        products == null -> LoadingState()
        products.isEmpty() -> EmptyState(stringResource(R.string.products_empty))
        else ->
            LazyColumn(
                state = listState,
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(products, key = { it.id }) { product ->
                    ProductRow(product, types.firstOrNull { it.id == product.typeId }, onEdit, {
                        pendingDelete =
                            product.id
                    })
                }
            }
    }
    pendingDelete?.let { id ->
        ConfirmDialog(
            title = stringResource(R.string.common_delete),
            message = stringResource(R.string.products_delete_confirm),
            confirmText = stringResource(R.string.common_delete),
            onConfirm = {
                pendingDelete = null
                onDelete(id)
            },
            onDismiss = { pendingDelete = null },
            destructive = true,
        )
    }
}

@Composable
private fun ProductRow(
    product: ManagedProduct,
    type: ProductType?,
    onEdit: (String) -> Unit,
    onDelete: () -> Unit,
) {
    TozzoCard(modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            ProductImage(product.imageKey, stringResource(R.string.products_image_preview), Modifier.size(48.dp))
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(product.name, style = MaterialTheme.typography.titleMedium)
                if (type != null) ColoredTypeChip(typeLabel(type), type.color)
            }
            val price = product.priceCents
            if (price != null) {
                MoneyText(price, style = MaterialTheme.typography.titleMedium)
            } else {
                Text(stringResource(R.string.products_price_missing), color = MaterialTheme.colorScheme.error)
            }
        }
        RowActions({ onEdit(product.id) }, onDelete)
    }
}

@Composable
private fun TypeList(
    types: List<ProductType>?,
    search: String,
    onEdit: (String) -> Unit,
    onDelete: (String) -> Unit,
) {
    var pendingDelete by remember { mutableStateOf<String?>(null) }
    val needle = foldForSearch(search)
    val shown = types?.filter { needle.isEmpty() || foldForSearch(it.description).contains(needle) }
    when {
        shown == null -> LoadingState()
        shown.isEmpty() -> EmptyState(stringResource(R.string.products_types_empty))
        else ->
            LazyColumn(modifier = Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(shown, key = { it.id }) { type ->
                    TypeRow(type, onEdit, { pendingDelete = type.id })
                }
            }
    }
    pendingDelete?.let { id ->
        ConfirmDialog(
            title = stringResource(R.string.common_delete),
            message = stringResource(R.string.products_delete_type_confirm),
            confirmText = stringResource(R.string.common_delete),
            onConfirm = {
                pendingDelete = null
                onDelete(id)
            },
            onDismiss = { pendingDelete = null },
            destructive = true,
        )
    }
}

@Composable
private fun TypeRow(
    type: ProductType,
    onEdit: (String) -> Unit,
    onDelete: () -> Unit,
) {
    // An inactive type stays listed, faded and marked.
    TozzoCard(modifier = Modifier.fillMaxWidth().alpha(if (type.isActive) 1f else INACTIVE_ALPHA)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(
                Modifier
                    .size(16.dp)
                    .clip(CircleShape)
                    .background(parseTypeColor(type.color, MaterialTheme.colorScheme.outline)),
            )
            val label = typeLabel(type)
            Text(
                if (type.isActive) label else "$label ${stringResource(R.string.products_inactive_suffix)}",
                style = MaterialTheme.typography.titleMedium,
            )
        }
        RowActions({ onEdit(type.id) }, onDelete)
    }
}

@Composable
private fun RowActions(
    onEdit: () -> Unit,
    onDelete: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(top = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.End),
    ) {
        TozzoButton(stringResource(R.string.common_edit), onEdit, variant = ButtonVariant.Outline)
        TozzoButton(stringResource(R.string.common_delete), onDelete, variant = ButtonVariant.Outline)
    }
}

/** The type of a product: its colour behind white text (the web falls back to a dark grey). */
@Composable
private fun ColoredTypeChip(
    label: String,
    color: String?,
) {
    Surface(
        shape = MaterialTheme.shapes.medium,
        color = parseTypeColor(color, FALLBACK_CHIP_COLOR),
        contentColor = Color.White,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
    ) {
        Text(
            label,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
            style = MaterialTheme.typography.labelMedium,
        )
    }
}

/** The product picture from the public media URL, or an empty outlined square when it has none. */
@Composable
internal fun ProductImage(
    imageKey: String?,
    contentDescription: String?,
    modifier: Modifier = Modifier,
) {
    val url = mediaUrl(imageKey)
    val shape = MaterialTheme.shapes.medium
    Box(
        modifier = modifier.clip(shape).background(MaterialTheme.colorScheme.surfaceVariant),
        contentAlignment = Alignment.Center,
    ) {
        if (url != null) {
            AsyncImage(
                model = url,
                contentDescription = contentDescription,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}

/** `#RRGGBB` or `#RRGGBBAA` (the API's formats), or [fallback] when it is neither. */
internal fun parseTypeColor(
    raw: String?,
    fallback: Color,
): Color {
    val hex = raw?.removePrefix("#")
    val value = hex?.toLongOrNull(HEX_RADIX)
    return when {
        value == null -> fallback
        hex.length == RGB_LENGTH -> Color((OPAQUE shl RGB_SHIFT or value).toInt())
        hex.length == RGBA_LENGTH -> Color((((value and ALPHA_MASK) shl RGB_SHIFT) or (value shr ALPHA_BITS)).toInt())
        else -> fallback
    }
}

private const val HEX_RADIX = 16
private const val RGB_LENGTH = 6
private const val RGBA_LENGTH = 8
private const val OPAQUE = 0xFFL
private const val RGB_SHIFT = 24
private const val ALPHA_BITS = 8
private const val ALPHA_MASK = 0xFFL

@StringRes
internal fun uploadStateMessage(state: ImageUploadState): Int? =
    when (state) {
        ImageUploadState.Idle -> null
        ImageUploadState.Uploading -> R.string.products_image_uploading
        ImageUploadState.Done -> R.string.products_image_uploaded
        is ImageUploadState.Failed -> state.message
    }
