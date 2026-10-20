package uk.tozzo.app.core.session

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/** The id of this installation: a UUID v4 generated once and kept in the [SecureStore]. */
@Singleton
class DeviceIdentity
    @Inject
    constructor(
        private val secure: SecureStore,
    ) {
        private val mutex = Mutex()

        suspend fun id(): String =
            mutex.withLock {
                secure.get(DEVICE_ID_KEY) ?: UUID.randomUUID().toString().also { secure.put(DEVICE_ID_KEY, it) }
            }

        private companion object {
            const val DEVICE_ID_KEY = "device_id"
        }
    }
