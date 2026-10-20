package uk.tozzo.app.domain

/** In the order of the payment selector. */
enum class PaymentMethod { CASH, PIX, CREDIT_CARD, DEBIT_CARD, ON_ACCOUNT }

enum class ItemStatus {
    IN_PREPARATION,
    READY,
    DELIVERED,
    ;

    companion object {
        /** REQUESTED (the old name of IN_PREPARATION) and anything unknown count as IN_PREPARATION. */
        fun parse(raw: String?): ItemStatus = entries.firstOrNull { it.name == raw } ?: IN_PREPARATION
    }
}

enum class KitchenStage {
    IN_PREPARATION,
    READY,
    ;

    companion object {
        /** IN_PREPARATION with `kitchen_ready_at` set counts as READY (`kitchenStage` of the API). */
        fun of(
            status: ItemStatus,
            kitchenReadyAt: String?,
        ): KitchenStage =
            if (status != ItemStatus.IN_PREPARATION || !kitchenReadyAt.isNullOrBlank()) READY else IN_PREPARATION
    }
}

data class ProductType(
    val id: String,
    val description: String,
    val color: String?,
    val isActive: Boolean,
)

/** A product with a valid price; [priceCents] comes from the `price` text through [Money]. */
data class Product(
    val id: String,
    val name: String,
    val priceCents: Long,
    val ingredients: String?,
    val typeId: String?,
    val imageKey: String?,
)
