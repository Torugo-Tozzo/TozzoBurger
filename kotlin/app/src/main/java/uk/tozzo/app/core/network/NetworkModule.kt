package uk.tozzo.app.core.network

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import retrofit2.create
import uk.tozzo.app.BuildConfig
import java.util.concurrent.TimeUnit
import javax.inject.Qualifier
import javax.inject.Singleton

/** The [AuthApi] on a separate OkHttp client, used only to refresh the session. */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class RefreshClient

/** The OkHttp client of the presigned image PUT: no auth interceptor, so the token never reaches the storage host. */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class PresignClient

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {
    private const val CONNECT_TIMEOUT_SECONDS = 15L
    private const val READ_TIMEOUT_SECONDS = 30L
    private const val CALL_TIMEOUT_SECONDS = 60L
    private const val UPLOAD_CALL_TIMEOUT_SECONDS = 180L

    @Provides
    @Singleton
    fun okHttpClient(
        authInterceptor: AuthInterceptor,
        tokenAuthenticator: TokenAuthenticator,
    ): OkHttpClient =
        baseClient()
            .addInterceptor(authInterceptor)
            .authenticator(tokenAuthenticator)
            .build()

    @Provides
    @Singleton
    fun retrofit(client: OkHttpClient): Retrofit = apiRetrofit(BuildConfig.API_BASE_URL, client)

    @Provides
    @Singleton
    fun authApi(retrofit: Retrofit): AuthApi = retrofit.create()

    /**
     * Own client (own dispatcher, no auth): the requests waiting for a refresh hold the main
     * client's per-host slots, so a refresh queued there would never run.
     */
    @Provides
    @Singleton
    @RefreshClient
    fun refreshAuthApi(): AuthApi = apiRetrofit(BuildConfig.API_BASE_URL, refreshOkHttpClient()).create()

    @Provides
    @Singleton
    fun deviceApi(retrofit: Retrofit): DeviceApi = retrofit.create()

    @Provides
    @Singleton
    fun syncApi(retrofit: Retrofit): SyncApi = retrofit.create()

    @Provides
    @Singleton
    fun uploadsApi(retrofit: Retrofit): UploadsApi = retrofit.create()

    @Provides
    @Singleton
    @PresignClient
    fun presignClient(): OkHttpClient = baseClient().callTimeout(UPLOAD_CALL_TIMEOUT_SECONDS, TimeUnit.SECONDS).build()

    internal fun refreshOkHttpClient(): OkHttpClient = baseClient().build()

    internal fun apiRetrofit(
        baseUrl: String,
        client: OkHttpClient,
    ): Retrofit =
        Retrofit
            .Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(ApiJson.asConverterFactory("application/json".toMediaType()))
            .build()

    private fun baseClient(): OkHttpClient.Builder =
        OkHttpClient
            .Builder()
            .connectTimeout(CONNECT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .readTimeout(READ_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .callTimeout(CALL_TIMEOUT_SECONDS, TimeUnit.SECONDS)
}
