package uk.tozzo.app.feature.rejections

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.stateIn
import uk.tozzo.app.core.sync.LocalDatabase
import uk.tozzo.app.core.sync.SyncRejection
import javax.inject.Inject

@HiltViewModel
class RejectionsViewModel
    @Inject
    constructor(
        db: LocalDatabase,
    ) : ViewModel() {
        /** Null until the first read of the table; empty when the database cannot be opened. */
        val rejections: StateFlow<List<SyncRejection>?> =
            db
                .watchRejections()
                .catch { emit(emptyList()) }
                .stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), null)

        private companion object {
            const val STOP_TIMEOUT_MS = 5_000L
        }
    }
