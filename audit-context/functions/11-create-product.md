## `create` in `database/useProductDatabase.ts` (L9-L37)

**Purpose:** Persists a new local product row, marks it pending for sync, and signals the produtos watermark. Without it, product creation from the dashboard-like product screens and local "additional item" creation from the cart flow would have no durable record to sync or display (`app/(tabs)/index.tsx L53-L75`, `app/modais/produtoModal.tsx` callers outside this analysis set).

**Inputs & Assumptions:**
- `data` (`Omit<ProductDatabase, "id" | "updated_at">`): product fields supplied by UI or by the "Adicional" flow. Trust: semi-trusted local input.
- Preconditions:
  - `tipoProdutoId` refers to an existing type row if provided, otherwise the foreign-key-less table accepts the value as-is (`database/initializeDatabase.ts L24-L35` has no FK on `tipoProdutoId`).
  - `generateUUID()` provides a unique local product ID for later server mapping (`database/useProductDatabase.ts L15-L17`).

**Outputs & Effects:**
- Inserts a product into `TB_PRODUTOS` with a generated ID, `updated_at = Date.now()`, and `sync_status = 'pending'` (`L16-L25`).
- Logs the new product ID (`L27-L27`).
- Calls `markChanged('produtos')` and returns `{ id }` (`L29-L31`).

**Block-by-Block:**

```ts
// L15-L25
const id = generateUUID()
const result = await statement.executeAsync({
  $id: id,
  $nome: data.nome,
  $preco: data.preco,
  $tipoProdutoId: data.tipoProdutoId,
  $origemProdutoId: data.origemProdutoId ?? null,
  $ingredientes: data.ingredientes ?? null,
  $updated_at: Date.now(),
  $sync_status: 'pending',
})
```
- **What:** Allocates a new local product ID and inserts the product row as pending.
- **Why here:** Product creation needs a local durable row before UI and sync can see it.
- **Assumes:** Any optional `origemProdutoId` provided by the caller is already meaningful for later sync and duplicate detection.
- **Establishes:** The new product is eligible for outbound sync and visible to local product queries.
- **Depended on by:** Product lists, cart-additional flow, and later `sincronizarComServidor()` product push selection (`database/useSyncDatabase.ts L23-L25`).

```ts
// L27-L31
console.log('[db] produto criado', { id })
markChanged('produtos')
return { id }
```
- **What:** Logs creation, signals a produtos change, and returns the generated local product ID.
- **Why here:** The caller often needs to re-read the row or navigate using the new ID.
- **Assumes:** Watermark-triggered refresh is the intended way to notify product screens about the new row.
- **Establishes:** Observers can react and callers can fetch the created row by ID.
- **Depended on by:** `VendaScreen.handleAdicional()` calling `showAdd(response.id)` after creation (`app/(tabs)/index.tsx L62-L74`) and product-list reload hooks.

**Cross-Function Dependencies:**
- Callee `generateUUID` (internal): creates the local product key.
- Callee `markChanged` (internal): signals product-list invalidation.
- Callers: `VendaScreen.handleAdicional()` uses it to clone a product as an add-on product when no existing derived product is found (`app/(tabs)/index.tsx L53-L75`); product-management screens also depend on it through the returned hook object (`database/useProductDatabase.ts L191-L202`).
- Shared state: `TB_PRODUTOS`, produtos watermark.
- Invariant couplings: Sync later depends on pending products receiving `origemProdutoId` maps from the server (`database/useSyncDatabase.ts L124-L130`).

**Open Questions:**
- unclear; need to inspect whether caller-supplied `origemProdutoId` is meant to point at a server product ID, a local source product ID, or both, because this function accepts and stores it verbatim (`database/useProductDatabase.ts L21-L21`).
