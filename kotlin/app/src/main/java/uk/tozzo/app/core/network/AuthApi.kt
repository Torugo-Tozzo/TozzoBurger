package uk.tozzo.app.core.network

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST

interface AuthApi {
    @POST("/v1/auth/login")
    suspend fun login(
        @Body body: LoginRequest,
    ): SessionBody

    @POST("/v1/auth/refresh")
    suspend fun refresh(
        @Body body: RefreshRequest,
    ): SessionBody

    @POST("/v1/auth/logout")
    suspend fun logout(
        @Body body: LogoutRequest,
    )

    /** Logout with an explicit bearer; meant for the [RefreshClient] API (no authenticator, no stored tokens). */
    @POST("/v1/auth/logout")
    suspend fun logoutWith(
        @Header("Authorization") bearer: String,
        @Body body: LogoutRequest,
    )

    @GET("/v1/me")
    suspend fun me(): Me
}
