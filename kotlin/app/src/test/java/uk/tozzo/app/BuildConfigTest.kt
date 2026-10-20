package uk.tozzo.app

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class BuildConfigTest {
    @Test
    fun apiBaseUrlPointsToDev() {
        assertEquals("https://dev-api.tozzo.uk", BuildConfig.API_BASE_URL)
    }
}
