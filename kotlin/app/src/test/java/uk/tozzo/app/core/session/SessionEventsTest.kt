package uk.tozzo.app.core.session

import app.cash.turbine.test
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class SessionEventsTest {
    private val events = SessionEvents()

    @Test
    fun eventEmittedWithoutCollectorIsDeliveredOnce() =
        runTest {
            events.emit(SessionEvent.Revoked)

            events.events.test {
                assertEquals(SessionEvent.Revoked, awaitItem())
                expectNoEvents()
            }
        }

    @Test
    fun consumedEventIsNotDeliveredAgain() =
        runTest {
            events.emit(SessionEvent.Revoked)
            events.consume()

            events.events.test { expectNoEvents() }
        }

    @Test
    fun liveCollectorReceivesEachEvent() =
        runTest {
            events.events.test {
                events.emit(SessionEvent.PaymentRequired)
                events.emit(SessionEvent.EstablishmentDeleted)

                assertEquals(SessionEvent.PaymentRequired, awaitItem())
                assertEquals(SessionEvent.EstablishmentDeleted, awaitItem())
            }
        }
}
