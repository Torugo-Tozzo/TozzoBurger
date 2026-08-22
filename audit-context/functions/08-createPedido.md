## `createPedido` in `database/usePedidoDatabase.ts` (L37-L87)

**Purpose:** Persists a new local order (`TB_PEDIDOS` plus `RL_PEDIDO_PRODUTO`) from cart-like product selections, computes its total from local product prices, marks it pending for sync, and signals the pedidos watermark. Without it, `ContaModal.gerarPedido()` would have no durable order record to hand off to sync and the pedidos tab (`app/modais/contaModal.tsx L97-L117`).

**Inputs & Assumptions:**
- `produtos` (`PedidoProduto[]`): selected product IDs plus quantities. Trust: semi-trusted user-derived input (`database/usePedidoDatabase.ts L38-L38`).
- `cliente` (`string | undefined`): optional user-entered customer name. Trust: semi-trusted (`L39-L39`).
- `status` (`PedidoStatus`): defaults to `STATUS_PEDIDO.ABERTO` (`L40-L40`).
- `criadoPor` / `criadoPorNome`: optional creator metadata from auth state (`L41-L42`).
- Preconditions:
  - Each `produtoId` refers to a row in `TB_PRODUTOS` with a `preco`, otherwise `calculateTotal()` silently skips missing products (`L20-L35`).
  - `status` must satisfy `isValidStatus()` (`L52-L52`).

**Outputs & Effects:**
- Computes the order total by reading local product prices (`L49-L49`).
- Inserts one `TB_PEDIDOS` row with generated UUID, ISO `horario`, epoch `updated_at`, and `sync_status = 'pending'` (`L54-L67`).
- Inserts one `RL_PEDIDO_PRODUTO` row per product selection (`L69-L79`).
- Calls `markChanged('pedidos')` and returns `{ pedidoId }` (`L81-L83`).

**Block-by-Block:**

```ts
// L49-L55
const total = await calculateTotal(produtos);
const horario = new Date().toISOString();
if (!isValidStatus(status)) throw new Error('Status inválido');
const pedidoId = generateUUID();
const updatedAt = Date.now();
```
- **What:** Derives the order total and timestamps, validates the requested status, and allocates the new order ID.
- **Why here:** The parent insert needs these values before any DB write occurs.
- **Assumes:** `calculateTotal()` reflects the intended current product prices from local SQLite rather than from UI state.
- **Establishes:** The order row can be inserted with normalized identifiers and time fields.
- **Depended on by:** The parent-row insert and all relation inserts below.

```ts
// L57-L67
await stmt.executeAsync({
  $id: pedidoId,
  $total: total,
  $horario: horario,
  $cliente: cliente ?? null,
  $status: status,
  $updated_at: updatedAt,
  $sync_status: 'pending',
  $criado_por: criadoPor != null ? String(criadoPor) : null,
  $criado_por_nome: criadoPorNome ?? null,
});
```
- **What:** Inserts the new parent order row into `TB_PEDIDOS`.
- **Why here:** Relation rows need a persistent `pedidoId` to reference.
- **Assumes:** Stringifying `criadoPor` is the intended storage format for creator IDs.
- **Establishes:** A durable order row exists with pending sync state.
- **Depended on by:** The relation-row loop and later sync queue selection (`database/useSyncDatabase.ts L30-L30`).

```ts
// L69-L79
for (const { produtoId, quantidade } of produtos) {
  const relId = generateUUID();
  const relStmt = await database.prepareAsync(
    'INSERT INTO RL_PEDIDO_PRODUTO (id, pedidoId, produtoId, quantidade) VALUES ($id, $pedidoId, $produtoId, $quantidade)'
  );
  try {
    await relStmt.executeAsync({ $id: relId, $pedidoId: pedidoId, $produtoId: produtoId, $quantidade: quantidade });
  } finally {
    await relStmt.finalizeAsync();
  }
}
```
- **What:** Inserts one relation row per selected product into `RL_PEDIDO_PRODUTO`.
- **Why here:** The order payload is split between the parent table and relation table.
- **Assumes:** Every provided `produtoId` is valid for the foreign key, and no transaction wrapper is needed across the whole order creation.
- **Establishes:** The new order’s line items are durable and can be re-read or pushed to sync later.
- **Depended on by:** `getPedidoById()` (`database/usePedidoDatabase.ts L129-L147`), sync relation expansion (`database/useSyncDatabase.ts L54-L72`), and modal order editing.

```ts
// L81-L85
markChanged('pedidos')
return { pedidoId };
...
await stmt.finalizeAsync();
```
- **What:** Signals the pedidos watermark, returns the new ID, and always finalizes the prepared parent statement.
- **Why here:** Screens need a reload signal once the write is complete.
- **Assumes:** A watermark update after the inserts is sufficient for every dependent screen to notice the new order.
- **Establishes:** Downstream UI refresh hooks can observe a pedidos change.
- **Depended on by:** `ContaModal.gerarPedido()` success flow and pedidos list reload logic.

**Cross-Function Dependencies:**
- Callee `calculateTotal` (internal closure): `createPedido` depends on it to price the order from `TB_PRODUTOS` (`database/usePedidoDatabase.ts L20-L35`).
- Callee `generateUUID` (internal): used for both parent and relation IDs.
- Callee `markChanged` (internal): used to signal list reloads (`database/tableWatermark.ts L13-L18`).
- Callers: `ContaModal.gerarPedido()` is the primary caller (`app/modais/contaModal.tsx L97-L117`).
- Shared state: `TB_PEDIDOS`, `RL_PEDIDO_PRODUTO`, pedidos watermark.
- Invariant couplings: `sincronizarComServidor()` later assumes every pending order can be expanded through `RL_PEDIDO_PRODUTO` and pushed (`database/useSyncDatabase.ts L53-L72`).

**Open Questions:**
- unclear; need to inspect whether order creation is intended to be atomic across parent and relation inserts, because this function does not wrap them in a transaction (`database/usePedidoDatabase.ts L44-L85`).
