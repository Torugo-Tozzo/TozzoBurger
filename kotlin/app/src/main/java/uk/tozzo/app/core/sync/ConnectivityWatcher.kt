package uk.tozzo.app.core.sync

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

/** Whether the device has a usable internet connection. */
interface Connectivity {
    val online: StateFlow<Boolean>
}

/** [Connectivity] from the default network: online when it has validated internet access. */
@Singleton
class ConnectivityWatcher
    @Inject
    constructor(
        @ApplicationContext context: Context,
    ) : Connectivity {
        private val manager = context.getSystemService(ConnectivityManager::class.java)
        private val state = MutableStateFlow(manager.getNetworkCapabilities(manager.activeNetwork).isOnline())

        override val online: StateFlow<Boolean> = state.asStateFlow()

        init {
            manager.registerDefaultNetworkCallback(
                object : ConnectivityManager.NetworkCallback() {
                    override fun onCapabilitiesChanged(
                        network: Network,
                        capabilities: NetworkCapabilities,
                    ) {
                        state.value = capabilities.isOnline()
                    }

                    override fun onLost(network: Network) {
                        state.value = false
                    }
                },
            )
        }

        private fun NetworkCapabilities?.isOnline(): Boolean =
            this != null &&
                hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }
