package uk.tozzo.app.testing

/** Seeds the tables the order screens read; every value is what the sync would have written. */
suspend fun RobolectricSql.seedUser(
    id: String,
    name: String,
) = execute("INSERT INTO users (id, name, role) VALUES (?, ?, 'EMPLOYEE')", listOf(id, name))

suspend fun RobolectricSql.seedProduct(
    id: String,
    name: String,
    price: String?,
) = execute("INSERT INTO products (id, name, price) VALUES (?, ?, ?)", listOf(id, name, price))

@Suppress("LongParameterList")
suspend fun RobolectricSql.seedOrder(
    id: String,
    customer: String? = "Mesa 1",
    isOpen: Int = 1,
    deletedAt: String? = null,
    isDelivery: Int = 0,
    address: String? = null,
    deliveryStartedAt: String? = null,
    openedAt: String = "2026-10-20 12:00:00.000",
    updatedAt: String = openedAt,
    sellerId: String? = "u1",
) = execute(
    "INSERT INTO orders (id, customer_name, is_open, deleted_at, is_delivery, delivery_address, " +
        "delivery_started_at, opened_at, updated_at, seller_id, total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '0.00')",
    listOf(id, customer, isOpen, deletedAt, isDelivery, address, deliveryStartedAt, openedAt, updatedAt, sellerId),
)

@Suppress("LongParameterList")
suspend fun RobolectricSql.seedItem(
    id: String,
    orderId: String,
    productId: String,
    quantity: Int,
    unitPrice: String? = "10.00",
    status: String = "IN_PREPARATION",
    deletedAt: String? = null,
    kitchenReadyAt: String? = null,
) = execute(
    "INSERT INTO order_items (id, order_id, product_id, quantity, status, unit_price, deleted_at, " +
        "kitchen_ready_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    listOf(id, orderId, productId, quantity, status, unitPrice, deletedAt, kitchenReadyAt),
)
