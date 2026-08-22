## `sincronizarComServidor` in `database/useSyncDatabase.ts` (L15-L468)

**Purpose:** Implements the offline-first reconciliation loop: read pending local rows, push them to the API, apply returned ID maps, pull authoritative remote changes, upsert or delete local tables, clean up old synced rows, and advance `TB_SCHEMA.lastSyncAt`. Without it, local orders, sales, and products would never converge with the server.

**Inputs & Assumptions:**
- `database` (`SQLiteDatabase`): local durable store for all sync reads and writes. Trust: trusted container, external implementation.
- `token` (`string`): bearer token for sync endpoints. Trust: semi-trusted credential sourced from auth state.
- Implicit: local tables and `TB_SCHEMA.lastSyncAt` already exist. Established by `initializeDatabase()` (`database/initializeDatabase.ts L24-L182`).
- Preconditions:
  - Pending outbound rows are identified by `sync_status = 'pending' OR sync_status IS NULL` (`database/useSyncDatabase.ts L23-L30`).
  - Remote API contracts for `/sincronizacao/push` and `/sincronizacao/pull` accept the payload/response shapes used here. Established by external behavior only (`services/api.ts L67-L114`).

**Outputs & Effects:**
- Reads local pending products, sales, and orders plus their relation rows (`L18-L74`).
- Pushes a combined payload to `/sincronizacao/push` and marks local rows synced or applies returned ID maps (`L74-L146`).
- Pulls remote changes, then applies product-type, product, order, and sale upserts/deletes into local SQLite (`L148-L417`).
- Deletes old synced sales and closed synced orders according to remote policy (`L419-L447`).
- Updates `TB_SCHEMA.lastSyncAt` when both push and pull completed (`L449-L458`).
- Returns the pulled `changes` object (`L463-L463`) or throws on outer failure (`L464-L466`).

**Block-by-Block:**

```ts
// L18-L30
const schema = await database.getFirstAsync<{ lastSyncAt?: number }>(`SELECT lastSyncAt FROM TB_SCHEMA LIMIT 1`).catch(() => null);
...
const produtosLocal = await database.getAllAsync(`SELECT ... FROM TB_PRODUTOS WHERE sync_status = 'pending' OR sync_status IS NULL;`).catch(...);
const vendasRows = await database.getAllAsync(`SELECT ... FROM TB_VENDAS WHERE sync_status = 'pending' OR sync_status IS NULL;`).catch(...);
const pedidosRows = await database.getAllAsync(`SELECT ... FROM TB_PEDIDOS WHERE sync_status = 'pending' OR sync_status IS NULL;`).catch(...);
```
- **What:** Reads the last sync checkpoint and loads every outbound-eligible row from products, sales, and orders.
- **Why here:** The push payload depends on the current local queue before any remote calls occur.
- **Assumes:** Missing `TB_SCHEMA` or select failures can degrade to `null` / empty-array behavior without making the whole sync attempt invalid.
- **Establishes:** The function has the local material needed to build the outbound payload and the optional `since` checkpoint for the later pull.
- **Depended on by:** Relation expansion, payload creation, and the pull checkpoint conversion.

```ts
// L32-L74
for (const v of vendasRows) {
  const items = await database.getAllAsync(`SELECT ... FROM RL_VENDA_PRODUTO ... WHERE R.vendaId = ?`, [String(v.id)]).catch(...);
  const mappedItems = (items || []).map((it: any) => ({
    id: it.relId ? String(it.relId) : generateUUID(),
    vendaId: String(v.id),
    produtoId: it.origemProdutoId ? String(it.origemProdutoId) : String(it.produtoId),
    quantidade: Number(it.quantidade ?? 1),
  }));
  vendasLocal.push({ ...v, itens: mappedItems });
}
...
for (const p of pedidosRows) { ... pedidosLocal.push({ ...p, itens: mappedItems }); }
```
- **What:** Expands pending sales and orders with their relation rows and rewrites each line to prefer `origemProdutoId` over the local product ID.
- **Why here:** The server-facing payload needs per-line product references, not just parent rows.
- **Assumes:** Falling back to the local product ID when `origemProdutoId` is absent is acceptable to the push endpoint.
- **Establishes:** `vendasLocal` and `pedidosLocal` are shaped for outbound sync.
- **Depended on by:** Payload construction and any returned ID-map handling.

```ts
// L74-L146
const payload = { produtos: produtosLocal, vendas: vendasLocal, pedidos: pedidosLocal };
const syncRes = await api.sincronizar(token, payload).catch((err) => { ... return null; });
if (syncRes) {
  ...
  await database.runAsync('UPDATE TB_VENDAS SET sync_status = ? WHERE id = ?', ['synced', String(v.id)]).catch(...);
  ...
  const mapaProdutos = syncRes.mapaProdutos || syncRes.mapa_produtos || null;
  ...
  await database.runAsync('UPDATE TB_PRODUTOS SET origemProdutoId = ?, sync_status = ? WHERE id = ?', [serverId, 'synced', String(localId)]).catch(...);
}
```
- **What:** Pushes the local queue, then marks pushed orders/sales as synced and applies any returned ID maps, especially product origin IDs.
- **Why here:** The later pull wants the local queue reduced and local rows linked to server identifiers when available.
- **Assumes:** A truthy `syncRes` means the push succeeded even if some maps are missing, and marking orders/sales as synced without explicit maps is acceptable.
- **Establishes:** Successful push results are reflected into local `sync_status` and `origemProdutoId` state before the pull phase.
- **Depended on by:** Avoiding repeated outbound resends and correct local/server product identity matching on future runs.

```ts
// L149-L168
let sinceIso: string | undefined = undefined;
if (schema && typeof schema.lastSyncAt !== 'undefined' && schema.lastSyncAt !== null) {
  const raw = schema.lastSyncAt;
  const s = raw == null ? '' : String(raw).trim();
  const num = Number(s);
  if (!Number.isNaN(num)) {
    sinceIso = new Date(num).toISOString();
  }
}
const changes = sinceIso ? await api.getChanges(token, sinceIso).catch(... ) : await api.getChanges(token).catch(...);
```
- **What:** Converts the stored epoch checkpoint into the ISO `since` string the pull endpoint expects, then requests remote changes.
- **Why here:** Pull should be incremental when a last-sync checkpoint exists.
- **Assumes:** `lastSyncAt` is stored as epoch milliseconds and the remote endpoint expects ISO strings.
- **Establishes:** `changes` is the authoritative remote delta (or `null` on handled pull failure).
- **Depended on by:** All subsequent local upsert/delete logic and `lastSyncAt` advancement.

```ts
// L185-L417
if (changes && Array.isArray(changes.tiposProduto) && changes.tiposProduto.length > 0) { ... markChanged('produtos'); }
if (changes && Array.isArray(changes.produtos) && changes.produtos.length > 0) { ... markChanged('produtos'); }
if (changes && Array.isArray(changes.pedidos) && changes.pedidos.length > 0) { ... markChanged('pedidos'); }
if (changes && Array.isArray(changes.vendas) && changes.vendas.length > 0) { ... markChanged('vendas'); }
```
- **What:** Applies four independent remote-delta blocks, each inside its own transaction attempt, comparing remote and local timestamps and honoring delete markers or closed-order removal paths.
- **Why here:** Once the pull result exists, local SQLite becomes the cached projection of remote authoritative state.
- **Assumes:** Comparing `updatedAt >= localUpdated` is the right conflict-resolution rule across all entity types.
- **Establishes:** Local tables reflect pulled remote changes table by table, and dependent screens are signaled through `markChanged()`.
- **Depended on by:** Product/order/sale tabs and any later sync that needs the updated local baseline.

```ts
// L419-L447
if (changes) {
  const vendasDias = changes.politica?.vendasDias ?? 7;
  const vendasLimite = new Date(Date.now() - vendasDias * 24 * 60 * 60 * 1000).toISOString();
  await database.runAsync(
    'DELETE FROM RL_VENDA_PRODUTO WHERE vendaId IN (SELECT id FROM TB_VENDAS WHERE horario < ? AND sync_status = ?)',
    [vendasLimite, 'synced']
  ).catch(...);
  ...
}
```
- **What:** Applies local retention cleanup for old synced sales and any remaining closed synced orders.
- **Why here:** Cleanup depends on pulled server policy and should happen after remote deltas are applied.
- **Assumes:** `horario` string comparison against an ISO threshold is the intended retention rule for local sales.
- **Establishes:** Some old synced rows are removed from local cache after a successful pull phase.
- **Depended on by:** Local storage footprint and recent-history views.

```ts
// L449-L463
if (syncRes && changes !== null) {
  const serverTime = (changes && (changes.serverTime || changes.now || changes.timestamp)) || null;
  const nowToStore = serverTime && typeof serverTime === 'string' ? Date.parse(serverTime) : (typeof serverTime === 'number' ? serverTime : Date.now());
  if (!Number.isNaN(nowToStore)) {
    await database.runAsync('UPDATE TB_SCHEMA SET lastSyncAt = ?', [nowToStore]).catch(...);
  }
}
return changes;
```
- **What:** Advances `TB_SCHEMA.lastSyncAt` only when both push and pull completed, then returns the pulled changes.
- **Why here:** Incremental sync checkpoints should only move after a full round trip.
- **Assumes:** `changes.serverTime || changes.now || changes.timestamp` is the authoritative checkpoint field precedence.
- **Establishes:** Future sync attempts can pull from the new checkpoint and `AutoSyncContext.doSync()` can use the returned object to set `lastSync`.
- **Depended on by:** All later incremental pulls and last-sync-driven screen reloads.

**Cross-Function Dependencies:**
- Callee `api.sincronizar` / `api.getChanges` (external-source-available wrappers): sync correctness depends on their payload and response contracts (`services/api.ts L67-L114`).
- Callee `generateUUID` (internal): used to synthesize relation IDs when local relation rows lack one (`database/useSyncDatabase.ts L44-L45`, `L65-L66`).
- Callee `markChanged` (internal): each remote-apply block depends on it to notify UI refresh hooks (`database/tableWatermark.ts L13-L18`).
- Callers: `AuthContext.login()` launches it once after sign-in (`context/AuthContext.tsx L195-L199`); `AutoSyncContext.doSync()` is the main recurrent caller (`context/AutoSyncContext.tsx L57-L64`); tests under `database/__tests__/useSyncDatabase.test.ts` assert watermark side effects.
- Shared state: `TB_SCHEMA.lastSyncAt`, all product/order/sale tables and relation tables, table-watermark memory.
- Invariant couplings: Outbound queue selection depends on local CRUD helpers marking rows pending; UI refresh depends on remote-apply blocks calling `markChanged`.

**Open Questions:**
- unclear; need to inspect the backend endpoint contract for whether closing an order should always appear as `status === 'FECHADO'`, `deleted_at`, or both, because the local order-removal rule treats either condition as reason to delete the local order row (`database/useSyncDatabase.ts L295-L299`).
- unclear; need to inspect `expo-sqlite` behavior when individual per-row `runAsync()` calls inside a transaction are `.catch()`ed and ignored, because the surrounding transaction still commits afterward in several blocks (`database/useSyncDatabase.ts L205-L219`, `L258-L270`, `L308-L337`, `L380-L409`).
