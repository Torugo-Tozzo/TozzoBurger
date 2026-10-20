package uk.tozzo.app.feature.rejections

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import uk.tozzo.app.core.sync.SyncRejection
import uk.tozzo.app.testing.FakeLocalDatabase

@OptIn(ExperimentalCoroutinesApi::class)
class RejectionsViewModelTest {
    private val db = FakeLocalDatabase()

    @BeforeEach
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @AfterEach
    fun tearDown() = Dispatchers.resetMain()

    @Test
    fun listsTheRejections() =
        runTest(UnconfinedTestDispatcher()) {
            val row = SyncRejection("r1", "sales", "INVALID", "detail", "2026-10-20T10:00:00Z")
            db.rejections.value = listOf(row)
            val vm = RejectionsViewModel(db)
            backgroundScope.launch { vm.rejections.collect {} }
            assertEquals(listOf(row), vm.rejections.value)
        }

    @Test
    fun aDatabaseThatFailsToOpenShowsAnEmptyListWithoutCrashing() =
        runTest(UnconfinedTestDispatcher()) {
            db.rejectionsFailure = IllegalStateException("cannot open")
            val vm = RejectionsViewModel(db)
            backgroundScope.launch { vm.rejections.collect {} }
            assertEquals(emptyList<SyncRejection>(), vm.rejections.value)
        }
}
