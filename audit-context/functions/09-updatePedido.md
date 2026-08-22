## `updatePedido` in `database/usePedidoDatabase.ts` (L149-L254)

**Purpose:** Applies local edits to an existing order’s line items, customer name, and/or status, recalculates totals when products change, marks touched fields pending for sync, and signals the pedidos watermark. Without it, `PedidoModal.handleSave()` and order-to-sale closure could not persist local order edits (`app/modais/pedidoModal.tsx L86-L123`).

**Inputs & Assumptions:**
- `pedidoId` (`string`): target order ID. Trust: semi-trusted route-derived input.
- `produtos` (`PedidoProduto[] | undefined`): optional replacement product set.
- `cliente` (`string | undefined`): optional new customer name.
- `status` (`PedidoStatus | undefined`): optional new status.
- Preconditions:
  - If `produtos` is provided, existing relation rows for the order can be matched by `produtoId` and updated/deleted accordingly (`database/usePedidoDatabase.ts L157-L205`).
  - If `status` is provided, it must satisfy `isValidStatus()` (`L238-L239`).

**Outputs & Effects:**
- Reconciles order-product relation rows against the provided `produtos` list (`L156-L214`).
- Recomputes and stores the order total plus pending sync status when products changed (`L216-L224`).
- Updates `cliente` and/or `status` independently when supplied (`L227-L247`).
- Calls `markChanged('pedidos')` at the end of the outer try block (`L250-L250`).

**Block-by-Block:**

```ts
// L156-L199
const existing = await database.getAllAsync<{ id: string; produtoId: string; quantidade: number }>(
  `SELECT id, produtoId, quantidade FROM RL_PEDIDO_PRODUTO WHERE pedidoId = ?`,
  [pedidoId]
);
...
for (const { produtoId, quantidade } of produtos) {
  ...
  if (list && list.length) {
    await updateRelStmt.executeAsync({ $quantidade: Number(quantidade), $id: relId });
  } else {
    await insertRelStmt.executeAsync({ $id: relId, $pedidoId: pedidoId, $produtoId: produtoId, $quantidade: Number(quantidade) });
  }
  if (relId) usedIds.add(relId);
}
```
- **What:** Reads existing relation rows, reuses one existing row per matching `produtoId`, and inserts new rows when a product is newly added.
- **Why here:** The function wants to preserve relation-row identity when possible instead of deleting everything first.
- **Assumes:** Matching only on `produtoId` is sufficient even when the same product appears multiple times in the order; the `existingMap` list structure at `L162-L167` is what supports repeated IDs.
- **Establishes:** The relation table can be reconciled to the caller’s desired product multiset.
- **Depended on by:** Total recalculation and later order reads/pushes.

```ts
// L201-L214
try {
  const toDelete = (existing || []).filter(r => !usedIds.has(r.id));
  for (const row of toDelete) {
    const delStmt = await database.prepareAsync('DELETE FROM RL_PEDIDO_PRODUTO WHERE id = $id');
    try {
      await delStmt.executeAsync({ $id: row.id });
    } finally {
      await delStmt.finalizeAsync();
    }
  }
} catch (errDel) {
  // if delete fails, ignore silently
}
```
- **What:** Deletes leftover relation rows that were not reused by the new product list.
- **Why here:** Reconciliation needs to remove products the caller no longer wants in the order.
- **Assumes:** Suppressing deletion failures is acceptable and the parent order can still proceed with partial relation cleanup.
- **Establishes:** On the success path, only reused or newly inserted relation rows remain.
- **Depended on by:** Accurate later totals and later sync expansion.

```ts
// L216-L224
const total = await calculateTotal(produtos);
const updateTotalStmt = await database.prepareAsync(
  'UPDATE TB_PEDIDOS SET total = $total, updated_at = $updatedAt, sync_status = $syncStatus WHERE id = $id'
);
...
await updateTotalStmt.executeAsync({ $total: total, $updatedAt: Date.now(), $syncStatus: 'pending', $id: pedidoId });
```
- **What:** Recalculates the order total from the replacement product set and marks the parent row pending.
- **Why here:** Product edits change the price-bearing contents of the order.
- **Assumes:** `calculateTotal()` over the provided local product IDs is the intended source of truth for the new total.
- **Establishes:** The parent order row stays consistent with the current relation rows and is eligible for outbound sync.
- **Depended on by:** Later order reads and sync push payload creation.

```ts
// L227-L247
if (typeof cliente !== 'undefined') {
  await updateClienteStmt.executeAsync({ $cliente: cliente ?? null, $updatedAt: Date.now(), $syncStatus: 'pending', $id: pedidoId });
}
if (typeof status !== 'undefined') {
  if (status !== null && !isValidStatus(status)) throw new Error('Status inválido');
  await updateStatusStmt.executeAsync({ $status: status ?? null, $updatedAt: Date.now(), $syncStatus: 'pending', $id: pedidoId });
}
```
- **What:** Applies optional customer-name and status updates independently, each marking the row pending with a fresh `updated_at`.
- **Why here:** Callers may edit one field without editing products.
- **Assumes:** Writing `status ?? null` is acceptable even though `status` is normally a required logical field.
- **Establishes:** Scalar order fields can change without forcing a product rewrite.
- **Depended on by:** `PedidoModal.handleSave()` and `PedidoModal.handleGerarVenda()` (`app/modais/pedidoModal.tsx L86-L123`).

```ts
// L250-L250
markChanged('pedidos')
```
- **What:** Signals that the pedidos table changed.
- **Why here:** Screens watching pedidos should only reload after the write path finishes.
- **Assumes:** One watermark change is enough no matter which subset of fields changed.
- **Establishes:** Watermark-driven reload hooks can observe the edit.
- **Depended on by:** `app/(tabs)/pedidos.tsx` and other pedidos observers through `useShouldReload()`.

**Cross-Function Dependencies:**
- Callee `calculateTotal` (internal closure): required when products change.
- Callee `markChanged` (internal): updates reload signaling.
- Callers: `PedidoModal.handleSave()` (`app/modais/pedidoModal.tsx L86-L98`) and `PedidoModal.handleGerarVenda()` for closing the order after creating a sale (`L116-L123`).
- Shared state: `TB_PEDIDOS`, `RL_PEDIDO_PRODUTO`, pedidos watermark.
- Invariant couplings: `sincronizarComServidor()` assumes `TB_PEDIDOS.total`, `status`, and relation rows describe the current order that should be pushed (`database/useSyncDatabase.ts L53-L72`).

**Open Questions:**
- unclear; need to inspect whether the silent delete-failure path for leftover relation rows is intended to leave a partially reconciled order in local storage (`database/usePedidoDatabase.ts L201-L214`).
