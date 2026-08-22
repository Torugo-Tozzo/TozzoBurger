## `runWithLock` in `database/syncGuard.ts` (L14-L49)

**Purpose:** Serializes sync-like async work so at most one run is active and at most one follow-up run is queued, with concurrent waiters coalesced onto shared promises. Without it, login-triggered sync, auto-sync, and manual sync could overlap against the same local tables and remote endpoints.

**Inputs & Assumptions:**
- `fn` (`() => Promise<T>`): async unit of work to run under the guard. Trust: internal caller-supplied closure.
- Implicit: module-level `_currentSync` and `_queuedSync` are the only lock state (`database/syncGuard.ts L1-L2`).
- Preconditions:
  - Callers interpret a returned `null` as "this attempt did not become an independent run". Established by `AutoSyncContext.doSync()` (`context/AutoSyncContext.tsx L78-L81`) and `AuthContext.login()`'s log-only handling (`context/AuthContext.tsx L195-L199`).

**Outputs & Effects:**
- Starts `fn()` immediately when no active run exists (`database/syncGuard.ts L38-L48`).
- If a queued run already exists, returns that promise to all later callers (`L15-L17`).
- If one run is active but no queued run exists, schedules exactly one follow-up execution after the current run settles (`L19-L35`).
- Clears `_currentSync` or `_queuedSync` only when the promise being finalized is still the one stored (`L28-L31`, `L44-L47`).

**Block-by-Block:**

```ts
// L15-L17
if (_queuedSync) {
  return _queuedSync as Promise<T | null>;
}
```
- **What:** Reuses the already-queued follow-up promise for any additional concurrent callers.
- **Why here:** Once a follow-up run is committed, further callers should coalesce instead of adding more work.
- **Assumes:** All waiters can accept the same eventual result.
- **Establishes:** There is never more than one queued follow-up promise.
- **Depended on by:** `AutoSyncContext.doSync()` callers that arrive while a queued retry already exists.

```ts
// L19-L35
if (_currentSync) {
  const queued = _currentSync
    .catch(() => {})
    .then(() => {
      _queuedSync = null;
      const run = fn();
      _currentSync = run;
      return run.finally(() => {
        if (_currentSync === run) {
          _currentSync = null;
        }
      });
    });
  _queuedSync = queued;
  return queued;
}
```
- **What:** When a run is active, chains one queued execution after it, ignoring the prior run’s rejection and promoting the new run to `_currentSync`.
- **Why here:** This is the serialized "one more pass" path that avoids the prior race where multiple waiters woke and ran together (described in the file comment at `L4-L13`).
- **Assumes:** Running exactly one follow-up after the current sync is enough to absorb any number of concurrent triggers.
- **Establishes:** The next independent run begins only after the current promise settles, whether successfully or not.
- **Depended on by:** Auto-sync’s pending-retry model and login-triggered sync collision handling.

```ts
// L38-L48
const promise = fn();
_currentSync = promise;
try {
  return await promise;
} finally {
  if (_currentSync === promise) {
    _currentSync = null;
  }
}
```
- **What:** Starts and tracks the first active run when the guard is idle, then clears `_currentSync` only if it still refers to that promise.
- **Why here:** The idle path should begin work immediately without creating a queued wrapper.
- **Assumes:** `fn()` returns a promise immediately and any synchronous throw is represented as a rejected promise at the call site.
- **Establishes:** `_currentSync` marks the active run for later coalescing and is cleared safely against replacement races.
- **Depended on by:** Every caller that arrives while one run is active.

**Cross-Function Dependencies:**
- Callers: `AuthContext.login()` uses it for post-login sync (`context/AuthContext.tsx L195-L199`); `AutoSyncContext.doSync()` uses it for app-state/connectivity/manual syncs (`context/AutoSyncContext.tsx L57-L64`); tests in `database/__tests__/syncGuard.test.ts` exercise the intended queueing semantics.
- Shared state: `_currentSync`, `_queuedSync`.
- Invariant couplings: The repo’s sync scheduling model assumes at most one active sync and one queued follow-up globally.

**Open Questions:**
- unclear; need to inspect whether any non-sync caller is expected to use this guard in the future, because the sentinel `null` return contract is currently only interpreted by sync code.
