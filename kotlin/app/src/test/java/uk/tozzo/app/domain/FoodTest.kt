package uk.tozzo.app.domain

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class FoodTest {
    @Test
    fun requestedAndUnknownItemStatusAreInPreparation() {
        assertEquals(ItemStatus.IN_PREPARATION, ItemStatus.parse("REQUESTED"))
        assertEquals(ItemStatus.IN_PREPARATION, ItemStatus.parse("whatever"))
        assertEquals(ItemStatus.IN_PREPARATION, ItemStatus.parse(null))
        assertEquals(ItemStatus.READY, ItemStatus.parse("READY"))
        assertEquals(ItemStatus.DELIVERED, ItemStatus.parse("DELIVERED"))
    }

    @Test
    fun inPreparationWithKitchenReadyAtCountsAsReady() {
        assertEquals(KitchenStage.READY, KitchenStage.of(ItemStatus.IN_PREPARATION, "2026-10-20 12:00:00.000"))
        assertEquals(KitchenStage.IN_PREPARATION, KitchenStage.of(ItemStatus.IN_PREPARATION, null))
        assertEquals(KitchenStage.IN_PREPARATION, KitchenStage.of(ItemStatus.IN_PREPARATION, " "))
        assertEquals(KitchenStage.READY, KitchenStage.of(ItemStatus.READY, null))
        assertEquals(KitchenStage.READY, KitchenStage.of(ItemStatus.DELIVERED, null))
    }

    @Test
    fun paymentMethodsKeepTheSelectorOrder() {
        assertEquals(
            listOf("CASH", "PIX", "CREDIT_CARD", "DEBIT_CARD", "ON_ACCOUNT"),
            PaymentMethod.entries.map { it.name },
        )
    }
}
