package uk.tozzo.app.core.sync

import androidx.annotation.StringRes
import uk.tozzo.app.R

private val MESSAGES: Map<String, Int> =
    buildMap {
        fun codes(
            @StringRes message: Int,
            vararg codes: String,
        ) = codes.forEach { put(it, message) }

        // Orders
        codes(R.string.rejection_order_not_found, "ORDER_NOT_FOUND")
        codes(R.string.rejection_order_closed, "ORDER_NOT_OPEN", "ORDER_ALREADY_CLOSED")
        codes(
            R.string.rejection_order_conflict,
            "ORDER_CONFLICT",
            "ORDER_VERSION_INVALID",
            "ORDER_ID_CONFLICT",
            "DELIVERY_CONFLICT",
            "DELIVERY_VERSION_INVALID",
            "KITCHEN_CONFLICT",
            "KITCHEN_VERSION_INVALID",
        )
        codes(
            R.string.rejection_order_item_invalid,
            "ORDER_ITEM_INVALID",
            "ORDER_ITEM_NOT_FOUND",
            "ORDER_ITEM_PRODUCT_IMMUTABLE",
        )
        codes(R.string.rejection_quantity_invalid, "QUANTITY_INVALID", "SALE_ITEM_INVALID")
        codes(R.string.rejection_order_delivering, "ORDER_DELIVERING")
        codes(R.string.rejection_order_not_deliverable, "ORDER_NOT_DELIVERABLE")
        codes(R.string.rejection_order_not_ready, "ORDER_NOT_READY", "NOT_READY")
        // Delivery
        codes(R.string.rejection_delivery_address, "DELIVERY_ADDRESS_REQUIRED", "DELIVERY_ADDRESS_TOO_LONG")
        codes(R.string.rejection_delivery_started, "DELIVERY_ALREADY_STARTED")
        codes(R.string.rejection_delivery_not_started, "DELIVERY_NOT_STARTED")
        codes(
            R.string.rejection_delivery_driver,
            "DELIVERY_DRIVER_AMBIGUOUS",
            "DELIVERY_DRIVER_REQUIRED",
            "DELIVERY_DRIVER_DETAILS_TOO_LONG",
            "DRIVER_NOT_FOUND",
        )
        codes(R.string.rejection_driver_busy, "DRIVER_BUSY")
        codes(R.string.rejection_delivery_action, "DELIVERY_ACTION_INVALID")
        // Kitchen
        codes(
            R.string.rejection_kitchen_transition,
            "KITCHEN_TRANSITION_INVALID",
            "KITCHEN_ACTION_INVALID",
            "ORDER_ITEM_STATUS_INVALID",
            "ORDER_ITEM_STATUS_REQUIRED",
        )
        // Sales
        codes(R.string.rejection_sale_exists, "SALE_ID_CONFLICT")
        codes(R.string.rejection_sale_not_found, "SALE_NOT_FOUND")
        codes(R.string.rejection_sale_items, "SALE_ITEMS_REQUIRED")
        codes(R.string.rejection_payment_method, "PAYMENT_METHOD_INVALID")
        codes(R.string.rejection_sale_total, "TOTAL_TOO_LARGE")
        codes(R.string.rejection_sale_too_old, "SYNC_SALE_TOO_OLD")
        // Products
        codes(R.string.rejection_product_not_found, "PRODUCT_NOT_FOUND", "PRODUCT_TYPE_NOT_FOUND")
        codes(R.string.rejection_product_price, "PRODUCT_PRICE_INVALID")
        codes(
            R.string.rejection_product_invalid,
            "PRODUCT_ID_CONFLICT",
            "PRODUCT_TYPE_ID_CONFLICT",
            "PRODUCT_NAME_REQUIRED",
            "PRODUCT_TYPE_DESCRIPTION_REQUIRED",
        )
        // Plan
        codes(R.string.rejection_plan_limit, "ORDER_LIMIT_REACHED", "PRODUCT_LIMIT_REACHED", "PLAN_UPGRADE_REQUIRED")
        codes(R.string.rejection_payment_required, "PAYMENT_REQUIRED")
        // Sync
        codes(R.string.rejection_sync_invalid, "SYNC_OP_INVALID", "SYNC_OP_ID_CONFLICT", "VALIDATION_FAILED")
        codes(R.string.rejection_sync_not_allowed, "SYNC_OP_NOT_ALLOWED")
        codes(R.string.rejection_role_forbidden, "ROLE_FORBIDDEN", "FORBIDDEN")
        codes(R.string.rejection_establishment_deleted, "ESTABLISHMENT_DELETED")
        codes(R.string.rejection_local_invalid, UploadProcessor.LOCAL_INVALID_DATA)
    }

/** The translated explanation of an API problem [code]; unknown codes get a generic message. */
@StringRes
fun rejectionMessage(code: String?): Int = MESSAGES[code] ?: R.string.rejection_generic

/** The translated name of a synced table, or null for a table the screen does not know. */
@StringRes
fun tableLabel(table: String): Int? =
    when (table) {
        "orders" -> R.string.sync_table_orders
        "order_items" -> R.string.sync_table_order_items
        "sales" -> R.string.sync_table_sales
        "sale_items" -> R.string.sync_table_sale_items
        "products" -> R.string.sync_table_products
        "product_types" -> R.string.sync_table_product_types
        "print_logs" -> R.string.sync_table_print_logs
        "users" -> R.string.sync_table_users
        else -> null
    }
