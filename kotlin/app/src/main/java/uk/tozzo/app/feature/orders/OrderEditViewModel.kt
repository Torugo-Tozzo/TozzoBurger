package uk.tozzo.app.feature.orders

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uk.tozzo.app.core.data.CatalogRepository
import uk.tozzo.app.core.data.EditLine
import uk.tozzo.app.core.data.MAX_DELIVERY_ADDRESS
import uk.tozzo.app.core.data.OrderRepository
import uk.tozzo.app.core.data.OrderView
import uk.tozzo.app.core.data.OrderWriter
import uk.tozzo.app.domain.ItemStatus
import uk.tozzo.app.domain.PaymentMethod
import uk.tozzo.app.domain.Product
import uk.tozzo.app.domain.ProductType
import uk.tozzo.app.feature.sell.MAX_QUANTITY
import java.util.UUID
import javax.inject.Inject

/** Why the edit screen is left. Only [ALREADY_CLOSED] is a warning: the order went away under the user. */
enum class OrderEditExit { SAVED, CLOSED, DELETED, ALREADY_CLOSED }

/** A one-shot message of the screen; it shows as a snackbar and then [OrderEditViewModel.consumeMessage] clears it. */
enum class OrderEditMessage { ADDRESS_REQUIRED, SAVE_FAILED, CLOSE_FAILED, DELETE_FAILED, STATUS_FAILED }

/** What the edit screen shows: the form being typed ([lines] and the rest) next to the stored [order]. */
data class OrderEditState(
    val loaded: Boolean = false,
    val order: OrderView? = null,
    val customer: String = "",
    val isDelivery: Boolean = false,
    val address: String = "",
    val lines: List<EditLine> = emptyList(),
    val payment: PaymentMethod? = null,
    val busy: Boolean = false,
    /** "Ver pedido": nothing can be changed, the fields included. */
    val readOnly: Boolean = false,
) {
    val delivering: Boolean get() = order?.delivering == true

    val totalCents: Long get() = lines.sumOf { it.unitPriceCents * it.quantity }

    /** The form differs from the stored order. */
    val dirty: Boolean
        get() {
            val stored = order ?: return false
            return customer.trim() != stored.customerName.orEmpty() ||
                isDelivery != stored.isDelivery ||
                (isDelivery && address.trim() != stored.deliveryAddress.orEmpty().trim()) ||
                lines != stored.toLines()
        }

    private val editable: Boolean get() = loaded && order != null && !delivering && !readOnly

    /** An order out for delivery cannot be edited, deleted or have an item's status changed. */
    val canSave: Boolean get() = editable && !busy
    val canDelete: Boolean get() = editable && !busy
    val canChangeStatus: Boolean get() = editable && !busy

    /** A delivery order is closed in Deliveries, so it has no close button. */
    val showClose: Boolean get() = order?.isDelivery == false && !readOnly

    /** Closing takes the order as stored: nothing to close when empty, and unsaved changes are saved first. */
    val canClose: Boolean get() = showClose && editable && !busy && !dirty && order?.items?.isNotEmpty() == true
}

internal fun OrderView.toLines(): List<EditLine> =
    items.map { EditLine(it.id, it.productId, it.productName.orEmpty(), it.unitPriceCents, it.quantity) }

private const val SEARCH_DEBOUNCE_MS = 300L
private const val STOP_TIMEOUT_MS = 5_000L
private const val READ_LIMIT = 5000

/**
 * The full-screen editor of an open order: the customer, delivery and items are a draft that "Salvar" writes;
 * an item's status, closing and deleting write at once. When the order stops being open (closed or deleted by
 * the sync, or never there) the screen is left through [exits], except after this device's own close or delete.
 */
@OptIn(FlowPreview::class, ExperimentalCoroutinesApi::class)
@Suppress("TooGenericExceptionCaught", "TooManyFunctions")
@HiltViewModel
class OrderEditViewModel
    @Inject
    constructor(
        handle: SavedStateHandle,
        orders: OrderRepository,
        catalog: CatalogRepository,
        private val writer: OrderWriter,
    ) : ViewModel() {
        private val orderId: String = checkNotNull(handle.get<String>(ORDER_ID_KEY)) { "no order id" }
        private val exitChannel = Channel<OrderEditExit>(Channel.BUFFERED)
        private val messageState = MutableStateFlow<OrderEditMessage?>(null)
        private val searchState = MutableStateFlow("")
        private val typeState = MutableStateFlow<String?>(null)
        private val stateFlow =
            MutableStateFlow(OrderEditState(readOnly = handle.get<Boolean>(READ_ONLY_KEY) == true))

        // Set before this device closes or deletes the order, so the order going away is not taken for a warning.
        private var leaving = false

        val state: StateFlow<OrderEditState> = stateFlow.asStateFlow()
        val exits: Flow<OrderEditExit> = exitChannel.receiveAsFlow()
        val message: StateFlow<OrderEditMessage?> = messageState.asStateFlow()
        val search: StateFlow<String> = searchState.asStateFlow()
        val typeId: StateFlow<String?> = typeState.asStateFlow()

        private val appliedSearch =
            searchState.debounce { if (it.isEmpty()) 0L else SEARCH_DEBOUNCE_MS }.distinctUntilChanged()

        val products: StateFlow<List<Product>> =
            combine(appliedSearch, typeState) { query, type -> query to type }
                .flatMapLatest { (query, type) -> catalog.products(query, type, READ_LIMIT) }
                .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), emptyList())

        val types: StateFlow<List<ProductType>> =
            catalog
                .types(includeInactive = false)
                .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), emptyList())

        init {
            viewModelScope.launch {
                orders.order(orderId).collect { onOrder(it) }
            }
        }

        private fun onOrder(order: OrderView?) {
            if (order == null) {
                stateFlow.update { it.copy(order = null) }
                if (!leaving) leave(OrderEditExit.ALREADY_CLOSED)
                return
            }
            stateFlow.update { current ->
                if (current.loaded) {
                    current.copy(order = order)
                } else {
                    current.copy(
                        loaded = true,
                        order = order,
                        customer = order.customerName.orEmpty(),
                        isDelivery = order.isDelivery,
                        address = order.deliveryAddress.orEmpty(),
                        lines = order.toLines(),
                    )
                }
            }
        }

        private fun leave(exit: OrderEditExit) {
            leaving = true
            exitChannel.trySend(exit)
        }

        fun setCustomer(text: String) = stateFlow.update { it.copy(customer = text) }

        fun setDelivery(value: Boolean) = stateFlow.update { it.copy(isDelivery = value) }

        fun setAddress(text: String) = stateFlow.update { it.copy(address = text.take(MAX_DELIVERY_ADDRESS)) }

        fun setPayment(method: PaymentMethod?) = stateFlow.update { it.copy(payment = method) }

        fun setSearch(text: String) {
            searchState.value = text
        }

        fun setType(id: String?) {
            typeState.value = id
        }

        fun consumeMessage() {
            messageState.value = null
        }

        // --- the draft lines ---

        /** As in the web, a product already on the order gets a line of its own (it has its own kitchen status). */
        fun add(product: Product) =
            changeLines { it + EditLine(UUID.randomUUID().toString(), product.id, product.name, product.priceCents, 1) }

        fun increase(lineId: String) =
            changeLines { lines ->
                lines.map {
                    if (it.id == lineId &&
                        it.quantity < MAX_QUANTITY
                    ) {
                        it.copy(quantity = it.quantity + 1)
                    } else {
                        it
                    }
                }
            }

        /** "−" at 1 removes the line. */
        fun decrease(lineId: String) =
            changeLines { lines ->
                lines.mapNotNull {
                    when {
                        it.id != lineId -> it
                        it.quantity <= 1 -> null
                        else -> it.copy(quantity = it.quantity - 1)
                    }
                }
            }

        fun remove(lineId: String) = changeLines { lines -> lines.filterNot { it.id == lineId } }

        private fun changeLines(change: (List<EditLine>) -> List<EditLine>) =
            stateFlow.update { it.copy(lines = change(it.lines)) }

        // --- writes ---

        /** The status selector of an item: written at once, without waiting for "Salvar". */
        fun setStatus(
            itemId: String,
            status: ItemStatus,
        ) {
            if (!stateFlow.value.canChangeStatus) return
            viewModelScope.launch {
                try {
                    writer.setItemStatus(itemId, status)
                } catch (e: CancellationException) {
                    throw e
                } catch (_: Exception) {
                    messageState.value = OrderEditMessage.STATUS_FAILED
                }
            }
        }

        fun save() {
            val s = stateFlow.value
            if (!s.canSave) return
            if (s.isDelivery && s.address.isBlank()) {
                messageState.value = OrderEditMessage.ADDRESS_REQUIRED
                return
            }
            run(OrderEditMessage.SAVE_FAILED, OrderEditExit.SAVED, goingAway = false) {
                writer.updateOrder(orderId, s.customer, s.isDelivery, s.address, s.lines)
            }
        }

        fun close() {
            val s = stateFlow.value
            if (!s.canClose) return
            run(OrderEditMessage.CLOSE_FAILED, OrderEditExit.CLOSED, goingAway = true) {
                writer.closeOrder(orderId, s.payment)
            }
        }

        fun delete() {
            if (!stateFlow.value.canDelete) return
            run(OrderEditMessage.DELETE_FAILED, OrderEditExit.DELETED, goingAway = true) {
                writer.deleteOrder(orderId)
            }
        }

        private fun run(
            failure: OrderEditMessage,
            exit: OrderEditExit,
            goingAway: Boolean,
            write: suspend () -> Unit,
        ) {
            stateFlow.update { it.copy(busy = true) }
            // The order disappears from the open orders as soon as it is written, possibly before write returns.
            if (goingAway) leaving = true
            viewModelScope.launch {
                try {
                    write()
                    leave(exit)
                } catch (e: CancellationException) {
                    throw e
                } catch (_: Exception) {
                    if (goingAway) leaving = false
                    messageState.value = failure
                } finally {
                    stateFlow.update { it.copy(busy = false) }
                }
            }
        }

        private companion object {
            const val ORDER_ID_KEY = "orderId"
            const val READ_ONLY_KEY = "readOnly"
        }
    }
