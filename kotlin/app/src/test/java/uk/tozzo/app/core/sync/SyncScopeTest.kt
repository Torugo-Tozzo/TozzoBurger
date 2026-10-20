package uk.tozzo.app.core.sync

import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.util.Collections

class SyncScopeTest {
    @Test
    fun anUncaughtFailureIsReportedAndTheScopeLives() =
        runBlocking {
            val errors = Collections.synchronizedList(mutableListOf<Throwable>())
            val scope = syncScope { errors += it }

            scope.launch { throw IllegalStateException("cannot open") }.join()

            assertEquals(listOf("cannot open"), errors.map { it.message })
            assertTrue(scope.isActive)
            var ran = false
            scope.launch { ran = true }.join()
            assertTrue(ran)
        }
}
