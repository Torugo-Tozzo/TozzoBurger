package uk.tozzo.app.core.network

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import retrofit2.HttpException
import retrofit2.Response

class ApiProblemTest {
    private val problemJson = "application/problem+json".toMediaType()

    private fun httpError(
        status: Int,
        body: String,
    ): HttpException = HttpException(Response.error<Unit>(status, body.toResponseBody(problemJson)))

    @Test
    fun problemBodyBecomesApiProblem() {
        val error = httpError(402, """{"title":"Payment required","status":402,"code":"PAYMENT_REQUIRED"}""")

        assertEquals(ApiProblem(402, "PAYMENT_REQUIRED", "Payment required", null), error.toApiProblem())
    }

    @Test
    fun unknownFieldsAreIgnored() {
        val body =
            """{"type":"about:blank","title":"Gone","status":410,"code":"ESTABLISHMENT_DELETED",""" +
                """"detail":"d","instance":"r1"}"""

        assertEquals(ApiProblem(410, "ESTABLISHMENT_DELETED", "Gone", "d"), httpError(410, body).toApiProblem())
    }

    @Test
    fun emptyBodyIsNull() {
        assertNull(httpError(500, "").toApiProblem())
    }

    @Test
    fun apiExceptionKeepsItsProblem() {
        val problem = ApiProblem(401, "SESSION_REVOKED", "Unauthorized", null)

        assertEquals(problem, ApiException(problem).toApiProblem())
    }

    @Test
    fun otherThrowableIsNull() {
        assertNull(IllegalStateException("x").toApiProblem())
    }
}
