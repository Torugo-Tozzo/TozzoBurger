## `seedTipoProduto` in `database/initializeDatabase.ts` (L189-L222)

**Purpose:** Inserts the fixed catalog of product-type rows used by product filtering and classification. Without it, new installs and establishment swaps would have an empty `TB_TP_PRODUTO`, leaving product creation and filtering without the expected reference values (`database/useProductDatabase.ts L152-L160`, `hooks/useProductList.ts L50-L57`).

**Inputs & Assumptions:**
- `database` (`SQLiteDatabase`): DB handle for inserts. Trust: trusted container, external implementation.
- Implicit: `TB_TP_PRODUTO` already exists. Established by `initializeDatabase()` immediately before the call at `database/initializeDatabase.ts L38-L48`, `L130-L130`.
- Preconditions:
  - The fixed IDs in `tipos` are the canonical IDs the rest of the app expects. Established only by this literal array (`L190-L214`); nothing in this repo checks them against server-side configuration.

**Outputs & Effects:**
- Attempts to insert 23 rows into `TB_TP_PRODUTO`, ignoring duplicates through `INSERT OR IGNORE` (`L216-L220`).
- Leaves existing rows untouched if the same IDs are already present.

**Block-by-Block:**

```ts
// L190-L214
const tipos = [
  { id: 1, descricao: "Hambúrguer", cor: "#2f84d3ff" },
  ...
  { id: 23, descricao: "Açaí", cor: "#5E35B1" }
];
```
- **What:** Defines the fixed seed set for product types, including IDs, labels, and colors.
- **Why here:** Later inserts need a deterministic source of reference rows.
- **Assumes:** These hard-coded IDs and descriptions match what local screens and any synced products will reference.
- **Establishes:** The following loop has the complete seed set to apply.
- **Depended on by:** The insert loop at `L216-L220` and any code that depends on type IDs being meaningful.

```ts
// L216-L220
for (const tipo of tipos) {
  await database.runAsync(
    'INSERT OR IGNORE INTO TB_TP_PRODUTO (id, descricao, cor) VALUES (?, ?, ?)',
    [tipo.id, tipo.descricao, tipo.cor]
  );
}
```
- **What:** Iterates through the seed array and inserts each row unless an existing row with that primary key already exists.
- **Why here:** This preserves idempotence across startup and auth reseed calls.
- **Assumes:** Leaving existing rows unchanged is acceptable even if their `descricao` or `cor` differs from the current literal values.
- **Establishes:** Every missing canonical type row is present after the loop finishes.
- **Depended on by:** Product filtering (`database/useProductDatabase.ts L152-L160`, `L166-L176`) and auth establishment-swap recovery (`context/AuthContext.tsx L150-L150`, `L179-L179`).

**Cross-Function Dependencies:**
- Callee `SQLiteDatabase.runAsync` (external-black-box): the function depends on it to insert rows serially.
- Callers: `initializeDatabase()` calls it on schema creation/migration (`database/initializeDatabase.ts L130-L130`), and `AuthContext.login()` calls it after first login or establishment swap (`context/AuthContext.tsx L150-L150`, `L179-L179`).
- Shared state: `TB_TP_PRODUTO`.
- Invariant couplings: Product listing assumes active type IDs exist so joins and filters do not collapse to an empty set.

**Open Questions:**
- unclear; need to inspect whether the backend also treats these numeric IDs as canonical for synced products, because this repo does not reconcile drift if an existing row has the same ID but different metadata.
