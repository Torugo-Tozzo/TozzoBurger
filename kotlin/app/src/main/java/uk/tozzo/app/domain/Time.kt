@file:Suppress("ktlint:standard:filename")

package uk.tozzo.app.domain

import java.time.Instant
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeFormatterBuilder
import java.time.format.DateTimeParseException
import java.time.temporal.ChronoField

private const val NANO_DIGITS = 9

/**
 * Timestamps of the local database. The sync stores them as `YYYY-MM-DD hh:mm:ss.sss` (UTC), as
 * the server sends them; the API upload takes RFC 3339 (`2026-10-20T12:00:00.000Z`).
 */
object DbTime {
    private val syncFormat: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss.SSS")
    private val rfc3339: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
    private val syncParse: DateTimeFormatter =
        DateTimeFormatterBuilder()
            .appendPattern("yyyy-MM-dd HH:mm:ss")
            .appendFraction(ChronoField.NANO_OF_SECOND, 0, NANO_DIGITS, true)
            .toFormatter()

    /** Both the sync format and ISO-8601 with a zone; null when [value] is neither. */
    fun parse(value: String?): Instant? {
        if (value.isNullOrBlank()) return null
        return try {
            if (value.contains('T')) {
                OffsetDateTime.parse(value, DateTimeFormatter.ISO_OFFSET_DATE_TIME).toInstant()
            } else {
                LocalDateTime.parse(value, syncParse).toInstant(ZoneOffset.UTC)
            }
        } catch (_: DateTimeParseException) {
            null
        }
    }

    /** The sync format, in UTC, with milliseconds. */
    fun format(instant: Instant): String = syncFormat.format(instant.atOffset(ZoneOffset.UTC))

    /** [value] as RFC 3339 UTC with milliseconds, or null when it cannot be parsed. */
    fun toRfc3339(value: String?): String? = parse(value)?.let { rfc3339.format(it.atOffset(ZoneOffset.UTC)) }
}
