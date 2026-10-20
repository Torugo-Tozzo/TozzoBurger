package uk.tozzo.app.core.sync

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import uk.tozzo.app.core.session.DeviceBinding
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class SyncModule {
    @Binds
    abstract fun localDatabase(impl: TozzoDatabase): LocalDatabase

    @Binds
    abstract fun connectivity(impl: ConnectivityWatcher): Connectivity

    companion object {
        @Provides
        @Singleton
        fun syncController(
            db: LocalDatabase,
            connectivity: Connectivity,
            binding: DeviceBinding,
        ): SyncController =
            SyncController(db, connectivity, binding, CoroutineScope(SupervisorJob() + Dispatchers.Default))
    }
}
