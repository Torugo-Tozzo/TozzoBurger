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
import org.junit.jupiter.api.Assertions.assertThrows
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

        val order = PendingOp(1, "PATCH", "orders", "o1", mapOf("is_delivery" to 1L))
        assertEquals(JsonPrimitive(true), dataOf(UploadMapper.toJson(order, DEVICE))["is_delivery"])
        val other = order.copy(data = mapOf("is_delivery" to 0L))
        assertEquals(JsonPrimitive(false), dataOf(UploadMapper.toJson(other, DEVICE))["is_delivery"])
    }

    @Test
    fun typedValuesKeepTheirTypes() {
        val item = PendingOp(2, "PUT", "sale_items", "i1", mapOf("quantity" to 3L, "unit_price" to "4.00"))
        // Only the products table renames its price (see productPriceGoesAsCents).
        val product = PendingOp(2, "PATCH", "services", "p1", mapOf("quantity" to 3L, "price" to "4.00"))
        val data = dataOf(UploadMapper.toJson(product, DEVICE))

        assertEquals(JsonPrimitive(3L), data["quantity"])
        assertEquals(JsonPrimitive("4.00"), data["price"])
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

    private fun order(
        op: String,
        vararg data: Pair<String, Any?>,
    ) = PendingOp(9, op, "orders", "o1", data.toMap())

    @Test
    fun booleanValuesAreStrict() {
        fun cancelled(value: Any?) =
            dataOf(UploadMapper.toJson(salePut.copy(data = mapOf("is_cancelled" to value)), DEVICE))

        listOf(1, 1L, true, "1", "true").forEach { assertEquals(JsonPrimitive(true), cancelled(it)["is_cancelled"]) }
        listOf(0, 0L, false, "0", "false").forEach { assertEquals(JsonPrimitive(false), cancelled(it)["is_cancelled"]) }
        assertThrows(IllegalArgumentException::class.java) { cancelled("talvez") }
        assertThrows(IllegalArgumentException::class.java) { cancelled(2L) }
    }

    @Test
    fun orderItemsPutIsSkipped() {
        val put = PendingOp(5, "PUT", "order_items", "i1", mapOf("order_id" to "o1", "quantity" to 2L))
        assertNull(UploadMapper.toJson(put, DEVICE))
        assertNull(UploadMapper.toJson(put.copy(op = "DELETE", data = null), DEVICE))
    }

    @Test
    fun ordersPutEmbedsItemsAndDropsServerColumns() {
        val put =
            order(
                "PUT",
                "customer_name" to "Ana",
                "is_delivery" to 1L,
                "delivery_address" to "Rua A, 1",
                "is_open" to 1L,
                "total" to "10.00",
                "opened_at" to "2026-10-20 12:00:00.000",
                "updated_at" to "2026-10-20 12:00:00.000",
                "seller_id" to "u1",
                "deleted_at" to null,
                "driver_id" to null,
                "external_driver_name" to null,
                "external_driver_phone" to null,
                "delivery_started_at" to null,
                "close_json" to null,
                "delivery_json" to null,
                "items_json" to """[{"id":"i1","product_id":"p1","quantity":2}]""",
            )
        val data = dataOf(UploadMapper.toJson(put, DEVICE))

        assertEquals(setOf("customer_name", "is_delivery", "delivery_address", "items"), data.keys)
        assertEquals(JsonPrimitive(true), data["is_delivery"])
        assertEquals(JsonPrimitive("i1"), data["items"]!!.jsonArray[0].jsonObject["id"])
    }

    @Test
    fun ordersPatchCarriesFullItemList() {
        val patch =
            order(
                "PATCH",
                "customer_name" to "Bia",
                "items_json" to
                    """[{"id":"i1","product_id":"p1","quantity":3},{"id":"i2","product_id":"p2","quantity":1}]""",
            )
        val data = dataOf(UploadMapper.toJson(patch, DEVICE))

        assertEquals(setOf("customer_name", "items"), data.keys)
        assertEquals(2, data["items"]!!.jsonArray.size)
        assertEquals(JsonPrimitive(3), data["items"]!!.jsonArray[0].jsonObject["quantity"])
        assertEquals(
            setOf("customer_name"),
            dataOf(UploadMapper.toJson(order("PATCH", "customer_name" to "C"), DEVICE)).keys,
        )
    }

    @Test
    fun closeGoesAlone() {
        val patch = order("PATCH", "is_open" to 0L, "close_json" to """{"payment_method":"PIX"}""")
        val data = dataOf(UploadMapper.toJson(patch, DEVICE))

        assertEquals("""{"close":{"payment_method":"PIX"}}""", data.toString())
    }

    @Test
    fun deliveryGoesAlone() {
        val patch =
            order(
                "PATCH",
                "driver_id" to "d1",
                "delivery_json" to """{"action":"ASSIGN","driver_id":"d1"}""",
            )
        val data = dataOf(UploadMapper.toJson(patch, DEVICE))

        assertEquals("""{"delivery":{"action":"ASSIGN","driver_id":"d1"}}""", data.toString())
    }

    @Test
    fun orderItemQuantityPatchIsSkipped() {
        fun patch(vararg data: Pair<String, Any?>) = PendingOp(6, "PATCH", "order_items", "i1", data.toMap())

        assertNull(UploadMapper.toJson(patch("quantity" to 3L, "status" to "READY"), DEVICE))
        assertNull(UploadMapper.toJson(patch("quantity" to 3L), DEVICE))
        assertNull(UploadMapper.toJson(patch("kitchen_ready_at" to "2026-10-20 12:00:00.000"), DEVICE))
        assertEquals(
            """{"status":"IN_PREPARATION"}""",
            dataOf(UploadMapper.toJson(patch("status" to "IN_PREPARATION", "kitchen_ready_at" to null), DEVICE))
                .toString(),
        )
        assertEquals(
            """{"status":"READY"}""",
            dataOf(UploadMapper.toJson(patch("status" to "READY"), DEVICE)).toString(),
        )
    }

    @Test
    fun soldAtGoesAsRfc3339() {
        val sale = salePut.copy(data = mapOf("sold_at" to "2026-10-20 12:00:00.000"))
        assertEquals(JsonPrimitive("2026-10-20T12:00:00.000Z"), dataOf(UploadMapper.toJson(sale, DEVICE))["sold_at"])

        val log = PendingOp(8, "PUT", "print_logs", "l1", mapOf("printed_at" to "2026-10-20 12:00:00.5"))
        assertEquals(JsonPrimitive("2026-10-20T12:00:00.500Z"), dataOf(UploadMapper.toJson(log, DEVICE))["printed_at"])

        val bad = salePut.copy(data = mapOf("sold_at" to "ontem"))
        assertThrows(IllegalArgumentException::class.java) { UploadMapper.toJson(bad, DEVICE) }
    }

    @Test
    fun productPriceGoesAsCents() {
        val put = PendingOp(1, "PUT", "products", "p1", mapOf("name" to "X", "price" to "12.50", "ingredients" to ""))
        val data = dataOf(UploadMapper.toJson(put, DEVICE))

        assertEquals(JsonPrimitive(1250L), data["price_cents"])
        assertNull(data["price"])
        assertEquals(JsonPrimitive("X"), data["name"])

        val patch = PendingOp(2, "PATCH", "products", "p1", mapOf("price" to "0.05"))
        assertEquals(JsonPrimitive(5L), dataOf(UploadMapper.toJson(patch, DEVICE))["price_cents"])
    }

    @Test
    fun aProductPriceThatIsNotAnAmountCannotBeSent() {
        listOf("abc", "1.234", "-1", "").forEach { price ->
            val op = PendingOp(3, "PATCH", "products", "p1", mapOf("price" to price))
            assertThrows(IllegalArgumentException::class.java) { UploadMapper.toJson(op, DEVICE) }
        }
    }

    private companion object {
        const val DEVICE = "0b6f8f62-3c1e-4d0c-9a51-6b8a4f0e2d11"
    }
}
