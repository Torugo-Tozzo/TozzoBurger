package uk.tozzo.app.feature.deliveries

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import uk.tozzo.app.core.data.DeliveryRefusal
import uk.tozzo.app.core.data.DeliveryRefused
import uk.tozzo.app.core.data.DeliveryRepository
import uk.tozzo.app.core.data.DeliveryStage
import uk.tozzo.app.core.data.Driver
import uk.tozzo.app.core.data.OrderView
import uk.tozzo.app.core.data.OrderWriter
import uk.tozzo.app.core.session.DeviceBinding
import uk.tozzo.app.domain.ItemStatus
import uk.tozzo.app.domain.PaymentMethod
import uk.tozzo.app.domain.Role
import javax.inject.Inject

private const val STOP_TIMEOUT_MS = 5_000L

/** What went wrong with the last action, shown inline until the next one or until it is dismissed. */
enum class DeliveryError { NOT_READY, DRIVER_BUSY, CONFLICT, DRIVER_REQUIRED, CHANGE_FAILED, CLOSE_FAILED }

/** An item is ready for the road when it is READY or DELIVERED. */
internal fun OrderView.pendingItems() =
    items.filter { it.status != ItemStatus.READY && it.status != ItemStatus.DELIVERED }

/**
 * The delivery board. Every action writes the local database, which moves the card between the tabs at once.
 * A DRIVER only starts deliveries; assigning, going back and finishing are for the other roles.
 */
@Suppress("TooManyFunctions", "TooGenericExceptionCaught")
@HiltViewModel
class DeliveriesViewModel
    @Inject
    constructor(
        repository: DeliveryRepository,
        private val writer: OrderWriter,
        binding: DeviceBinding,
    ) : ViewModel() {
        /** Only DRIVER lacks the management actions (assign, go back, finish) and the drivers list. */
        val canManage: Boolean = binding.current.value?.role != Role.DRIVER

        /** Null until the first read of the database. */
        val board: StateFlow<Map<DeliveryStage, List<OrderView>>?> =
            repository.board().stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), null)

        val drivers: StateFlow<List<Driver>> =
            repository
                .drivers()
                .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), emptyList())

        private val confirm = MutableStateFlow<OrderView?>(null)
        private val assign = MutableStateFlow<OrderView?>(null)
        private val finishing = MutableStateFlow<OrderView?>(null)
        private val failure = MutableStateFlow<DeliveryError?>(null)

        /** The order whose START waits for the user to confirm that its pending items go out ready. */
        val confirmStart: StateFlow<OrderView?> = confirm.asStateFlow()

        /** The order whose driver is being chosen. */
        val assignTarget: StateFlow<OrderView?> = assign.asStateFlow()

        /** The order whose delivery is being finished (closed into a sale). */
        val finishTarget: StateFlow<OrderView?> = finishing.asStateFlow()

        val error: StateFlow<DeliveryError?> = failure.asStateFlow()

        fun dismissError() {
            failure.value = null
        }

        // --- start ---

        /** START; with items not ready it asks first, and an order without items does not start. */
        fun start(order: OrderView) {
            if (order.items.isEmpty()) return
            if (order.pendingItems().isNotEmpty()) {
                failure.value = null
                confirm.value = order
            } else {
                run(then = {}) { writer.startDelivery(order.id, confirmReady = false) }
            }
        }

        fun confirmStart() {
            val order = confirm.value ?: return
            confirm.value = null
            run(then = {}) { writer.startDelivery(order.id, confirmReady = true) }
        }

        fun dismissConfirm() {
            confirm.value = null
        }

        // --- the other actions ---

        fun back(order: OrderView) {
            if (!canManage) return
            run(then = {}) { writer.waitDelivery(order.id) }
        }

        fun openAssign(order: OrderView) {
            if (!canManage) return
            failure.value = null
            assign.value = order
        }

        fun closeAssign() {
            assign.value = null
            failure.value = null
        }

        /** A busy driver is never written; the sheet keeps open with the error. */
        fun assignDriver(
            order: OrderView,
            driverId: String,
        ) {
            if (!canManage) return
            if (drivers.value.firstOrNull { it.id == driverId }?.available == false) {
                failure.value = DeliveryError.DRIVER_BUSY
                return
            }
            run(then = { assign.value = null }) { writer.assignDriver(order.id, driverId) }
        }

        fun assignExternal(
            order: OrderView,
            name: String,
            phone: String?,
        ) {
            if (!canManage) return
            if (name.isBlank()) {
                failure.value = DeliveryError.DRIVER_REQUIRED
                return
            }
            run(then = { assign.value = null }) { writer.assignExternal(order.id, name, phone) }
        }

        fun unassign(order: OrderView) {
            if (!canManage) return
            run(then = { assign.value = null }) { writer.unassign(order.id) }
        }

        fun openFinish(order: OrderView) {
            if (!canManage) return
            failure.value = null
            finishing.value = order
        }

        fun closeFinish() {
            finishing.value = null
            failure.value = null
        }

        fun finish(
            order: OrderView,
            payment: PaymentMethod?,
        ) {
            if (!canManage) return
            failure.value = null
            viewModelScope.launch {
                try {
                    writer.closeOrder(order.id, payment)
                    finishing.value = null
                } catch (e: CancellationException) {
                    throw e
                } catch (_: Exception) {
                    failure.value = DeliveryError.CLOSE_FAILED
                }
            }
        }

        private fun run(
            then: () -> Unit,
            write: suspend () -> Unit,
        ) {
            failure.value = null
            viewModelScope.launch {
                try {
                    write()
                    then()
                } catch (e: CancellationException) {
                    throw e
                } catch (e: DeliveryRefused) {
                    failure.value = e.reason.toError()
                    // The order moved on: nothing left to confirm or assign on a stale snapshot.
                    if (e.reason == DeliveryRefusal.CONFLICT) assign.value = null
                } catch (_: IllegalArgumentException) {
                    failure.value = DeliveryError.DRIVER_REQUIRED
                } catch (_: Exception) {
                    failure.value = DeliveryError.CHANGE_FAILED
                }
            }
        }

        private fun DeliveryRefusal.toError() =
            when (this) {
                DeliveryRefusal.NOT_READY -> DeliveryError.NOT_READY
                DeliveryRefusal.DRIVER_BUSY -> DeliveryError.DRIVER_BUSY
                DeliveryRefusal.CONFLICT -> DeliveryError.CONFLICT
            }
    }
