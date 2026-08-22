## `initializeDatabase` in `database/initializeDatabase.ts` (L3-L187)

**Purpose:** Creates the local SQLite schema, seeds reference product types, and records the current schema version so the app can open with expected tables and columns. Without it, every provider and DB hook above `SQLiteProvider` would be reading or writing tables whose existence and column set are not established (`app/_layout.tsx L53-L62`).

**Inputs & Assumptions:**
- `database` (`SQLiteDatabase`): Expo SQLite handle used for all schema reads and writes. Trust: trusted container, external implementation (`database/initializeDatabase.ts L3-L3`).
- Implicit: `TB_SCHEMA` might already exist with `version`, `estabelecimentoId`, `usuarioId`, and `sincronizacaoAutomatica`; missing-table errors are treated as "version 0" (`L7-L17`).
- Preconditions:
  - The caller runs this before other DB consumers rely on the schema. Established by `SQLiteProvider` using `onInit={initializeDatabase}` (`app/_layout.tsx L54-L54`).
  - `SCHEMA_VERSION` monotonically tracks schema shape. Established locally only by the constant assignment (`database/initializeDatabase.ts L4-L4`); nothing in this repo enforces update discipline.

**Outputs & Effects:**
- Creates tables `TB_PRODUTOS`, `TB_TP_PRODUTO`, `TB_VENDAS`, `TB_PEDIDOS`, `RL_PEDIDO_PRODUTO`, `RL_VENDA_PRODUTO`, `TB_IMPRESSORAS`, `TB_USUARIO`, `TB_ESTABELECIMENTO`, and `TB_SCHEMA` if absent (`L24-L140`).
- Seeds fixed rows into `TB_TP_PRODUTO` by calling `seedTipoProduto()` (`L130-L130`).
- Updates or inserts the single `TB_SCHEMA` row with the current schema version and ensures newer columns exist through best-effort `ALTER TABLE` calls (`L142-L183`).
- Returns early without writes when the stored version is already at least `SCHEMA_VERSION` (`L19-L22`).

**Block-by-Block:**

```ts
// L4-L17
const SCHEMA_VERSION = 1005;
let dbVersion = 0;
try {
  const row = await database.getFirstAsync(...`SELECT version ... FROM TB_SCHEMA LIMIT 1`);
  if (row && typeof row.version !== 'undefined') dbVersion = Number(row.version) || 0;
} catch (err) {
  dbVersion = 0;
}
```
- **What:** Reads the stored schema version if `TB_SCHEMA` is present; otherwise falls back to `0`.
- **Why here:** The function needs a gate before running DDL on every startup.
- **Assumes:** A thrown read means "schema row not usable yet" rather than an unrecoverable DB state.
- **Establishes:** Later code can branch between no-op and migration paths using `dbVersion`.
- **Depended on by:** The early-return gate at `L19-L22` and the migration/update branch at `L149-L183`.

```ts
// L19-L22
if (dbVersion >= SCHEMA_VERSION) {
  return;
}
```
- **What:** Skips all remaining schema work when the stored version is already current.
- **Why here:** Avoids reseeding and repeated DDL after a successful prior initialization.
- **Assumes:** Equal-or-higher version implies the existing tables and columns are compatible with current code.
- **Establishes:** Any caller after this point only runs on a stale or empty schema.
- **Depended on by:** Every `CREATE TABLE`, seed, and `ALTER TABLE` below.

```ts
// L24-L128
await database.execAsync(`CREATE TABLE IF NOT EXISTS TB_PRODUTOS (...);`);
...
await database.execAsync(`CREATE TABLE IF NOT EXISTS TB_ESTABELECIMENTO (...);`);
```
- **What:** Creates all business tables and relation tables if they do not already exist.
- **Why here:** Base tables must exist before seeding types or storing schema metadata.
- **Assumes:** `execAsync` runs each DDL statement successfully in sequence or throws.
- **Establishes:** The local store can hold products, product types, sales, orders, printer metadata, and local user data with the columns current code later reads.
- **Depended on by:** `seedTipoProduto()` (`L130-L130`), auth/user persistence (`context/AuthContext.tsx L129-L186`), sync writes (`database/useSyncDatabase.ts L203-L456`), and CRUD hooks under `database/`.

```ts
// L130-L130
await seedTipoProduto(database);
```
- **What:** Seeds fixed product-type reference data.
- **Why here:** Product screens and filters expect `TB_TP_PRODUTO` to have at least a baseline set.
- **Assumes:** `TB_TP_PRODUTO` exists from the prior DDL block and duplicate inserts are safe because `seedTipoProduto()` uses `INSERT OR IGNORE` (`L217-L220`).
- **Establishes:** The type table has canonical IDs available for product creation and filtering.
- **Depended on by:** Product creation/edit UI and auth flows that reseed types after establishment swap (`context/AuthContext.tsx L150-L150`, `L179-L179`).

```ts
// L132-L183
await database.execAsync(`CREATE TABLE IF NOT EXISTS TB_SCHEMA (...);`);
const existing = await database.getFirstAsync(...`SELECT version ... FROM TB_SCHEMA LIMIT 1`).catch(() => null);
if (existing && typeof existing.version !== 'undefined') {
  await database.execAsync(`UPDATE TB_SCHEMA SET version = 1005;`);
  try { await database.execAsync(`ALTER TABLE TB_SCHEMA ADD COLUMN lastSyncAt INTEGER NULL;`); } catch {}
  ...
} else {
  await database.execAsync(`INSERT INTO TB_SCHEMA (...) VALUES (1005, NULL, NULL, 0, NULL);`);
}
```
- **What:** Ensures `TB_SCHEMA` exists, then either updates the existing row and adds missing columns or inserts the first schema row.
- **Why here:** Later code depends on `TB_SCHEMA` as the single source for `version`, `usuarioId`, `estabelecimentoId`, and `lastSyncAt`.
- **Assumes:** A single-row table is sufficient and callers will continue to use `LIMIT 1` consistently.
- **Establishes:** `TB_SCHEMA` contains a row after successful completion, and older installs gain the added columns on a best-effort basis.
- **Depended on by:** Auth rehydration and login (`context/AuthContext.tsx L47-L52`, `L149-L149`, `L172-L172`), sync reads/writes of `lastSyncAt` (`database/useSyncDatabase.ts L18-L19`, `L151-L157`, `L456-L456`).

```ts
// L184-L185
} catch (err) {
  console.warn('Failed to write TB_SCHEMA version:', err);
}
```
- **What:** Logs and suppresses schema-metadata write failures.
- **Why here:** Keeps startup from throwing after base table creation even if metadata persistence fails.
- **Assumes:** Running with tables created but `TB_SCHEMA` missing or stale is still survivable for later code.
- **Establishes:** The function can return even when version bookkeeping did not complete.
- **Depended on by:** Callers that expect startup not to abort on metadata write failure.

**Cross-Function Dependencies:**
- Callee `seedTipoProduto` (internal): `initializeDatabase` depends on it to populate `TB_TP_PRODUTO` with fixed IDs before product screens and auth reseeds reference the table (`database/initializeDatabase.ts L130-L130`, `L189-L222`).
- Callee `SQLiteDatabase.execAsync` (external-black-box): every schema guarantee here depends on this API honoring DDL and `ALTER TABLE` requests.
- Callers: `SQLiteProvider` is the direct caller through `onInit={initializeDatabase}` (`app/_layout.tsx L54-L54`); all DB hooks and contexts assume that provider completed successfully before they execute.
- Shared state: `TB_SCHEMA`, all business tables, and reference types in `TB_TP_PRODUTO`.
- Invariant couplings: Sync and auth both assume `TB_SCHEMA` exists with a single row; CRUD hooks assume their target tables and columns already exist.

**Open Questions:**
- unclear; need to inspect whether `SQLiteProvider` blocks all child DB access until `onInit` completes, or whether children can race initialization under suspense (`app/_layout.tsx L53-L62`).
- unclear; need to inspect whether storing only a single `TB_SCHEMA` row is enforced anywhere outside repeated `LIMIT 1` reads (`database/initializeDatabase.ts L13-L14`, `L147-L147`).
