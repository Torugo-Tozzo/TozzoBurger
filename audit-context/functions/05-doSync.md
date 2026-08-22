## `doSync` in `context/AutoSyncContext.tsx` (L47-L102)

**Purpose:** Centralizes foreground/background/manual sync execution for the provider, including pre-sync pending counts, serialization through the sync lock, result bookkeeping, and one-deep retry coalescing. Without it, app-state resume, connectivity regain, and pull-to-refresh would each need their own coordination logic and could overlap.

**Inputs & Assumptions:**
- Implicit: `token` must be present to sync; the function returns `null` immediately otherwise (`context/AutoSyncContext.tsx L48-L48`).
- Implicit: `isSyncing` plus `pendingRef.current` is the provider-local signal for whether a follow-up run should be attempted (`L49-L52`, `L71-L74`, `L94-L98`).
- Preconditions:
  - `runWithLock()` serializes sync attempts across the whole app, not just this provider instance. Established by `database/syncGuard.ts L14-L49`.
  - `sincronizarComServidor()` returns either a change payload or `null` and can be treated as the source for server timestamps and sync success (`database/useSyncDatabase.ts L15-L468`).

**Outputs & Effects:**
- Refreshes the count of pending outbound rows before trying to sync (`L54-L54`).
- Runs `sincronizarComServidor()` under `runWithLock()` while toggling `isSyncing` around the actual sync body (`L57-L64`).
- Records failure details in `lastSyncResult` on thrown errors (`L65-L76`) and success details on completed runs (`L84-L89`).
- Updates `lastSync` from server time or `Date.now()` and refreshes `pendingCount` after success (`L84-L89`).
- Coalesces concurrent requests into one queued retry by toggling `pendingRef.current` (`L49-L52`, `L78-L81`, `L94-L98`).

**Block-by-Block:**

```ts
// L48-L52
if (!token) return null;
if (isSyncing) {
  pendingRef.current = true;
  return null;
}
```
- **What:** Rejects sync when there is no token and marks a follow-up request when this provider already thinks it is syncing.
- **Why here:** Avoids unnecessary DB/API work and collapses overlapping UI/background triggers.
- **Assumes:** A missing token means syncing should not start at all, and `null` is the shared "no sync result" sentinel.
- **Establishes:** Only one provider-initiated sync body proceeds at a time.
- **Depended on by:** The later `runWithLock()` block and retry scheduling.

```ts
// L54-L64
await refreshPendingCount();
res = await runWithLock(async () => {
  setIsSyncing(true);
  try {
    return await sincronizarComServidor(database as any, token);
  } finally {
    setIsSyncing(false);
  }
});
```
- **What:** Updates the pending-row count, then runs the sync engine under the shared lock while reflecting active state into React.
- **Why here:** The UI wants current pending counts and spinners before and during sync.
- **Assumes:** `setIsSyncing(true)` inside the locked closure brackets the real sync body closely enough for UI state.
- **Establishes:** `res` is either a real sync result from the engine or the lock’s sentinel `null`.
- **Depended on by:** The error path, `res === null` branch, and post-success bookkeeping.

```ts
// L65-L76
} catch (err: any) {
  const msg = err?.message ?? String(err);
  setLastSyncResult({ ok: false, message: msg, time: Date.now() });
  console.warn('AutoSync failed', err);
  if (pendingRef.current) {
    pendingRef.current = false;
    setTimeout(() => doSync(), 800);
  }
  return null;
}
```
- **What:** Records a failed sync attempt, logs it, and schedules one queued retry if another trigger arrived meanwhile.
- **Why here:** The provider wants failures surfaced to `SyncIndicator` while still honoring the coalesced follow-up signal.
- **Assumes:** A fixed 800 ms delay is sufficient backoff before reattempting the queued run.
- **Establishes:** Consumers of `lastSyncResult` can distinguish failed syncs by time and message.
- **Depended on by:** `components/SyncIndicator.tsx` reacting to `lastSyncResult` (`components/SyncIndicator.tsx L24-L41`).

```ts
// L78-L81
if (res === null) {
  pendingRef.current = true;
  return res;
}
```
- **What:** Treats `null` as "someone else is syncing" and marks a follow-up run.
- **Why here:** `runWithLock()` also uses `null` to signal coalesced callers.
- **Assumes:** `sincronizarComServidor()` itself does not return `null` on a successful standalone sync; otherwise the meanings would collide.
- **Establishes:** A lock-skipped attempt still leaves intent to retry once the active sync finishes.
- **Depended on by:** The queued retry in `finally`.

```ts
// L84-L98
const serverTime = res && (res.serverTime || res.now || res.timestamp) ? ... : null;
const parsed = serverTime ? ... : Date.now();
setLastSync(!Number.isNaN(parsed) ? parsed : Date.now());
setLastSyncResult({ ok: true, message: null, time: Date.now() });
await refreshPendingCount();
...
if (pendingRef.current) {
  pendingRef.current = false;
  setTimeout(() => doSync(), 800);
}
```
- **What:** On success, derives a sync timestamp, records a successful result, refreshes pending counts, and optionally runs one deferred retry.
- **Why here:** Screens watch `lastSync`, and the provider wants both user-visible status and an up-to-date pending badge.
- **Assumes:** `res.serverTime || res.now || res.timestamp` is the correct timestamp precedence for all sync responses.
- **Establishes:** A completed sync advances `lastSync`, clears or updates pending counts, and wakes any coalesced follow-up.
- **Depended on by:** Screen reload hooks (`hooks/useProductList.ts L113-L125`, `app/(tabs)/pedidos.tsx L72-L74`, `app/(tabs)/historico.tsx L98-L104`) and sync-status UI (`components/SyncIndicator.tsx L24-L41`).

**Cross-Function Dependencies:**
- Callee `refreshPendingCount` (internal closure): `doSync` depends on it to count local pending rows across products, sales, and orders (`context/AutoSyncContext.tsx L33-L45`).
- Callee `runWithLock` (internal): used to serialize actual sync execution across all callers (`database/syncGuard.ts L14-L49`).
- Callee `sincronizarComServidor` (internal): provides the actual push/pull result and any server timestamp fields (`database/useSyncDatabase.ts L15-L468`).
- Callers: app-state resume effect (`context/AutoSyncContext.tsx L104-L115`), connectivity effect (`L117-L126`), initial-token effect (`L128-L136`), `triggerSync` (`L144-L145`), `useSyncRefresh` (`hooks/useSyncRefresh.ts L13-L23`), and `SyncIndicator` (`components/SyncIndicator.tsx L43-L87`).
- Shared state: `isSyncing`, `pendingCount`, `lastSync`, `lastSyncResult`, `pendingRef.current`.
- Invariant couplings: `doSync` is the only place `lastSync` advances in this repo, so all last-sync-driven reload behavior depends on it.

**Open Questions:**
- unclear; need to inspect whether `sincronizarComServidor()` can ever legitimately return `null` on a completed sync, because `doSync()` treats `null` as "another sync already owns the work" (`context/AutoSyncContext.tsx L78-L81`).
