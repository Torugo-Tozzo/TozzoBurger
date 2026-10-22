package uk.tozzo.app.feature.sales

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uk.tozzo.app.core.data.SaleFilter
import uk.tozzo.app.core.data.SaleRepository
import uk.tozzo.app.core.data.SaleView
import uk.tozzo.app.core.data.SaleWriter
import uk.tozzo.app.core.data.SalesSummary
import uk.tozzo.app.domain.Money
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import javax.inject.Inject

/** The list grows by this much each time the user reaches its end. */
internal const val SALES_PAGE_SIZE = 50
private const val STOP_TIMEOUT_MS = 5_000L
private val DEFAULT_PERIOD: Duration = Duration.ofHours(24)
private const val MAX_MONEY_DIGITS = 12
private const val LAST_SECOND = 59
private val END_OF_DAY: LocalTime = LocalTime.of(23, 59)
private const val LAST_MILLI_NANOS = 999_000_000
private val TIME_FORMAT = DateTimeFormatter.ofPattern("H:mm")
private val DATE_FORMAT = DateTimeFormatter.ISO_LOCAL_DATE

/**
 * What the user typed in the filters, in local date (`YYYY-MM-DD`) and time (`HH:mm`). The end is empty until the
 * user fills it, so sales made from now on keep appearing.
 */
data class SalesFilterForm(
    val fromDate: String,
    val fromTime: String,
    val toDate: String = "",
    val toTime: String = "",
    val customer: String = "",
    val seller: String = "",
    val minCents: Long? = null,
    val maxCents: Long? = null,
)

/** The sales history: the period, its closing and the list that grows 50 at a time. */
@OptIn(ExperimentalCoroutinesApi::class)
@Suppress("TooManyFunctions")
@HiltViewModel
class SalesViewModel
    @Inject
    constructor(
        repository: SaleRepository,
        private val clock: Clock,
    ) : ViewModel() {
        private val zone: ZoneId get() = ZoneId.systemDefault()
        private val formState = MutableStateFlow(defaultForm())
        private val appliedState = MutableStateFlow(SaleFilter(from = defaultFrom()))
        private val limitState = MutableStateFlow(SALES_PAGE_SIZE)
        private val errorState = MutableStateFlow(false)

        val form: StateFlow<SalesFilterForm> = formState.asStateFlow()
        val applied: StateFlow<SaleFilter> = appliedState.asStateFlow()
        val limit: StateFlow<Int> = limitState.asStateFlow()

        /** The dates of the form could not be read at the last "Aplicar". */
        val formError: StateFlow<Boolean> = errorState.asStateFlow()

        /** Null until the first read of the database. */
        val sales: StateFlow<List<SaleView>?> =
            combine(appliedState, limitState) { filter, limit -> filter to limit }
                .flatMapLatest { (filter, limit) -> repository.sales(filter, limit) }
                .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), null)

        val summary: StateFlow<SalesSummary?> =
            appliedState
                .flatMapLatest { repository.summary(it) }
                .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), null)

        /** There may be more sales than the loaded ones: the last read filled the limit. */
        val canLoadMore: StateFlow<Boolean> =
            combine(sales, limitState) { list, limit -> (list?.size ?: 0) >= limit }
                .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), false)

        fun loadMore() {
            limitState.update { it + SALES_PAGE_SIZE }
        }

        fun setFromDate(text: String) = change { copy(fromDate = text) }

        fun setFromTime(text: String) = change { copy(fromTime = text) }

        fun setToDate(text: String) = change { copy(toDate = text) }

        fun setToTime(text: String) = change { copy(toTime = text) }

        fun setCustomer(text: String) = change { copy(customer = text) }

        fun setSeller(text: String) = change { copy(seller = text) }

        /** A "cents mask" like the web's: only the digits count, "1250" is 12.50, none means no filter. */
        fun setMin(typed: String) = change { copy(minCents = centsOf(typed)) }

        fun setMax(typed: String) = change { copy(maxCents = centsOf(typed)) }

        /** Applies the form (back to the first 50 sales); false, with [formError], when a date cannot be read. */
        fun apply(): Boolean {
            val f = formState.value
            val filter = toFilter(f)
            errorState.value = filter == null
            if (filter == null) return false
            appliedState.value = filter
            limitState.value = SALES_PAGE_SIZE
            return true
        }

        /** Back to the last 24 hours with no other filter. */
        fun clear() {
            formState.value = defaultForm()
            errorState.value = false
            appliedState.value = SaleFilter(from = defaultFrom())
            limitState.value = SALES_PAGE_SIZE
        }

        private fun change(block: SalesFilterForm.() -> SalesFilterForm) {
            formState.update { it.block() }
        }

        /** 24 hours before now, read at each use: this view model outlives long idle stretches on a till. */
        private fun defaultFrom(): Instant = clock.instant().minus(DEFAULT_PERIOD)

        private fun defaultForm(): SalesFilterForm {
            val start = LocalDateTime.ofInstant(defaultFrom(), zone)
            return SalesFilterForm(
                fromDate = DATE_FORMAT.format(start),
                fromTime = "%02d:%02d".format(start.hour, start.minute),
            )
        }

        private fun toFilter(f: SalesFilterForm): SaleFilter? =
            try {
                val from = parse(f.fromDate, f.fromTime, LocalTime.MIDNIGHT).withSecond(0).atZone(zone).toInstant()
                val to: Instant? =
                    if (f.toDate.isBlank()) {
                        null
                    } else {
                        parse(f.toDate, f.toTime, END_OF_DAY)
                            .withSecond(LAST_SECOND)
                            .withNano(LAST_MILLI_NANOS)
                            .atZone(zone)
                            .toInstant()
                    }
                if (to != null && to < from) {
                    null
                } else {
                    SaleFilter(from, to, f.customer.trim(), f.seller.trim(), f.minCents, f.maxCents)
                }
            } catch (_: DateTimeParseException) {
                null
            }

        private fun parse(
            date: String,
            time: String,
            fallback: LocalTime,
        ): LocalDateTime =
            LocalDateTime.of(
                LocalDate.parse(date.trim(), DATE_FORMAT),
                if (time.isBlank()) fallback else LocalTime.parse(time.trim(), TIME_FORMAT),
            )

        private fun centsOf(typed: String): Long? =
            typed
                .filter { it in '0'..'9' }
                .take(MAX_MONEY_DIGITS)
                .takeIf { it.isNotEmpty() }
                ?.let { Money.centsFromInput(it) }
    }

/** The detail of one sale and its cancel. */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class SaleDetailViewModel
    @Inject
    constructor(
        handle: SavedStateHandle,
        repository: SaleRepository,
        private val writer: SaleWriter,
    ) : ViewModel() {
        private val saleId: String = checkNotNull(handle[SALE_ID_ARG]) { "no sale id" }
        private val busyState = MutableStateFlow(false)
        private val failedState = MutableStateFlow(false)
        private val doneState = MutableStateFlow(false)

        /** Null until the first read; the inner null is a sale this device does not know. */
        val sale: StateFlow<SaleResultState> =
            repository
                .sale(saleId)
                .map<SaleView?, SaleResultState> { SaleResultState.Loaded(it) }
                .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), SaleResultState.Loading)

        val cancelling: StateFlow<Boolean> = busyState.asStateFlow()
        val cancelFailed: StateFlow<Boolean> = failedState.asStateFlow()

        /** The sale was cancelled: the screen leaves. */
        val cancelled: StateFlow<Boolean> = doneState.asStateFlow()

        fun cancel() {
            if (busyState.value) return
            busyState.value = true
            failedState.value = false
            viewModelScope.launch {
                @Suppress("TooGenericExceptionCaught")
                try {
                    writer.cancelSale(saleId)
                    doneState.value = true
                } catch (e: CancellationException) {
                    throw e
                } catch (_: Exception) {
                    failedState.value = true
                } finally {
                    busyState.value = false
                }
            }
        }

        fun dismissError() {
            failedState.value = false
        }
    }

sealed interface SaleResultState {
    data object Loading : SaleResultState

    data class Loaded(
        val sale: SaleView?,
    ) : SaleResultState
}

internal const val SALE_ID_ARG = "saleId"
