package uk.tozzo.app.feature.sell

import androidx.lifecycle.SavedStateHandle
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
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import uk.tozzo.app.core.data.CartLine
import uk.tozzo.app.core.data.CatalogRepository
import uk.tozzo.app.core.data.MAX_DELIVERY_ADDRESS
import uk.tozzo.app.core.data.OrderWriter
import uk.tozzo.app.core.data.SaleWriter
import uk.tozzo.app.core.data.totalCents
import uk.tozzo.app.core.session.DeviceBinding
import uk.tozzo.app.domain.BusinessModule
import uk.tozzo.app.domain.PaymentMethod
import uk.tozzo.app.domain.Product
import uk.tozzo.app.domain.ProductType
import uk.tozzo.app.domain.resolveNavigationModules
import javax.inject.Inject

/** What the last submit did; the screen shows it as a snackbar and then calls [SellViewModel.consumeResult]. */
enum class SellResult { SALE_SAVED, ORDER_CREATED, FAILED }

/** The API takes quantities from 1 to this. */
const val MAX_QUANTITY = 10_000

private const val CART_KEY = "cart"
private const val CUSTOMER_KEY = "customer"
private const val SEARCH_DEBOUNCE_MS = 300L
private const val READ_LIMIT = 5000

/**
 * The counter: the catalog to pick from and the cart. The cart and the customer live in the
 * [SavedStateHandle], so they survive the death of the process; the rest of the form does not need to.
 */
@OptIn(FlowPreview::class, ExperimentalCoroutinesApi::class)
@Suppress("TooGenericExceptionCaught", "TooManyFunctions")
@HiltViewModel
class SellViewModel
    @Inject
    constructor(
        private val handle: SavedStateHandle,
        catalog: CatalogRepository,
        private val sales: SaleWriter,
        private val orders: OrderWriter,
        deviceBinding: DeviceBinding,
    ) : ViewModel() {
        private val cartState = MutableStateFlow(decodeCart(handle.get<String>(CART_KEY)))
        private val customerState = MutableStateFlow(handle.get<String>(CUSTOMER_KEY).orEmpty())
        private val searchState = MutableStateFlow("")
        private val typeState = MutableStateFlow<String?>(null)
        private val deliveryState = MutableStateFlow(false)
        private val addressState = MutableStateFlow("")
        private val paymentState = MutableStateFlow<PaymentMethod?>(null)
        private val submittingState = MutableStateFlow(false)
        private val resultState = MutableStateFlow<SellResult?>(null)
        private val lastSaleState = MutableStateFlow<String?>(null)

        val cart: StateFlow<List<CartLine>> = cartState.asStateFlow()
        val customerName: StateFlow<String> = customerState.asStateFlow()
        val search: StateFlow<String> = searchState.asStateFlow()
        val typeId: StateFlow<String?> = typeState.asStateFlow()
        val isDelivery: StateFlow<Boolean> = deliveryState.asStateFlow()
        val address: StateFlow<String> = addressState.asStateFlow()
        val payment: StateFlow<PaymentMethod?> = paymentState.asStateFlow()
        val submitting: StateFlow<Boolean> = submittingState.asStateFlow()
        val result: StateFlow<SellResult?> = resultState.asStateFlow()

        /** The id of the sale behind [SellResult.SALE_SAVED], for the "Ver venda" action; null for any other result. */
        val lastSaleId: StateFlow<String?> = lastSaleState.asStateFlow()

        val cartCount: StateFlow<Int> = derived { lines -> lines.sumOf { it.quantity } }
        val totalCents: StateFlow<Long> = derived { it.totalCents() }

        /** "Gerar pedido" and the delivery toggle only exist for who sees the ORDERS module. */
        val canGenerateOrder: StateFlow<Boolean> =
            deviceBinding.current
                .map { b -> b != null && BusinessModule.ORDERS in resolveNavigationModules(b.role, b.modules) }
                .stateIn(viewModelScope, SharingStarted.Eagerly, false)

        /** A cart with something to charge; a free-only cart (total 0) cannot be finalized. */
        val canSell: StateFlow<Boolean> =
            combine(cartState, submittingState) { lines, busy -> lines.isNotEmpty() && lines.totalCents() > 0 && !busy }
                .stateIn(viewModelScope, SharingStarted.Eagerly, false)

        val canCreateOrder: StateFlow<Boolean> =
            combine(canSell, canGenerateOrder, deliveryState, addressState) { sell, orders, delivery, address ->
                sell && orders && (!delivery || addressIsValid(address))
            }.stateIn(viewModelScope, SharingStarted.Eagerly, false)

        private val appliedSearch =
            searchState.debounce { if (it.isEmpty()) 0L else SEARCH_DEBOUNCE_MS }.distinctUntilChanged()

        /** Products of active types, null until the first read. */
        val products: StateFlow<List<Product>?> =
            combine(appliedSearch, typeState) { query, type -> query to type }
                .flatMapLatest { (query, type) -> catalog.products(query, type, READ_LIMIT) }
                .stateIn(viewModelScope, SharingStarted.Eagerly, null)

        val types: StateFlow<List<ProductType>> =
            catalog
                .types(includeInactive = false)
                .stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

        fun setSearch(text: String) {
            searchState.value = text
        }

        fun setType(id: String?) {
            typeState.value = id
        }

        fun setCustomerName(text: String) {
            customerState.value = text
            handle[CUSTOMER_KEY] = text
        }

        fun setDelivery(value: Boolean) {
            deliveryState.value = value
        }

        fun setAddress(text: String) {
            addressState.value = text.take(MAX_DELIVERY_ADDRESS)
        }

        fun setPayment(method: PaymentMethod?) {
            paymentState.value = method
        }

        // --- cart ---

        fun add(product: Product) {
            changeCart { lines ->
                if (lines.any { it.productId == product.id }) {
                    lines.map { if (it.productId == product.id) it.plusOne() else it }
                } else {
                    lines + CartLine(product.id, product.name, product.priceCents, 1)
                }
            }
        }

        fun increase(productId: String) {
            changeCart { lines -> lines.map { if (it.productId == productId) it.plusOne() else it } }
        }

        /** "−" at 1 removes the line (the sheet shows a trash can there). */
        fun decrease(productId: String) {
            changeCart { lines ->
                lines.mapNotNull {
                    if (it.productId !=
                        productId
                    ) {
                        it
                    } else if (it.quantity <= 1) {
                        null
                    } else {
                        it.copy(quantity = it.quantity - 1)
                    }
                }
            }
        }

        fun remove(productId: String) {
            changeCart { lines -> lines.filterNot { it.productId == productId } }
        }

        /** Empties the cart and the form of the bill. */
        fun clear() {
            changeCart { emptyList() }
            setCustomerName("")
            deliveryState.value = false
            addressState.value = ""
            paymentState.value = null
        }

        fun consumeResult() {
            resultState.value = null
            lastSaleState.value = null
        }

        // --- submit ---

        fun sellDirect() {
            if (!canSell.value) return
            submit(SellResult.SALE_SAVED) { lines ->
                lastSaleState.value = sales.createSale(lines, customerState.value, paymentState.value)
            }
        }

        fun createOrder() {
            if (!canCreateOrder.value) return
            submit(SellResult.ORDER_CREATED) { lines ->
                orders.createOrder(lines, customerState.value, deliveryState.value, addressState.value)
            }
        }

        private fun submit(
            ok: SellResult,
            write: suspend (List<CartLine>) -> Unit,
        ) {
            if (submittingState.value) return
            val lines = cartState.value
            submittingState.value = true
            viewModelScope.launch {
                try {
                    write(lines)
                    clear()
                    resultState.value = ok
                } catch (e: CancellationException) {
                    throw e
                } catch (_: Exception) {
                    resultState.value = SellResult.FAILED
                } finally {
                    submittingState.value = false
                }
            }
        }

        private fun changeCart(change: (List<CartLine>) -> List<CartLine>) {
            cartState.update(change)
            handle[CART_KEY] = Json.encodeToString(ListSerializer(CartLine.serializer()), cartState.value)
        }

        private fun <T> derived(transform: (List<CartLine>) -> T): StateFlow<T> =
            cartState.map(transform).stateIn(viewModelScope, SharingStarted.Eagerly, transform(cartState.value))
    }

private fun CartLine.plusOne() = if (quantity >= MAX_QUANTITY) this else copy(quantity = quantity + 1)

internal fun addressIsValid(address: String): Boolean =
    address.trim().let {
        it.isNotEmpty() &&
            it.length <= MAX_DELIVERY_ADDRESS
    }

private fun decodeCart(raw: String?): List<CartLine> =
    raw
        ?.let {
            try {
                Json.decodeFromString(ListSerializer(CartLine.serializer()), it)
            } catch (_: kotlinx.serialization.SerializationException) {
                null
            }
        }.orEmpty()
