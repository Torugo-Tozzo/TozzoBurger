# Fase 7 — LGPD Bloco 3 (Segurança Básica) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a global rate limit and baseline security response headers to the api, and triage + patch known-vulnerable dependencies in both api and front.

**Architecture:** Two new cross-cutting Elysia hooks in the api's `app.ts` (a global `onRequest` rate limiter excluding `/events`, and an `onAfterHandle` setting 4 security headers); a documented dependency triage note plus `bun audit fix` (in-range only) in each of the api and front repos.

**Tech Stack:** Bun + Elysia (api); Vite + React + TypeScript (front).

**Spec:** `C:/RN/TozzoBurger/docs/superpowers/specs/2026-08-29-fase-7-lgpd-security-baseline-design.md`

## Global Constraints

- No `Content-Security-Policy` in this plan — deferred, out of scope (per spec).
- `bun audit fix` only (no `--latest`) — no major-version dependency bumps in this plan.
- Mobile (`TozzoBurger` repo) and the shared nginx config are out of scope for every task in this plan — nginx is applied directly by the controller via SSH, not a task here.
- The existing `/auth/login` and `/auth/register` rate limiters are untouched — the new global limiter is additive, does not replace them.
- Never push, open a PR, or merge to `dev`/`main` from inside a task.

---

## Task 1: API — global rate limit + security headers

**Files:**
- Create: `api/api-tozzo.uk/lib/globalRateLimit.ts`
- Modify: `api/api-tozzo.uk/app.ts`
- Test: `api/api-tozzo.uk/tests/app/app.test.ts` (extend the existing file)

**Interfaces:**
- Produces: every response from the api (except `GET /events`) carries `RateLimit-Limit: 1200`/`RateLimit-Remaining`/`RateLimit-Reset` headers (via the existing `createRateLimit` factory's own header-setting behavior — see `lib/rateLimit.ts:45-47`) and 4 new security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Strict-Transport-Security`). `resetGlobalRateLimit()` exported from `lib/globalRateLimit.ts` for tests.
- Consumes: `createRateLimit` from `lib/rateLimit.ts` (existing, unmodified).

### Step-by-step

- [ ] **Step 1: Write the failing tests**

Open `api/api-tozzo.uk/tests/app/app.test.ts` — it already imports the real `app` (no Prisma mock needed, `describe('Health Check ...')`/`describe('CORS Configuration ...')` etc. hit the app directly via `makeRequest`). Add new `describe` blocks at the end of the file, reusing the existing `makeRequest` helper:

```typescript
describe('Global Rate Limit', () => {
  it('reporta o limite de 1200 em qualquer rota', async () => {
    const { response } = await makeRequest('GET', '/health');
    expect(response.headers.get('ratelimit-limit')).toBe('1200');
  });

  it('não aplica o limite global em /events', async () => {
    const { response } = await makeRequest('GET', '/events');
    expect(response.headers.get('ratelimit-limit')).toBeNull();
  });
});

describe('Security Headers', () => {
  it('aplica os 4 headers de segurança em qualquer resposta', async () => {
    const { response } = await makeRequest('GET', '/health');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(response.headers.get('strict-transport-security')).toBe('max-age=31536000; includeSubDomains');
  });
});
```

(`/events` will respond with some non-200 status since no valid SSE token is sent — that's fine and expected, the assertion only cares that the rate-limit header is absent, not the status code.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test tests/app/app.test.ts`
Expected: FAIL — `ratelimit-limit` header is `null` on `/health` (no global limiter wired yet), and the 4 security header assertions fail (headers not set yet).

- [ ] **Step 3: Create `lib/globalRateLimit.ts`**

```typescript
import { createRateLimit } from './rateLimit';

export const globalRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1200,
  message: { message: 'Muitas requisições. Tente novamente em alguns minutos.' },
});

export function resetGlobalRateLimit() {
  globalRateLimit.reset();
}
```

- [ ] **Step 4: Wire both hooks into `app.ts`**

Add the import near the other imports in `api/api-tozzo.uk/app.ts` (~line 18, alongside `import { captureRawBody } from './lib/rawBody';`):

```typescript
import { globalRateLimit } from './lib/globalRateLimit';
```

Insert two new hooks right before the existing `.onRequest(async ({ request, status }) => { ... })` block (~line 74), so the chain reads:

```typescript
  .use(swagger({
    // ...unchanged...
  }))
  .onRequest(({ request, set }) => {
    const pathname = new URL(request.url).pathname;
    if (pathname === '/events') return;
    return globalRateLimit({ request, set });
  })
  .onAfterHandle(({ set }) => {
    set.headers['X-Content-Type-Options'] = 'nosniff';
    set.headers['X-Frame-Options'] = 'DENY';
    set.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin';
    set.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  })
  .onRequest(async ({ request, status }) => {
    // ...unchanged, existing body-size check...
  })
```

Do not modify the existing body-size `.onRequest` block itself — only insert the two new hooks immediately before it, leaving everything else in `app.ts` untouched.

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test tests/app/app.test.ts`
Expected: PASS.

- [ ] **Step 6: Full validation**

Run:
```bash
bunx prisma generate
bun test --isolate --parallel
bunx tsc --noEmit
```
Expected: all exit 0. Watch specifically for any pre-existing test that makes many rapid requests against the real `app` within a single test run (multiple `describe`/`it` blocks across the suite hitting `/health` or other routes repeatedly could, in principle, start accumulating against the same in-memory 1200-request bucket within one test process) — if any test starts failing with `429` where it previously passed, that's a real interaction to fix (e.g. by calling `resetGlobalRateLimit()` in that test's `beforeEach`), not something to ignore.

- [ ] **Step 7: Commit**

```bash
git add lib/globalRateLimit.ts app.ts tests/app/app.test.ts
git commit -m "feat(security): add global rate limit and baseline security headers"
```

---

## Task 2: API — dependency triage and patch

**Files:**
- Create: `api/api-tozzo.uk/docs/superpowers/sdd/2026-08-29-fase-7-lgpd-bloco3-deps-triage.md`
- Modify: `api/api-tozzo.uk/package.json`, `api/api-tozzo.uk/bun.lock` (via `bun audit fix`)

**Interfaces:**
- Consumes: nothing from Task 1 (independent — different files).
- Produces: nothing consumed by another task.

### Step-by-step

- [ ] **Step 1: Run the audit and capture the current state**

Run: `bun audit`

Read the full output. Group every reported advisory chain by its top-level dependency path (e.g. `prisma > @prisma/dev > @hono/node-server` vs `@elysiajs/swagger > @scalar/types > nanoid`).

- [ ] **Step 2: Write the triage note**

Create `api/api-tozzo.uk/docs/superpowers/sdd/2026-08-29-fase-7-lgpd-bloco3-deps-triage.md` with a table classifying each top-level chain from the `bun audit` output as one of:
- **Runtime real** — the top-level package is imported and executed by the running server process (e.g. `stripe`, `exceljs`, `@elysiajs/swagger`, `@sentry/bun` are all imported in `app.ts`/`modules/*` and run in production).
- **Dev-tooling só** — the chain only exists under a CLI/build-time tool (e.g. anything under `prisma > @prisma/dev > ...` or `prisma > @prisma/config > ...` — those run only when you invoke the `prisma` CLI locally/in CI, never inside the deployed server process).

For each row, name the top-level package, the classification, and a one-line reason (cite the actual import site for "runtime real" rows — e.g. `app.ts:3` for `@elysiajs/swagger`). Use the real output from Step 1, not a guess — if a chain doesn't match anything described in the spec's "Contexto confirmado" section, classify it yourself using the same test (is the top-level package `import`ed anywhere reachable from `app.ts`, or only used by a `prisma`/build CLI invocation?).

- [ ] **Step 3: Run `bun audit fix`**

Run: `bun audit fix`

This upgrades vulnerable packages within their current semver range only (no major-version jump). Do **not** run `bun audit fix --latest`.

- [ ] **Step 4: Validate nothing broke**

Run:
```bash
bunx prisma generate
bun test --isolate --parallel
bunx tsc --noEmit
```
Expected: all exit 0, same pass count as before Step 3 (or higher, never lower).

- [ ] **Step 5: Re-run the audit and record the delta**

Run: `bun audit`

Add a short final section to the triage note from Step 2 recording the vulnerability count before (from Step 1) and after (this run) `bun audit fix`, and confirm no new advisory appeared that wasn't there in Step 1.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/sdd/2026-08-29-fase-7-lgpd-bloco3-deps-triage.md package.json bun.lock
git commit -m "chore(deps): triage and patch in-range vulnerable dependencies"
```

---

## Task 3: Front — dependency triage and patch

**Files:**
- Create: `front/front-tozzo.uk/docs/superpowers/sdd/2026-08-29-fase-7-lgpd-bloco3-deps-triage.md`
- Modify: `front/front-tozzo.uk/package.json`, `front/front-tozzo.uk/bun.lock` (via `bun audit fix`)

**Interfaces:**
- Consumes: nothing from Task 1 or Task 2 (independent — different repo).
- Produces: nothing consumed by another task in this plan.

### Step-by-step

- [ ] **Step 1: Run the audit and capture the current state**

Run: `bun audit`

Read the full output. Group every reported advisory chain by its top-level dependency path (e.g. `vite > rollup`).

- [ ] **Step 2: Write the triage note**

Create `front/front-tozzo.uk/docs/superpowers/sdd/2026-08-29-fase-7-lgpd-bloco3-deps-triage.md`, same table format as the api's (Task 2, Step 2):
- **Runtime real** — the package ends up in the shipped browser bundle (check with `bun run build` output / whether the package is imported from `src/`).
- **Dev-tooling só** — the package only runs during `bun run build`/`bun test` locally or in CI, never shipped to the browser (e.g. `vite`, `@vitejs/plugin-react`, `rollup` are build-time only — the production artifact is static HTML/JS/CSS, none of those tools execute in the user's browser).

Use the real `bun audit` output from Step 1, not a guess.

- [ ] **Step 3: Run `bun audit fix`**

Run: `bun audit fix`

In-range only, no `--latest`.

- [ ] **Step 4: Validate nothing broke**

Run:
```bash
bun test
bun run scripts/check-i18n.mjs
bun run build
bunx tsc --noEmit
```
Expected: all exit 0, same pass count as before Step 3 (or higher, never lower).

- [ ] **Step 5: Re-run the audit and record the delta**

Run: `bun audit`

Add a final section to the triage note recording the before/after vulnerability count and confirming no new advisory appeared.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/sdd/2026-08-29-fase-7-lgpd-bloco3-deps-triage.md package.json bun.lock
git commit -m "chore(deps): triage and patch in-range vulnerable dependencies"
```

---

## Self-Review Notes (for the controller, not a task)

- Spec coverage: rate limit global + `/events` exclusion (Task 1) ✅; 4 security headers via api code (Task 1) ✅; dependency triage + in-range patch, api (Task 2) and front (Task 3) ✅. Nginx headers are explicitly out of this plan — controller applies directly via SSH per the spec's "Infra" section, not a task here. CSP and major-version dependency bumps explicitly out of scope per the spec.
- All 3 tasks are mutually independent (different files/repos) — can run in parallel.
- Known follow-up, not part of this plan: the controller still needs to apply the nginx header snippet from the spec (dev blocks first, then prod, with `nginx -t`/backup) after this plan's tasks are done — that step doesn't touch any git repo so it isn't itself a task.
