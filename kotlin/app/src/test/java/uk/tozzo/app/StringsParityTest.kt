package uk.tozzo.app

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.io.File

class StringsParityTest {
    private val resDir = File("src/main/res")
    private val folders = listOf("values-pt-rBR", "values-es", "values-fr", "values-hi", "values-zh")
    private val keyRegex = Regex("""<string\s+name="([^"]+)"""")

    private fun keys(folder: String): Set<String> {
        val file = File(resDir, "$folder/strings.xml")
        check(file.exists()) { "Missing ${file.path}" }
        return keyRegex.findAll(file.readText()).map { it.groupValues[1] }.toSet()
    }

    @Test
    fun `every locale has exactly the keys of the default strings`() {
        val base = keys("values")
        folders.forEach { folder -> assertEquals(base, keys(folder), "Key mismatch in $folder") }
    }
}
