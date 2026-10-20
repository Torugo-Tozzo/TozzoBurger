package uk.tozzo.app.core.data

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import uk.tozzo.app.BuildConfig

class MediaUrlTest {
    @Test
    fun joinsTheBaseAndTheKeyWithOneSlash() {
        assertEquals("https://m.example/a/b.jpg", mediaUrl("a/b.jpg", "https://m.example"))
        assertEquals("https://m.example/a/b.jpg", mediaUrl("a/b.jpg", "https://m.example///"))
    }

    @Test
    fun noKeyOrNoBaseMeansNoUrl() {
        assertNull(mediaUrl(null, "https://m.example"))
        assertNull(mediaUrl("", "https://m.example"))
        assertNull(mediaUrl("a.jpg", ""))
    }

    @Test
    fun theDevBaseComesFromTheBuildConfig() {
        assertEquals("https://media-dev.tozzo.uk", BuildConfig.MEDIA_BASE_URL)
    }
}
