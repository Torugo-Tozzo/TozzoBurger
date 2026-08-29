# Fase 7 — LGPD Bloco 2 (Exclusão/Exportação de Dado) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an `OWNER` self-service delete their establishment's account (soft-delete + PII anonymization, Stripe subscription cancellation) or export their tenant's data as JSON, from the dashboard.

**Architecture:** New `EstablishmentStatus.DELETED` enum value + a transactional `POST /auth/delete-account` endpoint in the api that anonymizes every `User` row of the tenant and cancels any active Stripe subscription; a `GET /auth/export-data` endpoint that dumps the tenant's data as JSON; a new section in the front's `SettingsPage`, visible only to `OWNER`, with an export button and a password-gated delete dialog.

**Tech Stack:** Bun + Elysia + Prisma (api), Stripe SDK; Vite + React 18 + TypeScript + react-i18next + shadcn/Radix UI (front).

**Spec:** `C:/RN/TozzoBurger/docs/superpowers/specs/2026-08-29-fase-7-lgpd-account-deletion-export-design.md`

## Global Constraints

- Migration must be additive (new enum value only), no destructive operation, tested in an ephemeral Postgres before being treated as validated.
- Only `role === 'OWNER'` (normalized via `normalizeUserRole`) may call `delete-account` or `export-data` — everyone else gets `403`.
- Deletion anonymizes **every** `User` row of the establishment (not just the caller's), inside one Prisma transaction with the Stripe cancellation happening first — if Stripe cancellation fails, abort before touching the database.
- All new user-facing front text must exist in the 6 supported locales (`en`, `pt-BR`, `es`, `fr`, `zh`, `hi`) and pass `bun run scripts/check-i18n.mjs`.
- Mobile (`TozzoBurger` repo) is out of scope for every task in this plan.
- `DELETE /users/:id` (admin removing another user, hard delete) is untouched — out of scope.
- Never push, open a PR, or merge to `dev`/`main` from inside a task.

---

## Task 1: API — `DELETED` status, delete-account, export-data, webhook guard

**Files:**
- Modify: `api/api-tozzo.uk/prisma/schema.prisma` (`EstablishmentStatus` enum, ~line 49-53)
- Create: `api/api-tozzo.uk/prisma/migrations/<timestamp>_add_establishment_deleted_status/migration.sql`
- Modify: `api/api-tozzo.uk/modules/auth/auth.controller.ts` (add `deleteAccount`, `exportData`)
- Modify: `api/api-tozzo.uk/modules/auth/auth.routes.ts` (`protectedRoutes` group, ~line 31-40)
- Modify: `api/api-tozzo.uk/middlewares/elysiaAuth.ts` (`activeGuard`, ~line 111-120)
- Modify: `api/api-tozzo.uk/modules/payments/payments.controller.ts` (`customer.subscription.deleted` handler, ~line 183-200)
- Test: `api/api-tozzo.uk/tests/auth/auth.controller.test.ts`, `api/api-tozzo.uk/tests/middlewares/auth.middleware.test.ts`, `api/api-tozzo.uk/tests/payments/payments.webhook.test.ts`

**Interfaces:**
- Produces: `POST /auth/delete-account` (body `{ password: string }`, authenticated, `OWNER` only) → `200 { message }` on success, `401 AUTH_INVALID_PASSWORD` (wrong password), `403 AUTH_DELETE_FORBIDDEN` (not `OWNER`), `502 STRIPE_CANCELLATION_FAILED` (Stripe call failed, nothing changed in DB). `GET /auth/export-data` (authenticated, `OWNER` only) → `200` JSON body `{ establishment, users, products, orders, sales }`, `403 AUTH_EXPORT_FORBIDDEN` if not `OWNER`. `activeGuard` now responds `410 { code: 'ESTABLISHMENT_DELETED', message }` instead of `402` when `establishment.status === 'DELETED'`.
- Consumes: nothing from other tasks — this task is fully independent of Task 2 (front can be built/tested against a mocked api).

### Step-by-step

**Test style note (read before writing any test in this task):** every existing test file in `tests/auth/`, `tests/middlewares/`, and `tests/payments/` in this repo goes through the **real HTTP app** — `mock.module('../../lib/prisma', () => ({ default: fakePrisma }))` (a small in-memory fake, keyed by `Map`) called *before* `const { default: app } = await import('../../app')`, then requests are sent via `app.handle(new Request(...))`. None of them call a controller function directly with a hand-built `{ user, body, set }` object. Follow this exact style below — do not switch to direct function calls.

- [ ] **Step 1: Write the failing test for `activeGuard` distinguishing `DELETED`**

`tests/middlewares/auth.middleware.test.ts` today only tests `authContext` (not `activeGuard`) via a minimal `makeApp()` that wires `authContext` into a throwaway `Elysia` app. Extend it: add a second `makeGuardedApp()` that also applies `activeGuard` the same way `orders.routes.ts` does (`.guard({ beforeHandle: activeGuard }, ...)`), and a new `describe` block:

```typescript
import { activeGuard, authContext } from '../../middlewares/elysiaAuth';

function makeGuardedApp() {
  return new Elysia()
    .use(authContext)
    .guard({ beforeHandle: activeGuard }, (guarded) => guarded.get('/private', ({ user }) => user));
}

describe('activeGuard em app.handle', () => {
  beforeEach(resetState);

  it('responde 410 com ESTABLISHMENT_DELETED quando o estabelecimento está DELETED', async () => {
    const token = jwt.sign({ id: 'user-1', estabelecimentoId: 'estab-1' }, 'test-jwt-secret', { expiresIn: '30d' });
    seedUsuario({ establishment: { status: 'DELETED' } });
    const response = await makeGuardedApp().handle(new Request('http://localhost/private', { headers: { authorization: `Bearer ${token}` } }));
    expect(response.status).toBe(410);
    expect((await response.json()).code).toBe('ESTABLISHMENT_DELETED');
  });

  it('continua respondendo 402 pra PENDING_PAYMENT/SUSPENDED', async () => {
    const token = jwt.sign({ id: 'user-1', estabelecimentoId: 'estab-1' }, 'test-jwt-secret', { expiresIn: '30d' });
    seedUsuario({ establishment: { status: 'PENDING_PAYMENT' } });
    const response = await makeGuardedApp().handle(new Request('http://localhost/private', { headers: { authorization: `Bearer ${token}` } }));
    expect(response.status).toBe(402);
  });
});
```

`seedUsuario` already accepts `Partial<FakeUser>` overrides including `establishment: { status }` (see the existing `seedUsuario` helper, ~line 20-30) — no changes needed there.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test tests/middlewares/auth.middleware.test.ts`
Expected: FAIL — `activeGuard` still returns `402` for `DELETED` too (no distinct branch yet).

- [ ] **Step 3: Update `activeGuard`**

In `api/api-tozzo.uk/middlewares/elysiaAuth.ts` (~line 111-120), replace:

```typescript
export const activeGuard = ({ user, status }: { user?: ElysiaAuthUser; status: StatusResponder }) => {
  if (!user) return status(401, { message: 'User not authenticated' });

  if (user.establishment.status !== EstablishmentStatus.ACTIVE) {
    return status(402, {
      message: 'Pagamento necessário. Sua conta está pendente ou suspensa.',
      status: user.establishment.status,
    });
  }
};
```

with:

```typescript
export const activeGuard = ({ user, status }: { user?: ElysiaAuthUser; status: StatusResponder }) => {
  if (!user) return status(401, { message: 'User not authenticated' });

  if (user.establishment.status === EstablishmentStatus.DELETED) {
    return status(410, {
      code: 'ESTABLISHMENT_DELETED',
      message: 'Este estabelecimento foi excluído.',
      status: user.establishment.status,
    });
  }

  if (user.establishment.status !== EstablishmentStatus.ACTIVE) {
    return status(402, {
      message: 'Pagamento necessário. Sua conta está pendente ou suspensa.',
      status: user.establishment.status,
    });
  }
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test tests/middlewares/auth.middleware.test.ts`
Expected: PASS. This will still fail to compile against the real Prisma enum until Step 8-10 add `DELETED` to the schema — if it errors on the enum value before that, complete those steps first, then return here.

- [ ] **Step 5: Write the failing test for the webhook guard**

`tests/payments/payments.webhook.test.ts` today has no test at all for `customer.subscription.deleted` (only signature-verification tests for `invoice.payment_succeeded`/`invoice.payment_failed`). Its `fakePrisma.establishment.findFirst` is hardcoded to always return `{ id: 'estab-1', status: EstablishmentStatus.ACTIVE }` — change it to read from a mutable variable so a test can control the establishment's starting status, mirroring how `processedPayments` is already reset in `beforeEach`:

```typescript
let establishmentStatus: EstablishmentStatus = EstablishmentStatus.ACTIVE;

const fakePrisma: any = {
  user: {
    findUnique: async ({ where }: any) => ({
      id: where.id,
      role: 'OWNER',
      establishmentId: 'estab-1',
      establishment: { status: EstablishmentStatus.ACTIVE },
    }),
  },
  establishment: {
    findFirst: async () => ({ id: 'estab-1', status: establishmentStatus }),
    update: async ({ data }: any) => {
      processedPayments += 1;
      if (data.status) establishmentStatus = data.status;
    },
  },
};
```

Then, inside `describe('Stripe webhook signature verification', ...)` (or a new sibling `describe` block in the same file — either is fine, just reset `establishmentStatus = EstablishmentStatus.ACTIVE` in `beforeEach` alongside the existing `processedPayments = 0`), add:

```typescript
it('não reverte um estabelecimento já DELETED de volta pra PENDING_PAYMENT', async () => {
  establishmentStatus = EstablishmentStatus.DELETED;
  const raw = JSON.stringify({
    id: 'evt_sub_deleted',
    object: 'event',
    type: 'customer.subscription.deleted',
    data: { object: { id: 'sub_test', customer: 'cus_test', current_period_end: Math.floor(Date.now() / 1000) } },
  });
  const signature = await stripeForTest.webhooks.generateTestHeaderStringAsync({ payload: raw, secret: process.env.STRIPE_PROD_WEBHOOK_SECRET! });

  const { response } = await send(raw, signature);

  expect(response.status).toBe(200);
  expect(processedPayments).toBe(0);
  expect(establishmentStatus).toBe(EstablishmentStatus.DELETED);
});

it('ainda seta PENDING_PAYMENT quando o estabelecimento não estava DELETED', async () => {
  establishmentStatus = EstablishmentStatus.ACTIVE;
  const raw = JSON.stringify({
    id: 'evt_sub_deleted_2',
    object: 'event',
    type: 'customer.subscription.deleted',
    data: { object: { id: 'sub_test_2', customer: 'cus_test', current_period_end: Math.floor(Date.now() / 1000) } },
  });
  const signature = await stripeForTest.webhooks.generateTestHeaderStringAsync({ payload: raw, secret: process.env.STRIPE_PROD_WEBHOOK_SECRET! });

  const { response } = await send(raw, signature);

  expect(response.status).toBe(200);
  expect(processedPayments).toBe(1);
  expect(establishmentStatus).toBe(EstablishmentStatus.PENDING_PAYMENT);
});
```

The second test is a regression guard proving the existing (correct) behavior for the non-`DELETED` case still holds after Step 7's change.

- [ ] **Step 6: Run test to verify it fails**

Run: `bun test tests/payments/payments.webhook.test.ts`
Expected: FAIL — handler still unconditionally sets `PENDING_PAYMENT`.

- [ ] **Step 7: Guard the webhook handler**

In `api/api-tozzo.uk/modules/payments/payments.controller.ts` (~line 183-200), replace:

```typescript
  } else if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;
    const stripeCustomerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
    console.log(`[WEBHOOK] Subscription Deleted. Customer: ${stripeCustomerId}, Subscription: ${subscription.id}`);
    if (stripeCustomerId) {
      const establishment = await prisma.establishment.findFirst({ where: { stripeCustomerId } });
      if (establishment) {
        const expiresAt = subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : new Date();
        await prisma.establishment.update({
          where: { id: establishment.id },
          data: { status: EstablishmentStatus.PENDING_PAYMENT, subscriptionExpiresAt: expiresAt },
        });
        console.log(`[WEBHOOK] Establishment ${establishment.id} set to PENDING_PAYMENT due to subscription deletion.`);
      } else {
        console.error(`[WEBHOOK] Establishment not found for Customer ID: ${stripeCustomerId}`);
      }
    }
  }
```

with:

```typescript
  } else if (event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;
    const stripeCustomerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;
    console.log(`[WEBHOOK] Subscription Deleted. Customer: ${stripeCustomerId}, Subscription: ${subscription.id}`);
    if (stripeCustomerId) {
      const establishment = await prisma.establishment.findFirst({ where: { stripeCustomerId } });
      if (establishment && establishment.status !== EstablishmentStatus.DELETED) {
        const expiresAt = subscription.current_period_end ? new Date(subscription.current_period_end * 1000) : new Date();
        await prisma.establishment.update({
          where: { id: establishment.id },
          data: { status: EstablishmentStatus.PENDING_PAYMENT, subscriptionExpiresAt: expiresAt },
        });
        console.log(`[WEBHOOK] Establishment ${establishment.id} set to PENDING_PAYMENT due to subscription deletion.`);
      } else if (!establishment) {
        console.error(`[WEBHOOK] Establishment not found for Customer ID: ${stripeCustomerId}`);
      } else {
        console.log(`[WEBHOOK] Establishment ${establishment.id} is already DELETED, ignoring subscription deletion status change.`);
      }
    }
  }
```

This closes a real race: the delete-account flow (Step 12) cancels the Stripe subscription, which fires this exact webhook — without this guard, it would silently flip `DELETED` back to `PENDING_PAYMENT` shortly after deletion.

- [ ] **Step 8: Run test to verify it passes**

Run: `bun test tests/payments/payments.webhook.test.ts`
Expected: PASS.

- [ ] **Step 9: Add the `DELETED` enum value**

In `api/api-tozzo.uk/prisma/schema.prisma` (~line 49-53):

```prisma
enum EstablishmentStatus {
  ACTIVE
  PENDING_PAYMENT
  SUSPENDED
  DELETED
}
```

- [ ] **Step 10: Generate and review the migration**

Run: `bunx prisma migrate dev --create-only --name add_establishment_deleted_status`

Open the generated `migration.sql` and confirm it is exactly one additive statement:

```sql
ALTER TYPE "EstablishmentStatus" ADD VALUE 'DELETED';
```

If anything else was generated, stop and reconcile before continuing.

- [ ] **Step 11: Test the migration in an ephemeral Postgres**

Follow the same harness style already used in this repo (see `tests/prisma/product-type-uuid.migration.test.ts`: spin up `postgres:16-alpine`, run `prisma migrate deploy`, assert before/after). Add a focused test that creates an `Establishment` before the migration, runs it, then confirms a row can be updated to `status: 'DELETED'` afterward.

Run: `bun test tests/prisma/` (or the new file)
Expected: PASS. If Docker is genuinely unavailable, run `docker ps` to confirm, note the environment limitation in the task report, and do not treat it as a code failure — but do not skip writing the test.

- [ ] **Step 12: Extend `auth.controller.test.ts`'s fixtures for the new endpoints**

`tests/auth/auth.controller.test.ts` already has `fakePrisma`, `state`, `seedEstablishment`, `seedUser`, `request()`, `tokenFor()` (see the file's top ~line 1-158). Extend `fakePrisma` in place (don't create a second one) to support the new calls:

```typescript
fakePrisma.establishment.findUnique = async ({ where }: any) => state.establishments.get(where.id) ?? null;
fakePrisma.user.findMany = async ({ where }: any) =>
  [...state.users.values()].filter((u) => u.establishmentId === where.establishmentId);
fakePrisma.product = { findMany: async () => [] };
fakePrisma.order = { findMany: async () => [] };
fakePrisma.sale = { findMany: async () => [] };
```

Extend the existing `$transaction` fake's `tx` object (same object literal at ~line 108-134) with `establishment.update` and `user`:

```typescript
      establishment: {
        create: async ({ data }: any) => { /* ...unchanged... */ },
        update: async ({ where, data }: any) => {
          const establishment = state.establishments.get(where.id)!;
          Object.assign(establishment, data);
          return establishment;
        },
      },
      user: {
        create: async ({ data }: any) => { /* ...unchanged... */ },
        findMany: async ({ where }: any) =>
          [...state.users.values()].filter((u) => u.establishmentId === where.establishmentId),
        update: async ({ where, data }: any) => {
          const user = userById(where.id)!;
          Object.assign(user, data);
          return user;
        },
      },
```

Add a `GET` request helper next to the existing `request()` (~line 142-152), which is POST-only:

```typescript
async function requestGet(path: string, headers: Record<string, string> = {}) {
  const response = await app.handle(new Request(`http://localhost${path}`, { headers }));
  const text = await response.text();
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { response, body: parsed };
}
```

Add a Stripe fake, mocked **before** `const { default: app } = await import('../../app')` (same ordering rule already followed for `mock.module('../../lib/prisma', ...)` at ~line 137-139 — a `mock.module` call only affects imports that happen afterward):

```typescript
const stripeState = {
  activeSubscriptions: [] as { id: string }[],
  canceledIds: [] as string[],
  shouldFailCancel: false,
};

mock.module('stripe', () => ({
  default: class FakeStripe {
    subscriptions = {
      list: async () => ({ data: stripeState.activeSubscriptions }),
      cancel: async (id: string) => {
        if (stripeState.shouldFailCancel) throw new Error('stripe cancel failed');
        stripeState.canceledIds.push(id);
        return {};
      },
    };
  },
}));
```

Place this new `mock.module('stripe', ...)` call right after the existing `mock.module('../../lib/prisma', ...)` line and before the `await import('../../app')` line, so both fakes are active before `auth.controller.ts` (which will import `Stripe` and construct its own client at module scope) gets loaded transitively through `app.ts`.

- [ ] **Step 13: Write the failing tests for `POST /auth/delete-account` and `GET /auth/export-data`**

Add new `describe` blocks in the same file, using `request()`/`requestGet()`/`tokenFor()` exactly like the existing `register`/`login` blocks do:

```typescript
describe('deleteAccount', () => {
  beforeEach(() => {
    resetState();
    stripeState.activeSubscriptions = [];
    stripeState.canceledIds = [];
    stripeState.shouldFailCancel = false;
  });

  it('rejeita quem não é OWNER', async () => {
    const employee = await seedUser({ role: UserRole.EMPLOYEE, plainPassword: 'senha123' });
    const { response, body } = await request('/auth/delete-account', { password: 'senha123' }, { authorization: `Bearer ${tokenFor(employee)}` });

    expect(response.status).toBe(403);
    expect(body.code).toBe('AUTH_DELETE_FORBIDDEN');
  });

  it('rejeita senha incorreta sem alterar nada', async () => {
    const owner = await seedUser({ role: UserRole.OWNER, plainPassword: 'senha-certa' });
    const { response, body } = await request('/auth/delete-account', { password: 'senha-errada' }, { authorization: `Bearer ${tokenFor(owner)}` });

    expect(response.status).toBe(401);
    expect(body.code).toBe('AUTH_INVALID_PASSWORD');
    expect(state.establishments.get(owner.establishmentId)?.status).toBe(EstablishmentStatus.ACTIVE);
  });

  it('anonimiza todo usuário do estabelecimento e marca DELETED numa transação', async () => {
    const establishment = seedEstablishment();
    const owner = await seedUser({ establishmentId: establishment.id, role: UserRole.OWNER, plainPassword: 'senha-certa', email: 'owner@test.com' });
    const employee = await seedUser({ establishmentId: establishment.id, role: UserRole.EMPLOYEE, plainPassword: 'x', email: 'employee@test.com' });

    const { response, body } = await request('/auth/delete-account', { password: 'senha-certa' }, { authorization: `Bearer ${tokenFor(owner)}` });

    expect(response.status).toBe(200);
    expect(state.establishments.get(establishment.id)?.status).toBe(EstablishmentStatus.DELETED);

    const updatedOwner = userById(owner.id)!;
    const updatedEmployee = userById(employee.id)!;
    expect(updatedOwner.email).not.toBe('owner@test.com');
    expect(updatedEmployee.email).not.toBe('employee@test.com');
    expect(updatedOwner.email).not.toBe(updatedEmployee.email);
    expect(updatedOwner.name).toBe('Usuário removido');
    expect(updatedEmployee.phone ?? null).toBeNull();
  });

  it('cancela assinaturas Stripe ativas quando stripeCustomerId existe', async () => {
    const establishment = seedEstablishment({ stripeCustomerId: 'cus_123' });
    const owner = await seedUser({ establishmentId: establishment.id, role: UserRole.OWNER, plainPassword: 'senha-certa' });
    stripeState.activeSubscriptions = [{ id: 'sub_1' }, { id: 'sub_2' }];

    const { response } = await request('/auth/delete-account', { password: 'senha-certa' }, { authorization: `Bearer ${tokenFor(owner)}` });

    expect(response.status).toBe(200);
    expect(stripeState.canceledIds.sort()).toEqual(['sub_1', 'sub_2']);
  });

  it('aborta sem tocar o banco se o cancelamento no Stripe falhar', async () => {
    const establishment = seedEstablishment({ stripeCustomerId: 'cus_123' });
    const owner = await seedUser({ establishmentId: establishment.id, role: UserRole.OWNER, plainPassword: 'senha-certa' });
    stripeState.activeSubscriptions = [{ id: 'sub_1' }];
    stripeState.shouldFailCancel = true;

    const { response, body } = await request('/auth/delete-account', { password: 'senha-certa' }, { authorization: `Bearer ${tokenFor(owner)}` });

    expect(response.status).toBe(502);
    expect(body.code).toBe('STRIPE_CANCELLATION_FAILED');
    expect(state.establishments.get(establishment.id)?.status).toBe(EstablishmentStatus.ACTIVE);
  });
});

describe('exportData', () => {
  beforeEach(resetState);

  it('rejeita quem não é OWNER', async () => {
    const employee = await seedUser({ role: UserRole.EMPLOYEE, plainPassword: 'senha123' });
    const { response, body } = await requestGet('/auth/export-data', { authorization: `Bearer ${tokenFor(employee)}` });

    expect(response.status).toBe(403);
    expect(body.code).toBe('AUTH_EXPORT_FORBIDDEN');
  });

  it('retorna o dado do tenant sem passwordHash', async () => {
    const owner = await seedUser({ role: UserRole.OWNER, plainPassword: 'senha123' });
    const { response, body } = await requestGet('/auth/export-data', { authorization: `Bearer ${tokenFor(owner)}` });

    expect(response.status).toBe(200);
    expect(body.establishment).toBeDefined();
    expect(body.users.every((u: any) => !('passwordHash' in u))).toBe(true);
  });
});
```

- [ ] **Step 14: Run tests to verify they fail**

Run: `bun test tests/auth/auth.controller.test.ts`
Expected: FAIL — both routes 404 (not wired yet) or the request helper throws on an unrecognized path, since neither `deleteAccount`/`exportData` exist nor are they mounted.

- [ ] **Step 15: Implement `deleteAccount`, `exportData`, and wire both routes**

Add the two new imports at the top of `api/api-tozzo.uk/modules/auth/auth.controller.ts` (`normalizeUserRole`/`UserRole` are already imported per line 7 of the existing file — don't duplicate them):

```typescript
import Stripe from 'stripe';
import { EstablishmentStatus } from '@prisma/client';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-07-30.basil' as any,
});
```

(Mirror the exact `apiVersion` string already used in `modules/payments/payments.controller.ts:8-10` so both Stripe clients stay in sync.)

Add near the other exports, after `login`:

```typescript
export const deleteAccount = async (
  { user, body, set }: { user: ElysiaAuthUser; body: { password?: unknown }; set: HandlerSet },
): Promise<unknown> => {
  try {
    if (normalizeUserRole(user.role) !== UserRole.OWNER) {
      return errorResponse(set, 403, 'AUTH_DELETE_FORBIDDEN', 'Only the establishment owner can delete the account.');
    }

    const password = typeof body.password === 'string' ? body.password : '';
    const owner = await prisma.user.findUnique({ where: { id: user.id } });
    if (!owner) {
      return errorResponse(set, 404, 'AUTH_USER_NOT_FOUND', 'User not found.');
    }

    const isMatch = await bcrypt.compare(password, owner.passwordHash);
    if (!isMatch) {
      return errorResponse(set, 401, 'AUTH_INVALID_PASSWORD', 'Incorrect password.');
    }

    const establishment = await prisma.establishment.findUnique({ where: { id: user.establishmentId } });
    if (!establishment) {
      return errorResponse(set, 404, 'ESTABLISHMENT_NOT_FOUND', 'Establishment not found.');
    }

    if (establishment.stripeCustomerId) {
      try {
        const subscriptions = await stripe.subscriptions.list({
          customer: establishment.stripeCustomerId,
          status: 'active',
        });
        await Promise.all(subscriptions.data.map((subscription) => stripe.subscriptions.cancel(subscription.id)));
      } catch (stripeError) {
        console.error('[AUTH] Failed to cancel Stripe subscription during account deletion:', stripeError);
        return errorResponse(set, 502, 'STRIPE_CANCELLATION_FAILED', 'Could not cancel the active subscription. Please try again.');
      }
    }

    const anonymizedPasswordHash = await bcrypt.hash(crypto.randomUUID(), 10);

    await prisma.$transaction(async (tx) => {
      await tx.establishment.update({
        where: { id: establishment.id },
        data: { status: EstablishmentStatus.DELETED },
      });

      const members = await tx.user.findMany({ where: { establishmentId: establishment.id } });
      await Promise.all(members.map((member: { id: string }) =>
        tx.user.update({
          where: { id: member.id },
          data: {
            name: 'Usuário removido',
            email: `deleted-${crypto.randomUUID()}@tozzo.uk`,
            phone: null,
            passwordHash: anonymizedPasswordHash,
          },
        })
      ));
    });

    console.log('[AUTH] Account deleted for establishment:', establishment.id);
    return { message: 'Account deleted successfully.' };
  } catch (error) {
    console.error('[AUTH] Delete account error:', error);
    return errorResponse(set, 500, 'AUTH_INTERNAL_ERROR', 'Internal server error.');
  }
};

export const exportData = async (
  { user, set }: { user: ElysiaAuthUser; set: HandlerSet },
): Promise<unknown> => {
  try {
    if (normalizeUserRole(user.role) !== UserRole.OWNER) {
      return errorResponse(set, 403, 'AUTH_EXPORT_FORBIDDEN', 'Only the establishment owner can export data.');
    }

    const establishmentId = user.establishmentId;
    const [establishment, users, products, orders, sales] = await Promise.all([
      prisma.establishment.findUnique({ where: { id: establishmentId } }),
      prisma.user.findMany({
        where: { establishmentId },
        select: { id: true, name: true, email: true, phone: true, role: true, createdAt: true },
      }),
      prisma.product.findMany({ where: { establishmentId } }),
      prisma.order.findMany({ where: { establishmentId }, include: { items: true } }),
      prisma.sale.findMany({ where: { establishmentId }, include: { items: true } }),
    ]);

    return { establishment, users, products, orders, sales };
  } catch (error) {
    console.error('[AUTH] Export data error:', error);
    return errorResponse(set, 500, 'AUTH_INTERNAL_ERROR', 'Internal server error.');
  }
};
```

`items` is the correct relation name on both `Order` and `Sale` (confirmed in `prisma/schema.prisma`: `Order.items OrderItem[]`, `Sale.items SaleItem[]`) — use it as written above.

In `api/api-tozzo.uk/modules/auth/auth.routes.ts`, import the two new handlers and add them to the existing `protectedRoutes` group (~line 31-40, same group `/sse-token` already uses — `authContext` only, no `activeGuard`, since an owner should be able to delete/export even from a `PENDING_PAYMENT`/`SUSPENDED` establishment):

```typescript
import { register, login, issueSseToken, deleteAccount, exportData } from './auth.controller';
```

```typescript
const protectedRoutes = new Elysia()
  .use(authContext)
  .post('/sse-token', issueSseToken, {
    detail: {
      summary: 'Emite token de curta duração para o stream de eventos',
      tags: ['Auth'],
      security: [{ bearerAuth: [] }],
    },
    response: t.Any(),
  })
  .post('/delete-account', deleteAccount, {
    body: t.Object({ password: t.String() }),
    response: t.Any(),
    detail: { summary: 'Exclui a conta (estabelecimento) do dono autenticado', tags: ['Auth'], security: [{ bearerAuth: [] }] },
  })
  .get('/export-data', exportData, {
    response: t.Any(),
    detail: { summary: 'Exporta os dados do estabelecimento do dono autenticado', tags: ['Auth'], security: [{ bearerAuth: [] }] },
  });
```

- [ ] **Step 16: Run tests to verify they pass**

Run: `bun test tests/auth/auth.controller.test.ts`
Expected: PASS.

- [ ] **Step 17: Full validation**

Run:
```bash
bunx prisma generate
bun test --isolate --parallel
bunx tsc --noEmit
```
Expected: all exit 0.

- [ ] **Step 18: Commit**

```bash
git add prisma/schema.prisma prisma/migrations modules/auth/auth.controller.ts modules/auth/auth.routes.ts middlewares/elysiaAuth.ts modules/payments/payments.controller.ts tests/auth/auth.controller.test.ts tests/middlewares/auth.middleware.test.ts tests/payments/payments.webhook.test.ts tests/prisma
git commit -m "feat(auth): add self-service account deletion and data export"
```

---

## Task 2: Front — Settings page export/delete section

**Files:**
- Modify: `front/front-tozzo.uk/src/pages/dashboard/SettingsPage.tsx` (insert before the "more coming soon" placeholder, ~line 325-327)
- Modify: `front/front-tozzo.uk/src/i18n/locales/{en,pt-BR,es,fr,zh,hi}.json` (`settings` namespace: new keys)
- Modify: `front/front-tozzo.uk/src/i18n/error-keys.ts` (new error context for delete-account failures)
- Test: `front/front-tozzo.uk/src/pages/dashboard/SettingsPage.test.tsx` (extend the existing file)

**Interfaces:**
- Consumes: `POST /auth/delete-account` and `GET /auth/export-data` from Task 1 (this task's tests mock `api.post`/`api.get`, so it does not need Task 1 merged first — just the agreed request/response shape from the spec).
- Produces: nothing consumed by another task in this plan (this is the last task).

### Step-by-step

- [ ] **Step 1: Add the new i18n keys to `en.json`, `settings` namespace**

```json
"dataPrivacy": {
  "sectionTitle": "Data and privacy",
  "sectionDescription": "Export your establishment's data or permanently delete your account.",
  "exportButton": "Export my data",
  "exportSuccess": "Data exported.",
  "exportError": "Could not export your data. Try again.",
  "deleteButton": "Delete my account",
  "deleteDialogTitle": "Delete account",
  "deleteDialogDescription": "This permanently deletes your establishment and anonymizes every linked user's personal data. This cannot be undone. Enter your password to confirm.",
  "deletePasswordLabel": "Current password",
  "deleteConfirmButton": "Delete permanently",
  "deleteCancelButton": "Cancel",
  "deleteSuccess": "Account deleted. Signing out...",
  "deleteWrongPassword": "Incorrect password."
}
```

Add the same key structure, translated, to `pt-BR.json`:

```json
"dataPrivacy": {
  "sectionTitle": "Dados e privacidade",
  "sectionDescription": "Exporte os dados do seu estabelecimento ou exclua sua conta permanentemente.",
  "exportButton": "Exportar meus dados",
  "exportSuccess": "Dados exportados.",
  "exportError": "Não foi possível exportar seus dados. Tente novamente.",
  "deleteButton": "Excluir minha conta",
  "deleteDialogTitle": "Excluir conta",
  "deleteDialogDescription": "Isso exclui permanentemente seu estabelecimento e anonimiza o dado pessoal de todos os usuários vinculados. Não pode ser desfeito. Digite sua senha pra confirmar.",
  "deletePasswordLabel": "Senha atual",
  "deleteConfirmButton": "Excluir permanentemente",
  "deleteCancelButton": "Cancelar",
  "deleteSuccess": "Conta excluída. Saindo...",
  "deleteWrongPassword": "Senha incorreta."
}
```

For `es.json`, `fr.json`, `zh.json`, `hi.json`: translate the same 12 keys faithfully, matching the tone of the existing `settings` namespace strings already in each file. No `{{}}` placeholders are used here, so none should appear in the translations.

- [ ] **Step 2: Write the failing tests**

Open `front/front-tozzo.uk/src/pages/dashboard/SettingsPage.test.tsx` and add to the existing `describe('SettingsPage', ...)` block, following the file's established `mockUseAuth`/`authValue`/`renderWithProviders` helpers already defined there:

```typescript
it('shows the data/privacy section only for OWNER', () => {
  mockUseAuth.mockReturnValue(authValue('MANAGER'))
  renderWithProviders()
  expect(screen.queryByRole('heading', { name: 'Data and privacy' })).not.toBeInTheDocument()

  mockUseAuth.mockReturnValue(authValue('OWNER'))
  renderWithProviders()
  expect(screen.getByRole('heading', { name: 'Data and privacy' })).toBeInTheDocument()
})

it('exports data by downloading a JSON blob', async () => {
  const user = userEvent.setup()
  mockUseAuth.mockReturnValue(authValue('OWNER'))
  const getMock = vi.fn().mockResolvedValue({ data: { establishment: { id: 42 }, users: [], products: [], orders: [], sales: [] } })
  const restoreGet = replaceProperty(api, 'get', getMock as typeof api.get)

  try {
    renderWithProviders()
    await user.click(screen.getByRole('button', { name: 'Export my data' }))
    await waitFor(() => expect(getMock).toHaveBeenCalledWith('/auth/export-data'))
  } finally {
    restoreGet()
  }
})

it('requires the password and calls delete-account on confirm', async () => {
  const user = userEvent.setup()
  mockUseAuth.mockReturnValue(authValue('OWNER'))
  const postMock = vi.fn().mockResolvedValue({ data: { message: 'ok' } })
  const restorePost = replaceProperty(api, 'post', postMock as typeof api.post)

  try {
    renderWithProviders()
    await user.click(screen.getByRole('button', { name: 'Delete my account' }))

    const confirmButton = screen.getByRole('button', { name: 'Delete permanently' })
    expect(confirmButton).toBeDisabled()

    await user.type(screen.getByLabelText('Current password'), 'senha123')
    expect(confirmButton).not.toBeDisabled()

    await user.click(confirmButton)
    await waitFor(() => expect(postMock).toHaveBeenCalledWith('/auth/delete-account', { password: 'senha123' }))
  } finally {
    restorePost()
  }
})
```

Import `waitFor` at the top if not already imported in this file (check first — it likely already is, given other `await waitFor(...)` calls in the existing tests).

- [ ] **Step 3: Run tests to verify they fail**

Run: `bun test src/pages/dashboard/SettingsPage.test.tsx`
Expected: FAIL — no such section/buttons exist yet.

- [ ] **Step 4: Implement the section in `SettingsPage.tsx`**

Add these imports at the top of `SettingsPage.tsx` (alongside the existing ones, ~line 1-28):

```typescript
import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
```

(`useState` may already be imported from `"react"` at line 28 — merge into the existing import instead of duplicating it.)

Add state and handlers inside the `SettingsPage` component, near the other handlers:

```typescript
const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
const [deletePassword, setDeletePassword] = useState("")
const [isDeleting, setIsDeleting] = useState(false)
const { logout } = useAuth()

const handleExportData = async () => {
  try {
    const response = await api.get("/auth/export-data")
    const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: "application/json" })
    const link = document.createElement("a")
    link.href = window.URL.createObjectURL(blob)
    link.download = "tozzo-export.json"
    document.body.appendChild(link)
    link.click()
    link.remove()
    toast.success(t("dataPrivacy.exportSuccess"))
  } catch (error) {
    console.error("Export failed", error)
    toast.error(t("dataPrivacy.exportError"))
  }
}

const handleDeleteAccount = async () => {
  setIsDeleting(true)
  try {
    await api.post("/auth/delete-account", { password: deletePassword })
    toast.success(t("dataPrivacy.deleteSuccess"))
    setIsDeleteDialogOpen(false)
    logout()
  } catch (error) {
    console.error("Delete account failed", error)
    toast.error(t("dataPrivacy.deleteWrongPassword"))
  } finally {
    setIsDeleting(false)
  }
}
```

(`useAuth()` is likely already called once near the top of the component for `user` — check first and add `logout` to that existing destructure instead of calling `useAuth()` a second time.)

Insert the new section right before the "more coming soon" placeholder (~line 325-327):

```tsx
{isOwner && (
  <div className="space-y-4 border-t pt-4">
    <div>
      <h3 className="font-semibold">{t('dataPrivacy.sectionTitle')}</h3>
      <p className="text-sm text-muted-foreground">{t('dataPrivacy.sectionDescription')}</p>
    </div>
    <div className="flex gap-3">
      <Button type="button" variant="outline" onClick={handleExportData}>
        {t('dataPrivacy.exportButton')}
      </Button>
      <Button type="button" variant="destructive" onClick={() => setIsDeleteDialogOpen(true)}>
        {t('dataPrivacy.deleteButton')}
      </Button>
    </div>
  </div>
)}

<Dialog open={isDeleteDialogOpen} onOpenChange={(open) => { if (!open) { setIsDeleteDialogOpen(false); setDeletePassword("") } }}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>{t('dataPrivacy.deleteDialogTitle')}</DialogTitle>
      <DialogDescription>{t('dataPrivacy.deleteDialogDescription')}</DialogDescription>
    </DialogHeader>
    <div className="space-y-2">
      <label htmlFor="delete-account-password" className="text-sm text-muted-foreground">
        {t('dataPrivacy.deletePasswordLabel')}
      </label>
      <Input
        id="delete-account-password"
        type="password"
        value={deletePassword}
        onChange={(event) => setDeletePassword(event.target.value)}
      />
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
        {t('dataPrivacy.deleteCancelButton')}
      </Button>
      <Button
        variant="destructive"
        disabled={deletePassword.length === 0 || isDeleting}
        onClick={handleDeleteAccount}
      >
        {t('dataPrivacy.deleteConfirmButton')}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

This section is a **dedicated `Dialog`**, not the shared `ConfirmContext`/`useConfirm` — `ConfirmContext` (see `src/contexts/ConfirmContext.tsx`) only supports a yes/no description, it has no field for a password input. Reusing the same `@/components/ui/dialog` primitives `ConfirmContext` itself is built on keeps the visual style consistent without modifying that shared component.

- [ ] **Step 5: Run tests to verify they pass**

Run: `bun test src/pages/dashboard/SettingsPage.test.tsx`
Expected: PASS.

- [ ] **Step 6: Full validation**

Run:
```bash
bun test
bun run scripts/check-i18n.mjs
bun run build
bunx tsc --noEmit
```
Expected: all exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/pages/dashboard/SettingsPage.tsx src/pages/dashboard/SettingsPage.test.tsx src/i18n/locales src/i18n/error-keys.ts
git commit -m "feat(settings): add self-service data export and account deletion"
```

---

## Self-Review Notes (for the controller, not a task)

- Spec coverage: `DELETED` enum value + anonymization + Stripe cancellation + transaction (Task 1) ✅; `activeGuard` distinguishing `DELETED` ✅; webhook race guard (found during plan-writing, not in the original spec text, but required for the spec's own stated goal of "não continuar cobrando" to actually hold) ✅; export endpoint (Task 1) ✅; front export/delete UI, OWNER-only, password-gated (Task 2) ✅; mobile untouched ✅; `DELETE /users/:id` untouched ✅.
- Task 1 and Task 2 are independent (front tests mock the api) — can run in parallel, but Task 2's dedicated-`Dialog` approach (not `ConfirmContext`) was decided during plan-writing since the spec's wording ("reaproveita ConfirmContext") undersold the actual UI need (a password field); the user-visible behavior described in the spec (modal + password + confirm/cancel) is unchanged.
- Known open item, not part of this plan: Bloco 3 (segurança básica) of the same LGPD sub-part still needs its own brainstorm/spec.
