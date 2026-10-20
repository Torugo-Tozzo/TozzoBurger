package uk.tozzo.app.core.data

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okio.BufferedSink
import okio.source
import uk.tozzo.app.core.network.CreateUploadRequest
import uk.tozzo.app.core.network.PresignClient
import uk.tozzo.app.core.network.SetProductImageRequest
import uk.tozzo.app.core.network.UploadsApi
import uk.tozzo.app.core.network.toApiProblem
import java.io.IOException
import javax.inject.Inject

/** What the picked file is, read before anything is sent. */
data class ImageInfo(
    val contentType: String?,
    val sizeBytes: Long,
)

/** Reads the file the Photo Picker returned. */
interface ImageSource {
    /** Type and size of the file, or null when it cannot be read. */
    fun info(uri: Uri): ImageInfo?

    fun body(
        uri: Uri,
        contentType: String,
        sizeBytes: Long,
    ): RequestBody
}

/** [ImageSource] on the content resolver: the Photo Picker grants access to the picked file, no permission needed. */
class ContentResolverImageSource
    @Inject
    constructor(
        @ApplicationContext private val context: Context,
    ) : ImageSource {
        @Suppress("TooGenericExceptionCaught")
        override fun info(uri: Uri): ImageInfo? =
            try {
                val resolver = context.contentResolver
                val type = resolver.getType(uri)
                val size =
                    resolver.query(uri, arrayOf(OpenableColumns.SIZE), null, null, null)?.use { cursor ->
                        if (cursor.moveToFirst() && !cursor.isNull(0)) cursor.getLong(0) else null
                    } ?: countBytes(uri)
                ImageInfo(type, size)
            } catch (_: IOException) {
                null
            } catch (_: SecurityException) {
                null
            }

        override fun body(
            uri: Uri,
            contentType: String,
            sizeBytes: Long,
        ): RequestBody =
            object : RequestBody() {
                override fun contentType() = contentType.toMediaTypeOrNull()

                override fun contentLength() = sizeBytes

                override fun writeTo(sink: BufferedSink) {
                    val input = context.contentResolver.openInputStream(uri) ?: throw IOException("cannot open $uri")
                    input.source().use { sink.writeAll(it) }
                }
            }

        // Some providers do not report a size: read the file once to count it.
        private fun countBytes(uri: Uri): Long {
            val input = context.contentResolver.openInputStream(uri) ?: return 0
            return input.use { stream ->
                val buffer = ByteArray(BUFFER_BYTES)
                var total = 0L
                var read = 0
                while (read >= 0 && total <= ProductImageUploader.MAX_BYTES) {
                    read = stream.read(buffer)
                    if (read > 0) total += read
                }
                total
            }
        }

        private companion object {
            const val BUFFER_BYTES = 16 * 1024
        }
    }

class ImageUploadException(
    val reason: Reason,
    cause: Throwable? = null,
) : IOException(reason.name, cause) {
    enum class Reason {
        /** Not a JPEG, PNG or WebP of up to 5 MiB: checked here before sending, or answered `UPLOAD_INVALID`. */
        INVALID,

        /** 503 `NOT_READY`: the server has no image storage yet. */
        NOT_READY,

        /** Any other failure: network, the presigned PUT, `UPLOAD_NOT_FOUND`, a role that may not edit products. */
        FAILED,
    }
}

/**
 * The online-only image of a product: ask for a presigned upload, PUT the file there, tell the product
 * its new key. The PUT goes through a client with no auth interceptor: the signature is in the URL and
 * the token must not reach the storage host.
 */
class ProductImageUploader
    @Inject
    constructor(
        private val api: UploadsApi,
        @param:PresignClient private val putClient: OkHttpClient,
        private val source: ImageSource,
    ) {
        /** Returns the object key now set as the product's image; throws [ImageUploadException]. */
        suspend fun upload(
            productId: String,
            uri: Uri,
        ): String {
            val info = withContext(Dispatchers.IO) { source.info(uri) }
            val type = info?.contentType
            if (info == null || type !in ACCEPTED_TYPES || info.sizeBytes !in 1..MAX_BYTES) {
                throw ImageUploadException(ImageUploadException.Reason.INVALID)
            }
            val ticket = call { api.create(CreateUploadRequest("product", productId, type!!, info.sizeBytes)) }
            put(ticket.uploadUrl, ticket.headers, source.body(uri, type!!, info.sizeBytes), type)
            call { api.setProductImage(productId, SetProductImageRequest(ticket.objectKey)) }
            return ticket.objectKey
        }

        private suspend fun put(
            url: String,
            signedHeaders: Map<String, String>,
            body: RequestBody,
            contentType: String,
        ) = withContext(Dispatchers.IO) {
            val request =
                try {
                    Request
                        .Builder()
                        .url(url)
                        .put(body)
                        .apply {
                            signedHeaders
                                .filterKeys { it.lowercase() !in UNSIGNABLE_HEADERS }
                                .forEach { (name, value) -> header(name, value) }
                            header("Content-Type", contentType)
                        }.build()
                } catch (e: IllegalArgumentException) {
                    throw ImageUploadException(ImageUploadException.Reason.FAILED, e)
                }
            try {
                putClient.newCall(request).execute().use { response ->
                    if (!response.isSuccessful) throw ImageUploadException(ImageUploadException.Reason.FAILED)
                }
            } catch (e: IOException) {
                if (e is ImageUploadException) throw e
                throw ImageUploadException(ImageUploadException.Reason.FAILED, e)
            }
        }

        private suspend fun <T> call(block: suspend () -> T): T =
            try {
                block()
            } catch (e: IOException) {
                throw ImageUploadException(reasonOf(e), e)
            } catch (e: retrofit2.HttpException) {
                throw ImageUploadException(reasonOf(e), e)
            }

        private fun reasonOf(error: Throwable): ImageUploadException.Reason =
            when (error.toApiProblem()?.code) {
                "NOT_READY" -> ImageUploadException.Reason.NOT_READY
                "UPLOAD_INVALID" -> ImageUploadException.Reason.INVALID
                else -> ImageUploadException.Reason.FAILED
            }

        companion object {
            const val MAX_BYTES = 5L * 1024 * 1024
            private val ACCEPTED_TYPES = setOf("image/jpeg", "image/png", "image/webp")

            // The client sets these itself; a signed copy would clash with the real length and host.
            private val UNSIGNABLE_HEADERS = setOf("content-length", "host")
        }
    }
