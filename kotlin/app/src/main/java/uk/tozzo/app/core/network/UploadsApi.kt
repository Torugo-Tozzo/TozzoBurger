package uk.tozzo.app.core.network

import kotlinx.serialization.Serializable
import retrofit2.http.Body
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Path

@Serializable
data class CreateUploadRequest(
    val kind: String,
    val targetId: String,
    val contentType: String,
    val sizeBytes: Long,
)

/** A presigned upload: PUT the file to [uploadUrl] with [headers], then send [objectKey] to the resource. */
@Serializable
data class UploadTicket(
    val uploadUrl: String,
    val objectKey: String,
    val headers: Map<String, String> = emptyMap(),
)

@Serializable
data class SetProductImageRequest(
    val imageKey: String,
)

/** The online-only calls of a product image; the product data itself goes up through the sync. */
interface UploadsApi {
    @POST("/v1/uploads")
    suspend fun create(
        @Body body: CreateUploadRequest,
    ): UploadTicket

    @PATCH("/v1/products/{id}")
    suspend fun setProductImage(
        @Path("id") productId: String,
        @Body body: SetProductImageRequest,
    )
}
