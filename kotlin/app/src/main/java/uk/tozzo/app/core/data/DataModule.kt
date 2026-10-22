package uk.tozzo.app.core.data

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import java.time.Clock

@Module
@InstallIn(SingletonComponent::class)
abstract class DataModule {
    @Binds
    abstract fun localSql(impl: PowerSyncLocalSql): LocalSql

    @Binds
    abstract fun imageSource(impl: ContentResolverImageSource): ImageSource

    companion object {
        @Provides
        fun clock(): Clock = Clock.systemUTC()
    }
}
