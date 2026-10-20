package uk.tozzo.app.core.sync

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Test
import uk.tozzo.app.R

class RejectionMessagesTest {
    /** The problem codes of the upload tests of the API and of its `httpx` constants that reach a device. */
    private val explained =
        listOf(
            "ORDER_NOT_FOUND",
            "ORDER_NOT_OPEN",
            "ORDER_ALREADY_CLOSED",
            "ORDER_CONFLICT",
            "ORDER_VERSION_INVALID",
            "ORDER_ID_CONFLICT",
            "ORDER_ITEM_INVALID",
            "ORDER_ITEM_NOT_FOUND",
            "ORDER_ITEM_PRODUCT_IMMUTABLE",
            "ORDER_ITEM_STATUS_INVALID",
            "ORDER_ITEM_STATUS_REQUIRED",
            "ORDER_DELIVERING",
            "ORDER_LIMIT_REACHED",
            "ORDER_NOT_DELIVERABLE",
            "ORDER_NOT_READY",
            "QUANTITY_INVALID",
            "DELIVERY_ACTION_INVALID",
            "DELIVERY_ADDRESS_REQUIRED",
            "DELIVERY_ADDRESS_TOO_LONG",
            "DELIVERY_ALREADY_STARTED",
            "DELIVERY_CONFLICT",
            "DELIVERY_DRIVER_AMBIGUOUS",
            "DELIVERY_DRIVER_DETAILS_TOO_LONG",
            "DELIVERY_DRIVER_REQUIRED",
            "DELIVERY_NOT_STARTED",
            "DELIVERY_VERSION_INVALID",
            "DRIVER_BUSY",
            "DRIVER_NOT_FOUND",
            "KITCHEN_ACTION_INVALID",
            "KITCHEN_CONFLICT",
            "KITCHEN_TRANSITION_INVALID",
            "KITCHEN_VERSION_INVALID",
            "SALE_ID_CONFLICT",
            "SALE_ITEM_INVALID",
            "SALE_ITEMS_REQUIRED",
            "SALE_NOT_FOUND",
            "PAYMENT_METHOD_INVALID",
            "TOTAL_TOO_LARGE",
            "SYNC_SALE_TOO_OLD",
            "PRODUCT_NOT_FOUND",
            "PRODUCT_PRICE_INVALID",
            "PRODUCT_TYPE_NOT_FOUND",
            "PRODUCT_ID_CONFLICT",
            "PRODUCT_TYPE_ID_CONFLICT",
            "PRODUCT_NAME_REQUIRED",
            "PRODUCT_LIMIT_REACHED",
            "PLAN_UPGRADE_REQUIRED",
            "PAYMENT_REQUIRED",
            "SYNC_OP_INVALID",
            "SYNC_OP_NOT_ALLOWED",
            "SYNC_OP_ID_CONFLICT",
            "ROLE_FORBIDDEN",
            "ESTABLISHMENT_DELETED",
            "LOCAL_INVALID_DATA",
        )

    @Test
    fun everyCodeOfTheUploadPathHasItsOwnMessage() {
        explained.forEach { assertNotEquals(R.string.rejection_generic, rejectionMessage(it), it) }
    }

    @Test
    fun closedOrDeletedOrdersAreExplained() {
        assertEquals(R.string.rejection_order_closed, rejectionMessage("ORDER_NOT_OPEN"))
        assertEquals(R.string.rejection_order_not_found, rejectionMessage("ORDER_NOT_FOUND"))
    }

    @Test
    fun unknownOrMissingCodeFallsBackToTheGenericMessage() {
        assertEquals(R.string.rejection_generic, rejectionMessage("SOMETHING_NEW"))
        assertEquals(R.string.rejection_generic, rejectionMessage(null))
    }

    @Test
    fun syncedTablesHaveALabel() {
        listOf("orders", "order_items", "sales", "sale_items", "products", "product_types", "print_logs", "users")
            .forEach { assertNotNull(tableLabel(it), it) }
        assertEquals(null, tableLabel("whatever"))
    }
}
