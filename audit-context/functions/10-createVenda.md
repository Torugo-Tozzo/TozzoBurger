## `createVenda` in `database/useVendaDatabse.ts` (L9-L52)

**Purpose:** Persists a new local sale plus sale-line rows, computes its total from local product prices, marks it pending for sync, and signals the vendas watermark. Without it, direct checkout and order-to-sale conversion would have no durable sale record (`app/modais/contaModal.tsx L72-L95`, `app/modais/pedidoModal.tsx L116-L123`).

**Inputs & Assumptions:**
- `produtos` (`{ produtoId: string; quantidade: number }[]`): selected sale lines. Trust: semi-trusted user-derived input.
- `cliente` (`string | undefined`): optional customer name.
- `criadoPor` / `criadoPorNome`: optional creator metadata from auth state.
- Preconditions:
  - Every `produtoId` referenced here can be priced through `calculateTotal()` (`database/useVendaDatabse.ts L136-L152`).
  - Parent and relation rows can be written without an explicit transaction spanning the whole sale creation.

**Outputs & Effects:**
- Computes the total and generates UUID/time fields (`L15-L20`).
- Inserts a `TB_VENDAS` row with `sync_status = 'pending'` (`L21-L30`).
- Inserts one `RL_VENDA_PRODUTO` row per product selection (`L32-L42`).
- Calls `markChanged('vendas')` and returns `{ vendaId }` (`L44-L46`).

**Block-by-Block:**

```ts
// L15-L20
const total = await calculateTotal(produtos);
const horario = new Date().toISOString();
const vendaId = generateUUID();
const updatedAt = Date.now();
```
- **What:** Calculates the sale total and prepares identifiers/timestamps for the parent row.
- **Why here:** The insert needs normalized values before writing.
- **Assumes:** Local product prices are the intended pricing source for the sale.
- **Establishes:** A complete parent-row payload can be constructed.
- **Depended on by:** The `TB_VENDAS` insert and relation-row loop.

```ts
// L21-L30
await statementVenda.executeAsync({
  $id: vendaId,
  $total: total,
  $horario: horario,
  $cliente: cliente ?? null,
  $updated_at: updatedAt,
  $sync_status: 'pending',
  $criado_por: criadoPor != null ? String(criadoPor) : null,
  $criado_por_nome: criadoPorNome ?? null,
});
```
- **What:** Inserts the parent sale row into `TB_VENDAS`.
- **Why here:** Relation rows need the generated `vendaId`.
- **Assumes:** Storing `criado_por` as text is the intended local representation for user IDs.
- **Establishes:** A durable pending sale exists for later reads and sync.
- **Depended on by:** The relation insert loop and `sincronizarComServidor()` selecting pending sales (`database/useSyncDatabase.ts L28-L28`).

```ts
// L32-L42
for (const { produtoId, quantidade } of produtos) {
  const relId = generateUUID();
  const relStmt = await database.prepareAsync(
    'INSERT INTO RL_VENDA_PRODUTO (id, vendaId, produtoId, quantidade) VALUES ($id, $vendaId, $produtoId, $quantidade)'
  );
  try {
    await relStmt.executeAsync({ $id: relId, $vendaId: vendaId, $produtoId: produtoId, $quantidade: quantidade });
  } finally {
    await relStmt.finalizeAsync();
  }
}
```
- **What:** Writes one sale-line relation row per selected product.
- **Why here:** The sale’s product composition is stored separately from the parent row.
- **Assumes:** All referenced product IDs satisfy the foreign key and no transaction wrapper is needed for parent plus children.
- **Establishes:** Later history screens and sync payload expansion can reconstruct the sale items.
- **Depended on by:** `getVendaById()` (`database/useVendaDatabse.ts L95-L115`) and sync relation expansion (`database/useSyncDatabase.ts L33-L51`).

```ts
// L44-L50
markChanged('vendas')
return { vendaId };
...
await statementVenda.finalizeAsync();
```
- **What:** Signals a vendas change, returns the new ID, and finalizes the prepared statement.
- **Why here:** UI reload logic depends on the watermark after the DB write is complete.
- **Assumes:** One watermark tick is enough for any sale-creating path.
- **Establishes:** Vendas observers can react to the new local sale.
- **Depended on by:** History screens and any immediate post-sale navigation.

**Cross-Function Dependencies:**
- Callee `calculateTotal` (internal closure): prices the sale from local product rows.
- Callee `generateUUID` (internal): allocates parent and relation IDs.
- Callee `markChanged` (internal): propagates local-write visibility to UI hooks.
- Callers: `ContaModal.finalizarCompra()` for direct sales (`app/modais/contaModal.tsx L72-L95`) and `PedidoModal.handleGerarVenda()` for order conversion (`app/modais/pedidoModal.tsx L116-L123`).
- Shared state: `TB_VENDAS`, `RL_VENDA_PRODUTO`, vendas watermark.
- Invariant couplings: Later order-to-sale flows rely on the caller to separately close the order; `createVenda()` itself only creates the sale.

**Open Questions:**
- unclear; need to inspect whether sale creation is intended to be atomic across parent and relation inserts, because this helper does not wrap them in a transaction (`database/useVendaDatabse.ts L10-L50`).
