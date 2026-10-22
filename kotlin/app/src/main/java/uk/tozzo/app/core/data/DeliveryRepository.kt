package uk.tozzo.app.core.data

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject

/** A driver of the establishment; [available] is false while an order of theirs is out for delivery. */
data class Driver(
    val id: String,
    val name: String,
    val available: Boolean,
)

enum class DeliveryStage { WAITING, DELIVERING }

private const val DRIVERS_SQL =
    "SELECT u.id, u.name, NOT EXISTS (SELECT 1 FROM orders o WHERE o.driver_id = u.id AND o.is_open = 1 " +
        "AND o.deleted_at IS NULL AND o.delivery_started_at IS NOT NULL AND o.delivery_started_at <> '') " +
        "AS available FROM users u WHERE u.role = 'DRIVER' ORDER BY u.name, u.id"

/** The delivery board read from the local database. */
class DeliveryRepository
    @Inject
    constructor(
        private val sql: LocalSql,
    ) {
        private val orders = OrderRepository(sql)

        /** Open delivery orders, oldest first, split by `delivery_started_at`. Both stages are always present. */
        fun board(): Flow<Map<DeliveryStage, List<OrderView>>> =
            orders.deliveryOrders().map { all ->
                val (delivering, waiting) = all.partition { it.delivering }
                mapOf(DeliveryStage.WAITING to waiting, DeliveryStage.DELIVERING to delivering)
            }

        /** Users with role DRIVER, by name; available = no open order of theirs has left. */
        fun drivers(): Flow<List<Driver>> =
            sql.watch(DRIVERS_SQL) {
                Driver(it.string("id").orEmpty(), it.string("name").orEmpty(), it.long("available") == 1L)
            }
    }
