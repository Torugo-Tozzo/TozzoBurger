package uk.tozzo.app.core.sync

import com.powersync.db.schema.Column
import com.powersync.db.schema.Schema
import com.powersync.db.schema.Table

/** Local-only table with the ops the server rejected: their data is gone once the batch completes. */
const val SYNC_REJECTIONS_TABLE = "sync_rejections"

/** The local database: the tables synced from the API, plus [SYNC_REJECTIONS_TABLE]. */
val localSchema: Schema =
    Schema(
        listOf(
            Table(
                "product_types",
                listOf(
                    Column.text("description"),
                    Column.text("color"),
                    Column.integer("is_active"),
                    Column.text("deleted_at"),
                ),
            ),
            Table(
                "products",
                listOf(
                    Column.text("name"),
                    Column.text("price"),
                    Column.text("ingredients"),
                    Column.text("product_type_id"),
                    Column.text("image_key"),
                    Column.text("deleted_at"),
                ),
            ),
            // driver_* come from the server; items_json, close_json and delivery_json never do: they hold
            // what the device changed (the full item list, the closing, a delivery action), which the
            // upload turns into the orders PUT/PATCH.
            Table(
                "orders",
                listOf(
                    Column.text("customer_name"),
                    Column.integer("is_open"),
                    Column.integer("is_delivery"),
                    Column.text("delivery_address"),
                    Column.text("delivery_started_at"),
                    Column.text("opened_at"),
                    Column.text("updated_at"),
                    Column.text("deleted_at"),
                    Column.text("total"),
                    Column.text("seller_id"),
                    Column.text("driver_id"),
                    Column.text("external_driver_name"),
                    Column.text("external_driver_phone"),
                    Column.text("items_json"),
                    Column.text("close_json"),
                    Column.text("delivery_json"),
                ),
            ),
            Table(
                "order_items",
                listOf(
                    Column.text("order_id"),
                    Column.text("product_id"),
                    Column.integer("quantity"),
                    Column.text("status"),
                    Column.text("unit_price"),
                    Column.text("kitchen_ready_at"),
                    Column.text("deleted_at"),
                ),
            ),
            // items_json never comes from the server: it holds the lines of a sale made on the device,
            // which the upload embeds in the sales PUT (the server creates the items).
            Table(
                "sales",
                listOf(
                    Column.text("total"),
                    Column.text("sold_at"),
                    Column.text("customer_name"),
                    Column.integer("is_cancelled"),
                    Column.text("payment_method"),
                    Column.text("seller_id"),
                    Column.text("order_id"),
                    Column.text("items_json"),
                ),
            ),
            Table(
                "sale_items",
                listOf(
                    Column.text("sale_id"),
                    Column.text("product_id"),
                    Column.integer("quantity"),
                    Column.text("unit_price"),
                    Column.text("deleted_at"),
                ),
            ),
            Table("print_logs", listOf(Column.text("device_id"), Column.text("printed_at"))),
            Table("users", listOf(Column.text("name"), Column.text("role"))),
            Table.localOnly(
                SYNC_REJECTIONS_TABLE,
                listOf(
                    Column.text("op_id"),
                    Column.text("table_name"),
                    Column.text("row_id"),
                    Column.text("op"),
                    Column.text("code"),
                    Column.text("detail"),
                    // The op's data as JSON (without items_json) and a short text for the screen.
                    Column.text("op_data"),
                    Column.text("summary"),
                    Column.text("created_at"),
                ),
            ),
        ),
    )
