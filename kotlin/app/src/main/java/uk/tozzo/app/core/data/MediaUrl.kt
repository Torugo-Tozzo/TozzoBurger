package uk.tozzo.app.core.data

import uk.tozzo.app.BuildConfig

/** The public URL of an object key, like `Media.URL` of the API: the base without a trailing "/", a "/", the key. */
fun mediaUrl(
    key: String?,
    base: String = BuildConfig.MEDIA_BASE_URL,
): String? = if (key.isNullOrEmpty() || base.isEmpty()) null else base.trimEnd('/') + "/" + key
