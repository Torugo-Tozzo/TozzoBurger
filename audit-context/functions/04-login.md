## `login` in `context/AuthContext.tsx` (L106-L213)

**Purpose:** Exchanges credentials for a token, fetches the server profile, rewrites local user/schema state to match that profile, handles establishment changes by swapping local business data, and starts the first background sync. Without it, the mobile app would have no authenticated identity, no local `TB_USUARIO` row, and no initial sync after sign-in.

**Inputs & Assumptions:**
- `email` (`string`): user-supplied credential. Trust: semi-trusted (`app/login.tsx L17-L24`).
- `senha` (`string`): user-supplied credential. Trust: semi-trusted (`app/login.tsx L17-L24`).
- Implicit: `database` is available through `useSQLiteContext()` (`context/AuthContext.tsx L28-L28`).
- Preconditions:
  - `api.login()` returns a body containing one of `token`, `accessToken`, or `access_token` (`context/AuthContext.tsx L109-L113`); nothing in this repo constrains server response shape beyond that fallback chain.
  - `TB_USUARIO`, `TB_SCHEMA`, and business tables exist. Established by `initializeDatabase()` (`database/initializeDatabase.ts L24-L182`).

**Outputs & Effects:**
- Sets `loading = true` for the login attempt and always clears it in `finally` (`L107-L107`, `L210-L211`).
- Calls `/auth/login`, persists the returned token to SecureStore, and fetches `/usuarios/me` (`L109-L127`).
- Rewrites `TB_USUARIO` and `TB_SCHEMA` to match the returned profile, with a destructive local-table swap if the establishment changed (`L129-L191`).
- Sets `user` and `token` in React state (`L127-L127`, `L192-L192`).
- Starts a non-blocking sync through `runWithLock(() => sincronizarComServidor(database, t))` (`L193-L199`).
- Returns `true` on full success, `false` on any handled failure path (`L206-L209`).

**Block-by-Block:**

```ts
// L109-L118
const body = await api.login(email, senha);
const t = body?.token ?? body?.accessToken ?? body?.access_token ?? null;
if (!t) return false;
try {
  await SecureStore.setItemAsync(TOKEN_KEY, t);
} catch (err) {
  console.warn('Failed to persist token to SecureStore', err);
}
```
- **What:** Authenticates against the remote API, extracts a token from known response keys, and best-effort persists it.
- **Why here:** Everything else depends on having a token to fetch profile and sync.
- **Assumes:** Any successful login response with no recognized token key should be treated as a failed login.
- **Establishes:** `t` is available for `/usuarios/me` and later auth state.
- **Depended on by:** The profile fetch block and final `setToken(t)`.

```ts
// L121-L127
const me = await api.getMe(t);
if (!me) {
  console.warn('Failed to fetch /usuarios/me: empty profile');
  return false;
}
setUser(me);
```
- **What:** Fetches the authenticated user profile and stores it in React state.
- **Why here:** The provider needs server identity before deciding how to rewrite local rows.
- **Assumes:** `/usuarios/me` is the authoritative identity source for user and establishment context.
- **Establishes:** The following DB rewrite can source `me.id`, `me.email`, `me.estabelecimentoId`, `me.role`, and names from one object.
- **Depended on by:** All `TB_USUARIO` / `TB_SCHEMA` update logic below.

```ts
// L129-L150
const prev = await database.getFirstAsync(...`SELECT id, email, estabelecimentoId FROM TB_USUARIO LIMIT 1`).catch(() => null);
...
if (!prev) {
  await insertUser();
  await database.runAsync('UPDATE TB_SCHEMA SET usuarioId = ?, estabelecimentoId = ?', [meIdNum, meEstab]).catch(...);
  await seedTipoProduto(database).catch(...);
}
```
- **What:** Handles the first-login path by replacing any existing `TB_USUARIO` contents, updating `TB_SCHEMA`, and reseeding product types.
- **Why here:** A first login needs a local user row and local metadata before the app starts normal operation.
- **Assumes:** Only one local user row matters, so deleting `TB_USUARIO` wholesale is acceptable.
- **Establishes:** Local user/profile metadata is aligned with the authenticated server user after first sign-in.
- **Depended on by:** Offline startup fallback in `load()` (`context/AuthContext.tsx L71-L85`) and UI role checks.

```ts
// L152-L179
if (String(prev.estabelecimentoId) !== String(meEstab)) {
  await database.execAsync('BEGIN;');
  const deletes = [
    'DELETE FROM RL_VENDA_PRODUTO;',
    'DELETE FROM RL_PEDIDO_PRODUTO;',
    'DELETE FROM TB_PRODUTOS;',
    'DELETE FROM TB_TP_PRODUTO;',
    'DELETE FROM TB_VENDAS;',
    'DELETE FROM TB_PEDIDOS;',
    'DELETE FROM TB_IMPRESSORAS;'
  ];
  ...
  await database.runAsync('UPDATE TB_SCHEMA SET usuarioId = ?, estabelecimentoId = ?', [meIdNum, meEstab]).catch(...);
  await database.execAsync('COMMIT;');
  await seedTipoProduto(database).catch(...);
}
```
- **What:** On establishment change, clears the local business dataset and printer selection, writes the new user row and schema linkage, commits, then reseeds product types.
- **Why here:** The app treats local products/orders/sales as establishment-scoped.
- **Assumes:** Comparing `String(prev.estabelecimentoId)` to `String(meEstab)` is the right equality rule for establishment identity.
- **Establishes:** After a successful swap, the local SQLite business state belongs to the newly authenticated establishment.
- **Depended on by:** All later local CRUD and sync paths, which implicitly assume one establishment’s data per device DB.

```ts
// L180-L187
else {
  await database.execAsync('DELETE FROM TB_USUARIO;').catch(...);
  await database.runAsync(
    'INSERT INTO TB_USUARIO (nome, email, estabelecimentoId, nomeEstabelecimento, role) VALUES (?, ?, ?, ?, ?)',
    [meNome, meEmail, meEstab, meNomeEstab, meRole]
  ).catch(...);
  await database.runAsync('UPDATE TB_SCHEMA SET usuarioId = ?', [meIdNum]).catch(...);
}
```
- **What:** Rewrites the local user row without wiping business tables when the establishment stays the same.
- **Why here:** Profile fields and role may have changed even when the establishment did not.
- **Assumes:** Keeping existing business tables is correct whenever `estabelecimentoId` matches.
- **Establishes:** Local identity metadata stays current while preserving the current establishment’s data.
- **Depended on by:** Offline fallback and role-based UI behavior.

```ts
// L192-L199
setToken(t);
void runWithLock(() => sincronizarComServidor(database, t))
  .then((res) => {
    if (res === null) console.log('[sync] skipped login-triggered sync; another sync is in progress');
  })
  .catch((err) => console.warn('sync after login failed', err));
```
- **What:** Finalizes in-memory auth state and launches a background sync without blocking navigation.
- **Why here:** The app wants the user into the tab stack promptly while local tables fill in asynchronously.
- **Assumes:** Existing local state plus deferred sync is enough for immediate post-login navigation.
- **Establishes:** The first sync attempt is serialized through the shared sync lock rather than run inline.
- **Depended on by:** Startup after login and any screen that expects synced data to appear later.

**Cross-Function Dependencies:**
- Callee `api.login` / `api.getMe` (external-source-available wrappers): login depends on them for remote authentication and identity (`services/api.ts L22-L64`).
- Callee `seedTipoProduto` (internal): used to repopulate reference types after first login and establishment swap (`database/initializeDatabase.ts L189-L222`).
- Callee `runWithLock` (internal): the function depends on it to prevent its startup sync from colliding with any other sync trigger (`database/syncGuard.ts L14-L49`).
- Callee `sincronizarComServidor` (internal): expected to pull authoritative remote state after login (`database/useSyncDatabase.ts L15-L468`).
- Callers: `LoginScreen.handleLogin()` and `BluetoothScreen.handleLogin()` invoke this provider method (`app/login.tsx L17-L37`, `app/(tabs)/configs.tsx L94-L109`).
- Shared state: SecureStore token, `TB_USUARIO`, `TB_SCHEMA`, every local business table when establishment changes, React `user` / `token`.
- Invariant couplings: `load()` later relies on `TB_USUARIO` for offline fallback; sync relies on `TB_SCHEMA.estabelecimentoId` / `usuarioId` being current.

**Open Questions:**
- unclear; need to inspect whether the establishment-swap transaction is intended to include the later `seedTipoProduto()` call, because the reseed currently happens after `COMMIT` (`context/AuthContext.tsx L173-L179`).
- unclear; need to inspect whether `setToken(t)` should happen earlier or later relative to the local destructive swap, since route gating only watches `user` and `loading` in this repo (`app/_layout.tsx L69-L86`).
