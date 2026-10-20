package uk.tozzo.app.core.network

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

/** JSON settings shared by the `/v1` client: tolerant of new fields, sends defaults, omits nulls. */
val ApiJson =
    Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        explicitNulls = false
    }

@Serializable
data class LoginRequest(
    val email: String,
    val password: String,
    val client: String = "android",
    val deviceName: String?,
)

@Serializable
data class RefreshRequest(
    val refreshToken: String,
)

@Serializable
data class LogoutRequest(
    val allSessions: Boolean = false,
)

@Serializable
data class SessionBody(
    val accessToken: String,
    val accessTokenExpiresAt: String,
    val refreshToken: String? = null,
    val user: Me,
)

@Serializable
data class Me(
    val id: String,
    val name: String,
    val email: String,
    val role: String,
    val locale: String?,
    val establishment: MeEstablishment,
)

@Serializable
data class MeEstablishment(
    val id: String,
    val tradeName: String,
    val status: String,
    val plan: String,
    val category: String?,
    val businessProfiles: List<String>?,
    val visibleModules: List<String>?,
    val preferencesRevision: Int,
)

@Serializable
data class RegisterDeviceRequest(
    val id: String,
    val info: DeviceInfo,
)

@Serializable
data class DeviceInfo(
    val model: String,
    val androidVersion: Int,
    val appVersion: String,
)

@Serializable
data class SyncTokenBody(
    val token: String,
    val endpoint: String,
    val expiresAt: String,
)

@Serializable
data class UploadRequest(
    val deviceId: String,
    val ops: List<JsonObject>,
)

@Serializable
data class UploadResult(
    val opId: String,
    val status: String,
    val code: String? = null,
    val detail: String? = null,
)

@Serializable
data class UploadResponse(
    val results: List<UploadResult>,
)
