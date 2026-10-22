package uk.tozzo.app.feature.orders

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import uk.tozzo.app.core.data.OrderFilter
import uk.tozzo.app.core.data.OrderRepository
import uk.tozzo.app.core.data.OrderView
import uk.tozzo.app.domain.Money
import javax.inject.Inject

private const val STOP_TIMEOUT_MS = 5_000L
private const val MAX_MONEY_DIGITS = 12

/** What the user typed in the filters; it only becomes the list's filter at "Buscar". */
data class OrdersFilterForm(
    val customer: String = "",
    val seller: String = "",
    val minCents: Long? = null,
    val maxCents: Long? = null,
)

/** The open orders and their filters, which apply only when the user searches (like the web). */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class OrdersViewModel
    @Inject
    constructor(
        repository: OrderRepository,
    ) : ViewModel() {
        private val formState = MutableStateFlow(OrdersFilterForm())
        private val appliedState = MutableStateFlow(OrderFilter())

        val form: StateFlow<OrdersFilterForm> = formState.asStateFlow()

        /** Null until the first read of the database. */
        val orders: StateFlow<List<OrderView>?> =
            appliedState
                .flatMapLatest { repository.openOrders(it) }
                .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), null)

        fun setCustomer(text: String) = formState.run { value = value.copy(customer = text) }

        fun setSeller(text: String) = formState.run { value = value.copy(seller = text) }

        /** A "cents mask" like the web's: only the digits count, "1250" is 12.50, none means no filter. */
        fun setMin(typed: String) = formState.run { value = value.copy(minCents = centsOf(typed)) }

        fun setMax(typed: String) = formState.run { value = value.copy(maxCents = centsOf(typed)) }

        fun search() {
            val f = formState.value
            appliedState.value = OrderFilter(f.customer.trim(), f.seller.trim(), f.minCents, f.maxCents)
        }

        private fun centsOf(typed: String): Long? =
            typed
                .filter { it in '0'..'9' }
                .take(MAX_MONEY_DIGITS)
                .takeIf { it.isNotEmpty() }
                ?.let { Money.centsFromInput(it) }
    }
