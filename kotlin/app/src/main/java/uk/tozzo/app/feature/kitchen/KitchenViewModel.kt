package uk.tozzo.app.feature.kitchen

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import uk.tozzo.app.core.data.KitchenCard
import uk.tozzo.app.core.data.KitchenRepository
import uk.tozzo.app.core.data.OrderWriter
import uk.tozzo.app.domain.ItemStatus
import uk.tozzo.app.domain.KitchenStage
import javax.inject.Inject

private const val STOP_TIMEOUT_MS = 5_000L

/** The kitchen board; moving a card writes the local database, which moves it between the tabs at once. */
@HiltViewModel
class KitchenViewModel
    @Inject
    constructor(
        repository: KitchenRepository,
        private val writer: OrderWriter,
    ) : ViewModel() {
        /** Null until the first read of the database. */
        val board: StateFlow<Map<KitchenStage, List<KitchenCard>>?> =
            repository.board().stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), null)

        private val failed = MutableStateFlow(false)
        private val shownInfo = MutableStateFlow<KitchenCard?>(null)

        /**
         * The last move was refused (the order closed or left for delivery meanwhile). The screen shows it once
         * and clears it with [dismissError].
         */
        val moveFailed: StateFlow<Boolean> = failed.asStateFlow()

        /** The card whose order information is open. */
        val info: StateFlow<KitchenCard?> = shownInfo.asStateFlow()

        /** Every item of [card] goes to [target], in one transaction; no-op when the card is already there. */
        fun move(
            card: KitchenCard,
            target: KitchenStage,
        ) {
            if (card.stage == target) return
            failed.value = false
            val status = if (target == KitchenStage.READY) ItemStatus.READY else ItemStatus.IN_PREPARATION
            viewModelScope.launch {
                runCatching { writer.setItemsStatus(card.itemIds, status) }
                    .onFailure { failed.value = true }
            }
        }

        fun dismissError() {
            failed.value = false
        }

        fun showInfo(card: KitchenCard) {
            shownInfo.value = card
        }

        fun dismissInfo() {
            shownInfo.value = null
        }
    }
