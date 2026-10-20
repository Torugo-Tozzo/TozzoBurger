package uk.tozzo.app.core.network

import retrofit2.http.Body
import retrofit2.http.POST

interface DeviceApi {
    @POST("/v1/devices")
    suspend fun register(
        @Body body: RegisterDeviceRequest,
    )
}
