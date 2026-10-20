package uk.tozzo.app.core.sync

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import java.util.UUID

class UploadMapperTest {
    private val salePut =
        PendingOp(
            clientId = 7,
            op = "PUT",
            table = "sales",
            id = "sale-1",
            data =
                mapOf(
                    "total" to "12.50",
                    "is_cancelled" to 0L,
                    "customer_name" to null,
                    "items_json" to """[{"product_id":"p1","quantity":2,"unit_price_cents":625}]""",
                ),
        )

    private fun dataOf(json: JsonObject?): JsonObject = json!!["data"]!!.jsonObject

    @Test
    fun envelopeCarriesOpIdOpTableAndId() {
        val json = UploadMapper.toJson(salePut, DEVICE)!!

        assertEquals(JsonPrimitive(UploadMapper.opId(DEVICE, 7)), json["opId"])
        assertEquals(JsonPrimitive("PUT"), json["op"])
        assertEquals(JsonPrimitive("sales"), json["table"])
        assertEquals(JsonPrimitive("sale-1"), json["id"])
    }

    @Test
    fun isColumnsBecomeBooleans() {
        val data = dataOf(UploadMapper.toJson(salePut, DEVICE))
        assertEquals(JsonPrimitive(false), data["is_cancelled"])

        val order = PendingOp(1, "PATCH", "orders", "o1", mapOf("is_open" to 1L, "is_delivery" to 0L))
        val orderData = dataOf(UploadMapper.toJson(order, DEVICE))
        assertEquals(JsonPrimitive(true), orderData["is_open"])
        assertEquals(JsonPrimitive(false), orderData["is_delivery"])
    }

    @Test
    fun typedValuesKeepTheirTypes() {
        val item = PendingOp(2, "PUT", "order_items", "i1", mapOf("quantity" to 3L, "unit_price" to "4.00"))
        val data = dataOf(UploadMapper.toJson(item, DEVICE))

        assertEquals(JsonPrimitive(3L), data["quantity"])
        assertEquals(JsonPrimitive("4.00"), data["unit_price"])
        assertEquals(JsonNull, dataOf(UploadMapper.toJson(salePut, DEVICE))["customer_name"])
    }

    @Test
    fun salePutEmbedsItemsAndDropsItemsJson() {
        val data = dataOf(UploadMapper.toJson(salePut, DEVICE))

        assertFalse(data.containsKey("items_json"))
        val items = data["items"]!!.jsonArray
        assertEquals(1, items.size)
        assertEquals(JsonPrimitive("p1"), items[0].jsonObject["product_id"])
        assertEquals(JsonPrimitive(2), items[0].jsonObject["quantity"])
    }

    @Test
    fun salePutWithoutItemsJsonSendsEmptyItems() {
        val sale = salePut.copy(data = mapOf("total" to "0.00"))
        assertEquals(JsonArray(emptyList()), dataOf(UploadMapper.toJson(sale, DEVICE))["items"])
    }

    @Test
    fun salePatchDropsItemsJsonWithoutItems() {
        val patch = salePut.copy(op = "PATCH", data = mapOf("is_cancelled" to 1L, "items_json" to "[]"))
        val data = dataOf(UploadMapper.toJson(patch, DEVICE))

        assertFalse(data.containsKey("items_json"))
        assertFalse(data.containsKey("items"))
        assertEquals(JsonPrimitive(true), data["is_cancelled"])
    }

    @Test
    fun deleteSendsEmptyData() {
        val delete = PendingOp(3, "DELETE", "orders", "o1", null)
        assertEquals(JsonObject(emptyMap()), dataOf(UploadMapper.toJson(delete, DEVICE)))
    }

    @Test
    fun saleItemsAreNotUploaded() {
        val item = PendingOp(4, "PUT", "sale_items", "si1", mapOf("sale_id" to "sale-1"))
        assertNull(UploadMapper.toJson(item, DEVICE))
    }

    @Test
    fun opIdIsStablePerDeviceAndClientId() {
        val first = UploadMapper.opId(DEVICE, 7)

        assertEquals(first, UploadMapper.opId(DEVICE, 7))
        assertNotEquals(first, UploadMapper.opId(DEVICE, 8))
        assertNotEquals(first, UploadMapper.opId("other-device", 7))
        assertEquals(UUID.nameUUIDFromBytes("$DEVICE:7".toByteArray()).toString(), first)
        assertEquals(3, UUID.fromString(first).version())
    }

    private companion object {
        const val DEVICE = "0b6f8f62-3c1e-4d0c-9a51-6b8a4f0e2d11"
    }
}
