package uk.tozzo.app.core.session

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import uk.tozzo.app.core.network.ApiJson
import uk.tozzo.app.domain.EstablishmentModules
import uk.tozzo.app.domain.Role
import javax.inject.Inject
import javax.inject.Singleton

/** The one user and establishment this device is bound to. */
@Serializable
data class Binding(
    val userId: String,
    val establishmentId: String,
    val role: Role,
    val userName: String,
    val establishmentName: String,
    val modules: EstablishmentModules,
    val plan: String,
)

/** Keeps the [Binding] in the [SecureStore] (as JSON) and exposes the current one. */
@Singleton
class DeviceBinding
    @Inject
    constructor(
        private val secure: SecureStore,
    ) {
        private val state = MutableStateFlow<Binding?>(null)

        val current: StateFlow<Binding?> = state.asStateFlow()

        /** Reads the stored binding; an unreadable one counts as none. */
        suspend fun load() {
            state.value =
                secure.get(BINDING_KEY)?.let {
                    try {
                        ApiJson.decodeFromString(Binding.serializer(), it)
                    } catch (_: SerializationException) {
                        null
                    } catch (_: IllegalArgumentException) {
                        null
                    }
                }
        }

        suspend fun save(b: Binding) {
            secure.put(BINDING_KEY, ApiJson.encodeToString(Binding.serializer(), b))
            state.value = b
        }

        suspend fun clear() {
            secure.put(BINDING_KEY, null)
            state.value = null
        }

        private companion object {
            const val BINDING_KEY = "binding"
        }
    }
