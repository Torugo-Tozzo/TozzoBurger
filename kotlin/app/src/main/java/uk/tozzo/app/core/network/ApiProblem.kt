package uk.tozzo.app.core.network

import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import retrofit2.HttpException
import java.io.IOException

/** An `application/problem+json` error from the `/v1` API; [code] is the stable error code. */
data class ApiProblem(
    val status: Int,
    val code: String,
    val title: String,
    val detail: String?,
    /** The device limit, carried by `DEVICE_LIMIT_REACHED`. */
    val limit: Int? = null,
)

class ApiException(
    val problem: ApiProblem,
) : IOException("${problem.status} ${problem.code}")

@Serializable
private data class ProblemBody(
    val title: String,
    val status: Int,
    val code: String,
    val detail: String? = null,
    val limit: Int? = null,
)

/** The API problem carried by this error, or null when it is not an API error with a problem body. */
fun Throwable.toApiProblem(): ApiProblem? =
    when (this) {
        is ApiException -> problem
        is HttpException -> response()?.errorBody()?.use { parseProblem(it.string()) }
        else -> null
    }

/** Parses a problem body; null when [body] is blank or not a problem document. */
internal fun parseProblem(body: String): ApiProblem? {
    if (body.isBlank()) return null
    return try {
        val parsed = ApiJson.decodeFromString(ProblemBody.serializer(), body)
        ApiProblem(parsed.status, parsed.code, parsed.title, parsed.detail, parsed.limit)
    } catch (_: SerializationException) {
        null
    }
}
