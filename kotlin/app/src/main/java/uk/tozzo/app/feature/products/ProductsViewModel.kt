package uk.tozzo.app.feature.products

import android.net.Uri
import androidx.annotation.StringRes
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uk.tozzo.app.R
import uk.tozzo.app.core.data.CatalogRepository
import uk.tozzo.app.core.data.CatalogWriter
import uk.tozzo.app.core.data.ImageUploadException
import uk.tozzo.app.core.data.ManagedProduct
import uk.tozzo.app.core.data.ProductImageUploader
import uk.tozzo.app.core.session.Binding
import uk.tozzo.app.core.session.DeviceBinding
import uk.tozzo.app.core.sync.Connectivity
import uk.tozzo.app.domain.ProductType
import uk.tozzo.app.domain.Role
import javax.inject.Inject

enum class ProductsTab { PRODUCTS, TYPES }

sealed interface ImageUploadState {
    data object Idle : ImageUploadState

    data object Uploading : ImageUploadState

    data object Done : ImageUploadState

    data class Failed(
        @param:StringRes val message: Int,
    ) : ImageUploadState
}

data class ProductFormState(
    val id: String? = null,
    val name: String = "",
    val priceDigits: String = "",
    val typeId: String? = null,
    val ingredients: String = "",
    val imageKey: String? = null,
    val loading: Boolean = false,
    val saving: Boolean = false,
    val nameError: Boolean = false,
    val priceError: Boolean = false,
    val saveError: Boolean = false,
    val upload: ImageUploadState = ImageUploadState.Idle,
)

data class TypeFormState(
    val id: String? = null,
    val description: String = "",
    val color: String = DEFAULT_TYPE_COLOR,
    val loading: Boolean = false,
    val saving: Boolean = false,
    val descriptionError: Boolean = false,
    val saveError: Boolean = false,
)

const val DEFAULT_TYPE_COLOR = "#000000"

/** The API accepts prices from 0 to this many cents (`PRODUCT_PRICE_INVALID` otherwise). */
const val MAX_PRICE_CENTS = 9_999_999_999L

/** The colour of a type without one, as the API defaults it. */
const val FALLBACK_TYPE_COLOR = "#9E9E9E"

private const val PAGE_SIZE = 50
private const val SEARCH_DEBOUNCE_MS = 300L

@OptIn(FlowPreview::class, ExperimentalCoroutinesApi::class)
@Suppress("TooGenericExceptionCaught", "TooManyFunctions")
@HiltViewModel
class ProductsViewModel
    @Inject
    constructor(
        private val catalog: CatalogRepository,
        private val writer: CatalogWriter,
        private val uploader: ProductImageUploader,
        connectivity: Connectivity,
        deviceBinding: DeviceBinding,
    ) : ViewModel() {
        private val tabState = MutableStateFlow(ProductsTab.PRODUCTS)
        private val searchState = MutableStateFlow("")
        private val limit = MutableStateFlow(PAGE_SIZE)
        private val productFormState = MutableStateFlow<ProductFormState?>(null)
        private val typeFormState = MutableStateFlow<TypeFormState?>(null)
        private val messageState = MutableStateFlow<Int?>(null)

        val tab: StateFlow<ProductsTab> = tabState.asStateFlow()
        val search: StateFlow<String> = searchState.asStateFlow()
        val productForm: StateFlow<ProductFormState?> = productFormState.asStateFlow()
        val typeForm: StateFlow<TypeFormState?> = typeFormState.asStateFlow()
        val online: StateFlow<Boolean> = connectivity.online

        /** Only OWNER and MANAGER write products and types (the API refuses the rest); others read. */
        val canEdit: StateFlow<Boolean> =
            deviceBinding.current
                .map { it.canEditCatalog() }
                .stateIn(viewModelScope, SharingStarted.Eagerly, deviceBinding.current.value.canEditCatalog())

        /** A failure to show on the list (a delete that could not be written). */
        val message: StateFlow<Int?> = messageState.asStateFlow()

        // An empty search applies at once (the first load, or the field cleared); typing waits for a pause.
        private val appliedSearch =
            searchState.debounce { if (it.isEmpty()) 0L else SEARCH_DEBOUNCE_MS }.distinctUntilChanged()

        /** Null until the first read. */
        val products: StateFlow<List<ManagedProduct>?> =
            combine(appliedSearch, limit) { query, size -> query to size }
                .flatMapLatest { (query, size) -> catalog.manageProducts(query, size) }
                .stateIn(viewModelScope, SharingStarted.Eagerly, null)

        /** Every live type, inactive ones too: the Types tab, the chips and the type picker of the product form. */
        val types: StateFlow<List<ProductType>?> =
            catalog.types(includeInactive = true).stateIn(viewModelScope, SharingStarted.Eagerly, null)

        fun setTab(tab: ProductsTab) {
            if (tab == tabState.value) return
            tabState.value = tab
            setSearch("")
        }

        fun setSearch(text: String) {
            searchState.value = text
            limit.value = PAGE_SIZE
        }

        /** The scroll reached the end of the list: show 50 more, when the last page was full. */
        fun loadMore() {
            val shown = products.value?.size ?: return
            if (shown >= limit.value) limit.value += PAGE_SIZE
        }

        fun clearMessage() {
            messageState.value = null
        }

        // --- product form ---

        /** Opens the form of a new product, or loads the one of [id] (whatever its price or type). */
        fun openProductForm(id: String?) {
            if (!canEdit.value) return
            if (id == null) {
                productFormState.value = ProductFormState()
                return
            }
            productFormState.value = ProductFormState(id = id, loading = true)
            viewModelScope.launch {
                val product = catalog.productForEdit(id)
                productFormState.update { current ->
                    when {
                        current?.id != id -> current
                        product == null -> null
                        else ->
                            current.copy(
                                name = product.name,
                                // An invalid or missing price opens empty: the user types the right one.
                                priceDigits = product.priceCents?.toString().orEmpty(),
                                typeId = product.typeId,
                                ingredients = product.ingredients.orEmpty(),
                                imageKey = product.imageKey,
                                loading = false,
                            )
                    }
                }
            }
        }

        fun closeProductForm() {
            productFormState.value = null
        }

        fun editProduct(change: (ProductFormState) -> ProductFormState) {
            productFormState.update { it?.let(change) }
        }

        @Suppress("ReturnCount")
        fun saveProduct() {
            val form = productFormState.value ?: return
            if (form.saving || form.loading || form.upload == ImageUploadState.Uploading) return
            val cents = priceCents(form.priceDigits)
            val nameError = form.name.isBlank()
            if (nameError || cents == null) {
                productFormState.value = form.copy(nameError = nameError, priceError = cents == null)
                return
            }
            productFormState.value = form.copy(saving = true, nameError = false, priceError = false, saveError = false)
            viewModelScope.launch {
                try {
                    val typeId = form.typeId
                    if (form.id == null) {
                        writer.createProduct(form.name, cents, form.ingredients, typeId)
                    } else {
                        writer.updateProduct(form.id, form.name, cents, form.ingredients, typeId)
                    }
                    productFormState.value = null
                } catch (e: CancellationException) {
                    throw e
                } catch (_: Exception) {
                    productFormState.update { it?.copy(saving = false, saveError = true) }
                }
            }
        }

        fun deleteProduct(id: String) = write { writer.deleteProduct(id) }

        /** Digits typed into the price field as cents, or null when empty or beyond what the API accepts. */
        private fun priceCents(digits: String): Long? {
            val typed = digits.filter { it in '0'..'9' }
            if (typed.isEmpty()) return null
            val trimmed = typed.trimStart('0')
            return (trimmed.toLongOrNull() ?: if (trimmed.isEmpty()) 0L else null)?.takeIf { it <= MAX_PRICE_CENTS }
        }

        // --- image upload ---

        /** Uploads the picked image to the product being edited; online only. */
        @Suppress("ReturnCount")
        fun uploadImage(uri: Uri) {
            val form = productFormState.value ?: return
            val productId = form.id ?: return
            if (!canEdit.value) return
            if (form.upload == ImageUploadState.Uploading) return
            if (!online.value) {
                setUpload(ImageUploadState.Failed(R.string.products_image_offline))
                return
            }
            setUpload(ImageUploadState.Uploading)
            viewModelScope.launch {
                try {
                    val key = uploader.upload(productId, uri)
                    productFormState.update { it?.copy(imageKey = key, upload = ImageUploadState.Done) }
                } catch (e: CancellationException) {
                    throw e
                } catch (e: ImageUploadException) {
                    setUpload(ImageUploadState.Failed(uploadMessage(e.reason)))
                } catch (_: Exception) {
                    setUpload(ImageUploadState.Failed(R.string.products_image_failed))
                }
            }
        }

        private fun setUpload(state: ImageUploadState) {
            productFormState.update { it?.copy(upload = state) }
        }

        private fun uploadMessage(reason: ImageUploadException.Reason): Int =
            when (reason) {
                ImageUploadException.Reason.INVALID -> R.string.products_image_invalid
                ImageUploadException.Reason.NOT_READY -> R.string.products_image_not_ready
                ImageUploadException.Reason.FAILED -> R.string.products_image_failed
            }

        // --- type form ---

        @Suppress("ReturnCount")
        fun openTypeForm(id: String?) {
            if (!canEdit.value) return
            if (id == null) {
                typeFormState.value = TypeFormState()
                return
            }
            val type = types.value?.firstOrNull { it.id == id } ?: return
            typeFormState.value =
                TypeFormState(id = id, description = type.description, color = type.color ?: FALLBACK_TYPE_COLOR)
        }

        fun closeTypeForm() {
            typeFormState.value = null
        }

        fun editType(change: (TypeFormState) -> TypeFormState) {
            typeFormState.update { it?.let(change) }
        }

        @Suppress("ReturnCount")
        fun saveType() {
            val form = typeFormState.value ?: return
            if (form.saving) return
            if (form.description.isBlank()) {
                typeFormState.value = form.copy(descriptionError = true)
                return
            }
            typeFormState.value = form.copy(saving = true, descriptionError = false, saveError = false)
            viewModelScope.launch {
                try {
                    if (form.id == null) {
                        writer.createType(form.description, form.color)
                    } else {
                        writer.updateType(form.id, form.description, form.color)
                    }
                    typeFormState.value = null
                } catch (e: CancellationException) {
                    throw e
                } catch (_: Exception) {
                    typeFormState.update { it?.copy(saving = false, saveError = true) }
                }
            }
        }

        fun deleteType(id: String) = write { writer.deleteType(id) }

        private fun write(block: suspend () -> Unit) {
            if (!canEdit.value) return
            viewModelScope.launch {
                try {
                    block()
                } catch (e: CancellationException) {
                    throw e
                } catch (_: Exception) {
                    messageState.value = R.string.products_save_failed
                }
            }
        }
    }

private fun Binding?.canEditCatalog() = this?.role.let { it == Role.OWNER || it == Role.MANAGER }
