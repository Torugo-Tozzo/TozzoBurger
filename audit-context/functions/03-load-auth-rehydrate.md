## `load` in `context/AuthContext.tsx` (L37-L103)

**Purpose:** Rehydrates a stored token on startup, validates it against `/usuarios/me` when possible, repairs local schema user IDs, and falls back to `TB_USUARIO` when validation fails for non-auth reasons. Without it, the route gate in `RootLayoutNav` would have no persisted auth context to decide whether to show `/login` or the tab stack (`app/_layout.tsx L74-L86`).

**Inputs & Assumptions:**
- Implicit: `TOKEN_KEY = 'tozzo_token_v1'` is the canonical SecureStore key (`context/AuthContext.tsx L32-L32`).
- Implicit: `mounted` must stay `true` before any state write to avoid updating after unmount (`L36-L36`, `L40-L45`, `L64-L67`, `L78-L85`, `L96-L102`).
- Preconditions:
  - `TB_SCHEMA` and `TB_USUARIO` exist if the function needs local fallback data. Established by `initializeDatabase()` (`database/initializeDatabase.ts L112-L121`, `L132-L182`).
  - `api.getMe()` returns a user object when the stored token is still valid. Established by external API behavior only (`services/api.ts L45-L64`).

**Outputs & Effects:**
- Reads the stored token from SecureStore (`L39-L39`).
- When `/usuarios/me` succeeds, sets `token`, sets `user`, and backfills `TB_SCHEMA.usuarioId` if it is missing (`L40-L56`).
- When `/usuarios/me` fails with `401/402/403`, deletes the stored token and clears auth state (`L57-L67`).
- When `/usuarios/me` fails for other reasons, keeps the token and attempts to populate `user` from local `TB_USUARIO` (`L68-L89`).
- Always sets `loading` to `false` before exit if the provider is still mounted (`L95-L96`).

**Block-by-Block:**

```ts
// L39-L45
const stored = await SecureStore.getItemAsync(TOKEN_KEY);
if (stored && mounted) {
  setToken(stored);
  const me = await api.getMe(stored);
  if (me && mounted) {
    setUser(me);
```
- **What:** Reads a persisted token, optimistically installs it into state, then fetches the server profile and stores the user on success.
- **Why here:** Startup needs auth context before route gating can settle.
- **Assumes:** A stored token is still meaningful enough to set in memory before validation completes.
- **Establishes:** Later recovery logic can treat `token` as present and decide how much more local state to repair.
- **Depended on by:** The local schema backfill block and the error-handling branches below.

```ts
// L46-L56
const schema = await database.getFirstAsync(...`SELECT usuarioId FROM TB_SCHEMA LIMIT 1`).catch(() => null);
const usuarioId = schema && typeof schema.usuarioId !== 'undefined' ? schema.usuarioId : null;
if (!usuarioId) {
  const uid = Number((me as any).id);
  await database.runAsync('UPDATE TB_SCHEMA SET usuarioId = ?', [!isNaN(uid) ? uid : null]);
}
```
- **What:** Repairs `TB_SCHEMA.usuarioId` from the server profile if the schema row lacks it.
- **Why here:** The provider already has a validated user profile in hand.
- **Assumes:** Converting `me.id` with `Number()` is the correct representation for `TB_SCHEMA.usuarioId`.
- **Establishes:** Later local code that reads `TB_SCHEMA.usuarioId` can find the authenticated user ID after a successful startup validation.
- **Depended on by:** Future sync/auth flows that inspect `TB_SCHEMA`.

```ts
// L57-L67
const status = err?.response?.status ?? err?.status ?? null;
if (status === 401 || status === 402 || status === 403) {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  if (mounted) {
    setToken(null);
    setUser(null);
  }
}
```
- **What:** Treats explicit auth-style statuses as proof that the stored token should be discarded.
- **Why here:** Startup should not keep a token the server has already rejected as unauthorized/forbidden.
- **Assumes:** Those status codes are the only cases where removing the stored token is appropriate.
- **Establishes:** Route gating will later treat the session as logged out.
- **Depended on by:** `RootLayoutNav` redirecting to `/login` when `user` remains null (`app/_layout.tsx L75-L83`).

```ts
// L68-L89
console.warn('Network/server error validating token — keeping stored token', err);
const prev = await database.getFirstAsync(...`SELECT id, nome, email, estabelecimentoId, nomeEstabelecimento, role FROM TB_USUARIO LIMIT 1`).catch(() => null);
if (prev && mounted) {
  setUser({ id: prev.id, nome: prev.nome, email: prev.email, estabelecimentoId: prev.estabelecimentoId, role: prev.role ?? 'FUNCIONARIO' });
}
```
- **What:** On non-auth failures, keeps the stored token and reconstructs a local user from `TB_USUARIO` if available.
- **Why here:** The app is offline-first and still wants a user context when the network or server is temporarily unavailable.
- **Assumes:** A locally cached `TB_USUARIO` row is sufficiently aligned with the stored token for startup to proceed.
- **Establishes:** The provider can leave `user` non-null even when the server could not be reached.
- **Depended on by:** Route gating and any screen that branches on `user.role`.

```ts
// L93-L102
} catch (err) {
  console.warn('Failed to load token from SecureStore', err);
} finally {
  if (mounted) setLoading(false);
}
...
return () => { mounted = false; };
```
- **What:** Logs SecureStore failures, always clears the loading flag, and prevents future state writes after unmount.
- **Why here:** Startup must terminate deterministically even if token rehydration fails.
- **Assumes:** `loading = false` with no token/user is the correct neutral state.
- **Establishes:** `RootLayoutNav` can eventually make a routing decision.
- **Depended on by:** The app shell’s loading gate in `app/_layout.tsx L75-L86`.

**Cross-Function Dependencies:**
- Callee `SecureStore.getItemAsync` / `deleteItemAsync` (external-black-box): auth rehydration and token removal depend on these calls.
- Callee `api.getMe` (external-source-available wrapper): `load` depends on it to distinguish token-valid from offline/server-error cases (`services/api.ts L45-L64`).
- Callee `SQLiteDatabase.getFirstAsync` / `runAsync` (external-black-box): used to read fallback user data and repair `TB_SCHEMA.usuarioId`.
- Callers: the outer `useEffect` in `AuthProvider` calls `load()` on mount (`context/AuthContext.tsx L35-L37`, `L100-L103`).
- Shared state: SecureStore token, React auth state, `TB_SCHEMA.usuarioId`, `TB_USUARIO`.
- Invariant couplings: `RootLayoutNav` assumes `loading` flips to `false`; later login and sync flows assume the provider either has a user or is cleanly logged out.

**Open Questions:**
- unclear; need to inspect whether keeping the stored token after non-auth `getMe` failure is always intended for every screen, since this repo only reconstructs `user` from the first `TB_USUARIO` row and does not re-check the token locally.
