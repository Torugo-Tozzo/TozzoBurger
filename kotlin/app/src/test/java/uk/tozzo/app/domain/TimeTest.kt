package uk.tozzo.app.domain

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import java.time.Instant

class TimeTest {
    @Test
    fun syncFormatAndIsoGiveTheSameInstant() {
        val expected = Instant.parse("2026-10-20T12:00:00.123Z")

        assertEquals(expected, DbTime.parse("2026-10-20 12:00:00.123"))
        assertEquals(expected, DbTime.parse("2026-10-20T12:00:00.123Z"))
        assertEquals(Instant.parse("2026-10-20T12:00:00Z"), DbTime.parse("2026-10-20 12:00:00"))
    }

    @Test
    fun invalidGivesNull() {
        assertNull(DbTime.parse("ontem"))
        assertNull(DbTime.parse(""))
        assertNull(DbTime.parse(null))
    }

    @Test
    fun formatThenParseReturnsTheSameInstant() {
        val instant = Instant.parse("2026-10-20T12:34:56.789Z")

        assertEquals("2026-10-20 12:34:56.789", DbTime.format(instant))
        assertEquals(instant, DbTime.parse(DbTime.format(instant)))
    }

    @Test
    fun rfc3339KeepsMilliseconds() {
        assertEquals("2026-10-20T12:00:00.000Z", DbTime.toRfc3339("2026-10-20 12:00:00.000"))
        assertNull(DbTime.toRfc3339("nope"))
    }

    @Test
    fun isoOffsetsOtherThanZAreAccepted() {
        assertEquals(Instant.parse("2026-10-20T12:00:00Z"), DbTime.parse("2026-10-20T12:00:00+00:00"))
        assertEquals(Instant.parse("2026-10-20T12:00:00Z"), DbTime.parse("2026-10-20T09:00:00-03:00"))
    }

    @Test
    fun zoneLessIsoFromTheServerReadsAsUtc() {
        assertEquals(Instant.parse("2026-10-22T16:48:23.775Z"), DbTime.parse("2026-10-22T16:48:23.775000"))
        assertEquals(Instant.parse("2026-10-22T16:48:23Z"), DbTime.parse("2026-10-22T16:48:23"))
        assertEquals(Instant.parse("2026-10-22T16:48:23.775Z"), DbTime.parse("2026-10-22T16:48:23.775Z"))
        assertEquals(Instant.parse("2026-10-22T16:53:07.672Z"), DbTime.parse("2026-10-22 16:53:07.672"))
        assertEquals(Instant.parse("2026-10-22T19:48:23Z"), DbTime.parse("2026-10-22T16:48:23-03:00"))
        assertNull(DbTime.parse("2026-10-22T99:48:23"))
    }
}
