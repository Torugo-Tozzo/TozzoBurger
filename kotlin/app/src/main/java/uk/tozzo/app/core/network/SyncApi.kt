package uk.tozzo.app.core.network

import retrofit2.http.Body
import retrofit2.http.POST

interface SyncApi {
    @POST("/v1/sync/token")
    suspend fun token(): SyncTokenBody

    @POST("/v1/sync/upload")
    suspend fun upload(
        @Body body: UploadRequest,
    ): UploadResponse
}
