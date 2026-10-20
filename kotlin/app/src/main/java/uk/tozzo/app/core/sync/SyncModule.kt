package uk.tozzo.app.core.sync

import android.util.Log
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import uk.tozzo.app.core.session.DeviceBinding
import uk.tozzo.app.core.session.LocalDataGate
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class SyncModule {
    @Binds
    abstract fun localDatabase(impl: TozzoDatabase): LocalDatabase

    @Binds
    abstract fun connectivity(impl: ConnectivityWatcher): Connectivity

    @Binds
    abstract fun localDataGate(impl: SyncController): LocalDataGate

    companion object {
        @Provides
        @Singleton
        fun syncController(
            db: LocalDatabase,
            connectivity: Connectivity,
            binding: DeviceBinding,
        ): SyncController = SyncController(db, connectivity, binding, syncScope(::logSyncFailure))
    }
}

/**
 * The scope of the sync. A failure no collector handled is reported to [onError] instead of
 * reaching the thread's handler and killing the process; the other jobs keep running.
 */
internal fun syncScope(onError: (Throwable) -> Unit): CoroutineScope =
    CoroutineScope(SupervisorJob() + Dispatchers.Default + CoroutineExceptionHandler { _, e -> onError(e) })

private fun logSyncFailure(e: Throwable) {
    Log.e("TozzoSync", "Unhandled sync failure", e)
}
