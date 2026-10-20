package uk.tozzo.app.core.session

import android.os.Build
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import uk.tozzo.app.BuildConfig
import javax.inject.Inject

/** What the app reports about this device; a seam so JVM tests do not depend on `android.os.Build`. */
interface DeviceInfoSource {
    val model: String
    val androidVersion: Int
    val appVersion: String
}

class AndroidDeviceInfoSource
    @Inject
    constructor() : DeviceInfoSource {
        override val model: String = Build.MODEL
        override val androidVersion: Int = Build.VERSION.SDK_INT
        override val appVersion: String = BuildConfig.VERSION_NAME
    }

@Module
@InstallIn(SingletonComponent::class)
abstract class DeviceInfoModule {
    @Binds
    abstract fun deviceInfoSource(impl: AndroidDeviceInfoSource): DeviceInfoSource
}
