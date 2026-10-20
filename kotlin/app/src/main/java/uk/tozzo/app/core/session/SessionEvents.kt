package uk.tozzo.app.core.session

import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import javax.inject.Inject
import javax.inject.Singleton

/** Why the current session can no longer be used. */
sealed interface SessionEvent {
    data object Revoked : SessionEvent

    data object EstablishmentDeleted : SessionEvent

    data object PaymentRequired : SessionEvent
}

/** App-wide stream of [SessionEvent]s; events emitted while nobody collects are dropped. */
@Singleton
class SessionEvents
    @Inject
    constructor() {
        private val flow =
            MutableSharedFlow<SessionEvent>(
                extraBufferCapacity = BUFFER,
                onBufferOverflow = BufferOverflow.DROP_OLDEST,
            )

        val events: SharedFlow<SessionEvent> = flow.asSharedFlow()

        fun emit(e: SessionEvent) {
            flow.tryEmit(e)
        }

        private companion object {
            const val BUFFER = 8
        }
    }
