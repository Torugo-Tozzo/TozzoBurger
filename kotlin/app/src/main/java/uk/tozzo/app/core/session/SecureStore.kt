package uk.tozzo.app.core.session

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStoreFile
import com.google.crypto.tink.Aead
import com.google.crypto.tink.KeyTemplates
import com.google.crypto.tink.RegistryConfiguration
import com.google.crypto.tink.aead.AeadConfig
import com.google.crypto.tink.integration.android.AndroidKeysetManager
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import java.security.GeneralSecurityException
import java.util.Base64
import javax.inject.Inject
import javax.inject.Singleton

/** Small key-value store for secrets. */
interface SecureStore {
    suspend fun get(key: String): String?

    /** Stores [value] under [key]; null removes the key. */
    suspend fun put(
        key: String,
        value: String?,
    )

    suspend fun clear()
}

/**
 * [SecureStore] on DataStore Preferences. Values are encrypted with Tink AEAD (AES-256-GCM, the key
 * as associated data); the keyset is itself encrypted by a master key in the Android Keystore.
 */
@Singleton
class TinkSecureStore
    @Inject
    constructor(
        @param:ApplicationContext private val context: Context,
    ) : SecureStore {
        private val dataStore: DataStore<Preferences> =
            PreferenceDataStoreFactory.create { context.preferencesDataStoreFile(DATASTORE_NAME) }

        private val aead: Aead by lazy {
            AeadConfig.register()
            AndroidKeysetManager
                .Builder()
                .withSharedPref(context, KEYSET_NAME, KEYSET_PREFS)
                .withKeyTemplate(KeyTemplates.get("AES256_GCM"))
                .withMasterKeyUri(MASTER_KEY_URI)
                .build()
                .keysetHandle
                .getPrimitive(RegistryConfiguration.get(), Aead::class.java)
        }

        override suspend fun get(key: String): String? =
            withContext(Dispatchers.IO) {
                val stored = dataStore.data.first()[stringPreferencesKey(key)] ?: return@withContext null
                try {
                    String(aead.decrypt(Base64.getDecoder().decode(stored), key.toByteArray()), Charsets.UTF_8)
                } catch (_: GeneralSecurityException) {
                    null
                } catch (_: IllegalArgumentException) {
                    null
                }
            }

        override suspend fun put(
            key: String,
            value: String?,
        ) {
            withContext(Dispatchers.IO) {
                val encrypted =
                    value?.let {
                        val cipher = aead.encrypt(it.toByteArray(Charsets.UTF_8), key.toByteArray())
                        Base64.getEncoder().encodeToString(cipher)
                    }
                dataStore.edit { prefs ->
                    val prefKey = stringPreferencesKey(key)
                    if (encrypted == null) prefs.remove(prefKey) else prefs[prefKey] = encrypted
                }
            }
        }

        override suspend fun clear() {
            withContext(Dispatchers.IO) { dataStore.edit { it.clear() } }
        }

        private companion object {
            const val DATASTORE_NAME = "secure_store"
            const val KEYSET_NAME = "secure_store_keyset"
            const val KEYSET_PREFS = "secure_store_keyset_prefs"
            const val MASTER_KEY_URI = "android-keystore://tozzo_secure_store_master_key"
        }
    }

@Module
@InstallIn(SingletonComponent::class)
abstract class SecureStoreModule {
    @Binds
    abstract fun secureStore(impl: TinkSecureStore): SecureStore
}
