# Watermark por tabela + gate de reload nas listas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evitar que as telas de lista do app (`produtos.tsx`/`index.tsx`/`pedidos.tsx`/`historico.tsx`) rodem a query completa e piscem loading state toda vez que uma sync termina ou a aba ganha foco, quando a tabela que aquela tela mostra não mudou de verdade.

**Architecture:** Módulo singleton em memória (`database/tableWatermark.ts`, mesmo padrão do `syncGuard.ts` já existente) guarda um timestamp epoch ms de "última mudança" por tabela (`produtos`/`pedidos`/`vendas`). Toda função de escrita local (create/update/remove/createFromSync nos 3 hooks de DB) e todo bloco de upsert do pull da sincronização (`useSyncDatabase.ts`) marca a tabela correspondente. Um hook (`hooks/useShouldReload.ts`) guarda, por tela, o último timestamp visto de cada tabela observada (via `useRef`, não `state`) e decide se vale a pena rodar o `load()`/`list()`/`fetchVendas()` de novo.

**Tech Stack:** TypeScript, React Native/Expo, `expo-sqlite`, Jest + `react-test-renderer` (harness pattern já usado em `hooks/__tests__/useSyncRefresh.test.tsx` e `database/__tests__/useProductDatabase.test.tsx`).

## Global Constraints

- Timestamps sempre epoch ms — nunca ISO string (padrão do projeto inteiro).
- Testes rodam com `npx jest --watchAll=false` — o script `"test": "jest --watchAll"` do `package.json` trava para sempre non-interactive, não usar.
- `tsc --noEmit` precisa ficar limpo depois de cada task.
- Seguir o padrão de mock já estabelecido nos testes existentes: `jest.mock('expo-sqlite', () => ({ useSQLiteContext: jest.fn() }))` + harness `TestRenderer.create(<Harness />)` dentro de `act()` (ver `database/__tests__/useProductDatabase.test.tsx` e `hooks/__tests__/useSyncRefresh.test.tsx`).
- Validação final é manual no emulador Android (`npx expo run:android`) — `expo start` sozinho não é suficiente pra dar como concluído (não pega problema de build nativo, e aqui nem é relevante já que a mudança é só JS, mas é o padrão do projeto pra qualquer merge).
- Spec completa: `docs/superpowers/specs/2026-08-10-table-watermark-render-gate-mobile-design.md`.

---

### Task 1: `database/tableWatermark.ts` — módulo de watermark por tabela

**Files:**
- Create: `database/tableWatermark.ts`
- Test: `database/__tests__/tableWatermark.test.ts`

**Interfaces:**
- Produces: `export type Table = 'produtos' | 'pedidos' | 'vendas'`; `export function markChanged(table: Table): void`; `export function getChangedAt(table: Table): number`.

- [ ] **Step 1: Write the failing test**

```ts
// database/__tests__/tableWatermark.test.ts
import { markChanged, getChangedAt } from '../tableWatermark';

describe('tableWatermark', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('getChangedAt returns a stable number until markChanged is called', () => {
    const before = getChangedAt('pedidos');
    const after = getChangedAt('pedidos');
    expect(after).toBe(before);
  });

  it('markChanged strictly increases the watermark for that table', () => {
    const before = getChangedAt('produtos');
    markChanged('produtos');
    const after = getChangedAt('produtos');
    expect(after).toBeGreaterThan(before);
  });

  it('markChanged only affects the table it was called for', () => {
    const beforeVendas = getChangedAt('vendas');
    const beforePedidos = getChangedAt('pedidos');
    markChanged('vendas');
    expect(getChangedAt('vendas')).toBeGreaterThan(beforeVendas);
    expect(getChangedAt('pedidos')).toBe(beforePedidos);
  });

  it('stays strictly increasing even when Date.now() does not advance between calls', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const before = getChangedAt('produtos');
    markChanged('produtos');
    const first = getChangedAt('produtos');
    markChanged('produtos'); // Date.now() still mocked to the same value
    const second = getChangedAt('produtos');

    expect(first).toBeGreaterThan(before);
    expect(second).toBeGreaterThan(first);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest database/__tests__/tableWatermark.test.ts --watchAll=false`
Expected: FAIL with "Cannot find module '../tableWatermark'".

- [ ] **Step 3: Write minimal implementation**

```ts
// database/tableWatermark.ts
export type Table = 'produtos' | 'pedidos' | 'vendas';

const changedAt: Record<Table, number> = {
  produtos: 0,
  pedidos: 0,
  vendas: 0,
};

/**
 * Math.max(Date.now(), changedAt[table] + 1) garante estritamente crescente
 * mesmo se duas mudancas da mesma tabela carem no mesmo milissegundo.
 */
export function markChanged(table: Table): void {
  changedAt[table] = Math.max(Date.now(), changedAt[table] + 1);
}

export function getChangedAt(table: Table): number {
  return changedAt[table];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest database/__tests__/tableWatermark.test.ts --watchAll=false`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add database/tableWatermark.ts database/__tests__/tableWatermark.test.ts
git commit -m "feat(mobile): add per-table change watermark module"
```

---

### Task 2: `hooks/useShouldReload.ts` — gate de reload por tela

**Files:**
- Create: `hooks/useShouldReload.ts`
- Test: `hooks/__tests__/useShouldReload.test.tsx`

**Interfaces:**
- Consumes: `getChangedAt(table: Table): number` e `type Table` de `@/database/tableWatermark` (Task 1).
- Produces: `export function useShouldReload(tables: Table[]): () => boolean` — a função retornada, quando chamada, compara o `changedAt` atual de cada tabela observada contra o último visto; se qualquer uma mudou (ou é a 1ª chamada), atualiza o "visto" e retorna `true`; senão retorna `false`.

- [ ] **Step 1: Write the failing test**

```tsx
// hooks/__tests__/useShouldReload.test.tsx
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('@/database/tableWatermark', () => ({
  getChangedAt: jest.fn(),
}));

import { getChangedAt } from '@/database/tableWatermark';
import { useShouldReload } from '../useShouldReload';

const mockGetChangedAt = getChangedAt as jest.Mock;

function renderShouldReloadHook(tables: Array<'produtos' | 'pedidos' | 'vendas'>) {
  let result!: ReturnType<typeof useShouldReload>;
  function Harness() {
    result = useShouldReload(tables);
    return null;
  }
  act(() => {
    TestRenderer.create(<Harness />);
  });
  return {
    get current() {
      return result;
    },
  };
}

describe('useShouldReload', () => {
  beforeEach(() => {
    mockGetChangedAt.mockReset();
  });

  it('returns true on the very first call, even with no changes', () => {
    mockGetChangedAt.mockReturnValue(0);
    const hook = renderShouldReloadHook(['produtos']);

    expect(hook.current()).toBe(true);
  });

  it('returns false on a second call when nothing changed since the first', () => {
    mockGetChangedAt.mockReturnValue(100);
    const hook = renderShouldReloadHook(['produtos']);

    expect(hook.current()).toBe(true);
    expect(hook.current()).toBe(false);
  });

  it('returns true again once the watched table changes', () => {
    mockGetChangedAt.mockReturnValue(100);
    const hook = renderShouldReloadHook(['produtos']);
    expect(hook.current()).toBe(true);
    expect(hook.current()).toBe(false);

    mockGetChangedAt.mockReturnValue(200);
    expect(hook.current()).toBe(true);
  });

  it('reacts if ANY of the watched tables changed, even if others stayed the same', () => {
    const values: Record<string, number> = { pedidos: 10, produtos: 50 };
    mockGetChangedAt.mockImplementation((table: string) => values[table]);
    const hook = renderShouldReloadHook(['pedidos', 'produtos']);
    expect(hook.current()).toBe(true);
    expect(hook.current()).toBe(false);

    values.produtos = 51; // só produtos mudou
    expect(hook.current()).toBe(true);
    expect(hook.current()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest hooks/__tests__/useShouldReload.test.tsx --watchAll=false`
Expected: FAIL with "Cannot find module '../useShouldReload'".

- [ ] **Step 3: Write minimal implementation**

```ts
// hooks/useShouldReload.ts
import { useRef } from 'react';
import { getChangedAt, type Table } from '@/database/tableWatermark';

export function useShouldReload(tables: Table[]): () => boolean {
  const seenRef = useRef<Partial<Record<Table, number>> | null>(null);

  return function shouldReload(): boolean {
    let changed = seenRef.current === null;
    const current: Partial<Record<Table, number>> = {};

    for (const table of tables) {
      const value = getChangedAt(table);
      current[table] = value;
      if (seenRef.current && seenRef.current[table] !== value) {
        changed = true;
      }
    }

    if (changed) {
      seenRef.current = current;
    }

    return changed;
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest hooks/__tests__/useShouldReload.test.tsx --watchAll=false`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add hooks/useShouldReload.ts hooks/__tests__/useShouldReload.test.tsx
git commit -m "feat(mobile): add useShouldReload gate hook"
```

---

### Task 3: wire `database/useProductDatabase.ts`

**Files:**
- Modify: `database/useProductDatabase.ts:1-3` (import), `:8-34` (`create`), `:36-59` (`createFromSync`), `:81-101` (`update`), `:103-113` (`remove`)
- Test: Modify `database/__tests__/useProductDatabase.test.tsx`

**Interfaces:**
- Consumes: `markChanged('produtos')` de `./tableWatermark` (Task 1).

- [ ] **Step 1: Write the failing tests**

Add to the top of `database/__tests__/useProductDatabase.test.tsx` (right after the existing `jest.mock` calls, before the `import { useSQLiteContext } ...` line):

```ts
jest.mock('../tableWatermark', () => ({
  markChanged: jest.fn(),
}));
```

Add this import alongside the existing ones:

```ts
import { markChanged } from '../tableWatermark';
```

Add this line after `const mockUseSQLiteContext = useSQLiteContext as jest.Mock;`:

```ts
const mockMarkChanged = markChanged as jest.Mock;
```

Add `mockMarkChanged.mockReset();` inside the existing `beforeEach`. Then add these 4 new `it` blocks inside the `describe('useProductDatabase', ...)` block, after the existing tests:

```ts
  it('create() marks produtos changed', async () => {
    const statement = makeStatement();
    const db = { prepareAsync: jest.fn(async () => statement) };
    mockUseSQLiteContext.mockReturnValue(db);

    const { create } = renderProductDbHook();
    await create({ nome: 'X-Salada', preco: 25.5, tipoProdutoId: 1 } as any);

    expect(mockMarkChanged).toHaveBeenCalledWith('produtos');
  });

  it('createFromSync() marks produtos changed', async () => {
    const statement = makeStatement();
    const db = { prepareAsync: jest.fn(async () => statement) };
    mockUseSQLiteContext.mockReturnValue(db);

    const { createFromSync } = renderProductDbHook();
    await createFromSync({ id: 'p1', nome: 'X-Salada', preco: 25.5, tipoProdutoId: 1 } as any);

    expect(mockMarkChanged).toHaveBeenCalledWith('produtos');
  });

  it('update() marks produtos changed', async () => {
    const statement = makeStatement();
    const db = { prepareAsync: jest.fn(async () => statement) };
    mockUseSQLiteContext.mockReturnValue(db);

    const { update } = renderProductDbHook();
    await update({ id: 'p1', nome: 'X-Salada', preco: 30, tipoProdutoId: 1 } as any);

    expect(mockMarkChanged).toHaveBeenCalledWith('produtos');
  });

  it('remove() marks produtos changed', async () => {
    const db = { runAsync: jest.fn(async () => ({})) };
    mockUseSQLiteContext.mockReturnValue(db);

    const { remove } = renderProductDbHook();
    await remove('p1');

    expect(mockMarkChanged).toHaveBeenCalledWith('produtos');
  });
```

- [ ] **Step 2: Run tests to verify the 4 new ones fail**

Run: `npx jest database/__tests__/useProductDatabase.test.tsx --watchAll=false`
Expected: the 4 new tests FAIL (`mockMarkChanged` never called), the pre-existing tests still PASS.

- [ ] **Step 3: Wire `markChanged` into the implementation**

In `database/useProductDatabase.ts`, add the import at the top (after the existing 3 imports):

```ts
import { markChanged } from "./tableWatermark"
```

In `create()`, right before `return { id }`:

```ts
      console.log('[db] produto criado', { id })

      markChanged('produtos')

      return { id }
```

In `createFromSync()`, right before `return { id: data.id }`:

```ts
      markChanged('produtos')

      return { id: data.id }
```

In `update()`, right after the `executeAsync` call closes (still inside the `try`, before `catch`):

```ts
      await statement.executeAsync({
        $id: data.id,
        $nome: data.nome,
        $preco: data.preco,
        $tipoProdutoId: data.tipoProdutoId,
        $ingredientes: data.ingredientes ?? null,
        $updated_at: Date.now(),
        $sync_status: 'pending',
      })

      markChanged('produtos')
    } catch (error) {
```

In `remove()`, right after the `runAsync` call (still inside the `try`, before `catch`):

```ts
      await database.runAsync(
        'UPDATE TB_PRODUTOS SET deleted_at = ?, updated_at = ?, sync_status = ? WHERE id = ?',
        [now, now, 'pending', id]
      );

      markChanged('produtos')
    } catch (error) {
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest database/__tests__/useProductDatabase.test.tsx --watchAll=false`
Expected: PASS (all tests, old and new).

- [ ] **Step 5: Commit**

```bash
git add database/useProductDatabase.ts database/__tests__/useProductDatabase.test.tsx
git commit -m "feat(mobile): mark produtos table changed on local writes"
```

---

### Task 4: wire `database/usePedidoDatabase.ts`

**Files:**
- Modify: `database/usePedidoDatabase.ts:1-3` (import), `:36-84` (`createPedido`), `:86-122` (`createFromSync`), `:144-247` (`updatePedido`), `:249-263` (`removePedido`)
- Test: Create `database/__tests__/usePedidoDatabase.test.tsx`

**Interfaces:**
- Consumes: `markChanged('pedidos')` de `./tableWatermark` (Task 1).

- [ ] **Step 1: Write the failing test**

```tsx
// database/__tests__/usePedidoDatabase.test.tsx
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('expo-sqlite', () => ({
  useSQLiteContext: jest.fn(),
}));

jest.mock('../utils/uuid', () => ({
  generateUUID: jest.fn(() => 'generated-uuid'),
}));

jest.mock('../tableWatermark', () => ({
  markChanged: jest.fn(),
}));

import { useSQLiteContext } from 'expo-sqlite';
import { markChanged } from '../tableWatermark';
import { usePedidosDatabase } from '../usePedidoDatabase';
import { STATUS_PEDIDO } from '../types/Pedido';

const mockUseSQLiteContext = useSQLiteContext as jest.Mock;
const mockMarkChanged = markChanged as jest.Mock;

function makeStatement() {
  return {
    executeAsync: jest.fn(async () => ({})),
    finalizeAsync: jest.fn(async () => {}),
  };
}

function renderPedidosDbHook() {
  let result!: ReturnType<typeof usePedidosDatabase>;
  function Harness() {
    result = usePedidosDatabase();
    return null;
  }
  act(() => {
    TestRenderer.create(<Harness />);
  });
  return result;
}

describe('usePedidosDatabase — table watermark', () => {
  beforeEach(() => {
    mockMarkChanged.mockReset();
  });

  it('createPedido() marks pedidos changed', async () => {
    const db = {
      prepareAsync: jest.fn(async () => makeStatement()),
      getFirstAsync: jest.fn(async () => ({ preco: 10 })),
    };
    mockUseSQLiteContext.mockReturnValue(db);

    const { createPedido } = renderPedidosDbHook();
    await createPedido([{ produtoId: 'p1', quantidade: 2 }], 'Cliente X');

    expect(mockMarkChanged).toHaveBeenCalledWith('pedidos');
  });

  it('createFromSync() marks pedidos changed', async () => {
    const db = { prepareAsync: jest.fn(async () => makeStatement()) };
    mockUseSQLiteContext.mockReturnValue(db);

    const { createFromSync } = renderPedidosDbHook();
    await createFromSync({
      id: 'ped-1',
      total: 10,
      horario: new Date().toISOString(),
      status: STATUS_PEDIDO.ABERTO,
    } as any);

    expect(mockMarkChanged).toHaveBeenCalledWith('pedidos');
  });

  it('updatePedido() marks pedidos changed', async () => {
    const db = {
      prepareAsync: jest.fn(async () => makeStatement()),
      getAllAsync: jest.fn(async () => []),
      getFirstAsync: jest.fn(async () => ({ preco: 10 })),
    };
    mockUseSQLiteContext.mockReturnValue(db);

    const { updatePedido } = renderPedidosDbHook();
    await updatePedido('ped-1', undefined, 'Novo Cliente');

    expect(mockMarkChanged).toHaveBeenCalledWith('pedidos');
  });

  it('removePedido() marks pedidos changed', async () => {
    const db = { prepareAsync: jest.fn(async () => makeStatement()) };
    mockUseSQLiteContext.mockReturnValue(db);

    const { removePedido } = renderPedidosDbHook();
    await removePedido('ped-1');

    expect(mockMarkChanged).toHaveBeenCalledWith('pedidos');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest database/__tests__/usePedidoDatabase.test.tsx --watchAll=false`
Expected: all 4 tests FAIL (`mockMarkChanged` never called).

- [ ] **Step 3: Wire `markChanged` into the implementation**

In `database/usePedidoDatabase.ts`, add the import at the top (after the existing 3 imports):

```ts
import { markChanged } from "./tableWatermark";
```

In `createPedido()`, right before `return { pedidoId };`:

```ts
      markChanged('pedidos')

      return { pedidoId };
```

In `createFromSync()`, right before `return { pedidoId: data.id };`:

```ts
      markChanged('pedidos')

      return { pedidoId: data.id };
```

In `updatePedido()`, right after the `status` block closes and before the outer `catch` (i.e. right after the closing `}` of the `if (typeof status !== 'undefined') { ... }` block, still inside the outer `try`):

```ts
      }

      markChanged('pedidos')
    } catch (error) {
      throw error
    }
  }
```

In `removePedido()`, right after the inner `try/finally` closes and before the outer `catch`:

```ts
      try {
        await stmt.executeAsync({ $deletedAt: now, $updatedAt: now, $syncStatus: 'pending', $id: pedidoId });
      } finally {
        await stmt.finalizeAsync();
      }

      markChanged('pedidos')
    } catch (error) {
      throw error
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest database/__tests__/usePedidoDatabase.test.tsx --watchAll=false`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add database/usePedidoDatabase.ts database/__tests__/usePedidoDatabase.test.tsx
git commit -m "feat(mobile): mark pedidos table changed on local writes"
```

---

### Task 5: wire `database/useVendaDatabse.ts`

**Files:**
- Modify: `database/useVendaDatabse.ts:1-3` (import), `:8-49` (`createVenda`), `:51-88` (`createFromSync`), `:113-127` (`removeVenda`)
- Test: Create `database/__tests__/useVendaDatabse.test.tsx`

**Interfaces:**
- Consumes: `markChanged('vendas')` de `./tableWatermark` (Task 1).

- [ ] **Step 1: Write the failing test**

```tsx
// database/__tests__/useVendaDatabse.test.tsx
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('expo-sqlite', () => ({
  useSQLiteContext: jest.fn(),
}));

jest.mock('../utils/uuid', () => ({
  generateUUID: jest.fn(() => 'generated-uuid'),
}));

jest.mock('../tableWatermark', () => ({
  markChanged: jest.fn(),
}));

import { useSQLiteContext } from 'expo-sqlite';
import { markChanged } from '../tableWatermark';
import { useVendasDatabase } from '../useVendaDatabse';

const mockUseSQLiteContext = useSQLiteContext as jest.Mock;
const mockMarkChanged = markChanged as jest.Mock;

function makeStatement() {
  return {
    executeAsync: jest.fn(async () => ({})),
    finalizeAsync: jest.fn(async () => {}),
  };
}

function renderVendasDbHook() {
  let result!: ReturnType<typeof useVendasDatabase>;
  function Harness() {
    result = useVendasDatabase();
    return null;
  }
  act(() => {
    TestRenderer.create(<Harness />);
  });
  return result;
}

describe('useVendasDatabase — table watermark', () => {
  beforeEach(() => {
    mockMarkChanged.mockReset();
  });

  it('createVenda() marks vendas changed', async () => {
    const db = {
      prepareAsync: jest.fn(async () => makeStatement()),
      getFirstAsync: jest.fn(async () => ({ preco: 10 })),
    };
    mockUseSQLiteContext.mockReturnValue(db);

    const { createVenda } = renderVendasDbHook();
    await createVenda([{ produtoId: 'p1', quantidade: 1 }], 'Cliente Y');

    expect(mockMarkChanged).toHaveBeenCalledWith('vendas');
  });

  it('createFromSync() marks vendas changed', async () => {
    const db = { prepareAsync: jest.fn(async () => makeStatement()) };
    mockUseSQLiteContext.mockReturnValue(db);

    const { createFromSync } = renderVendasDbHook();
    await createFromSync({ id: 'ven-1', total: 10, horario: new Date().toISOString() } as any);

    expect(mockMarkChanged).toHaveBeenCalledWith('vendas');
  });

  it('removeVenda() marks vendas changed', async () => {
    const db = { prepareAsync: jest.fn(async () => makeStatement()) };
    mockUseSQLiteContext.mockReturnValue(db);

    const { removeVenda } = renderVendasDbHook();
    await removeVenda('ven-1');

    expect(mockMarkChanged).toHaveBeenCalledWith('vendas');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest database/__tests__/useVendaDatabse.test.tsx --watchAll=false`
Expected: all 3 tests FAIL.

- [ ] **Step 3: Wire `markChanged` into the implementation**

In `database/useVendaDatabse.ts`, add the import at the top (after the existing 3 imports):

```ts
import { markChanged } from "./tableWatermark";
```

In `createVenda()`, right before `return { vendaId };`:

```ts
                        markChanged('vendas')

                        return { vendaId };
```

In `createFromSync()`, right before `return { vendaId: data.id };`:

```ts
                return { vendaId: data.id };
```

becomes:

```ts
                markChanged('vendas')

                return { vendaId: data.id };
```

In `removeVenda()`, right after the inner `try/finally` closes and before the outer `catch`:

```ts
            try {
                await stmt.executeAsync({ $deletedAt: now, $updatedAt: now, $syncStatus: 'pending', $id: vendaId });
            } finally {
                await stmt.finalizeAsync();
            }

            markChanged('vendas')
        } catch (error) {
            throw error
        }
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest database/__tests__/useVendaDatabse.test.tsx --watchAll=false`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add database/useVendaDatabse.ts database/__tests__/useVendaDatabse.test.tsx
git commit -m "feat(mobile): mark vendas table changed on local writes"
```

---

### Task 6: wire `database/useSyncDatabase.ts` (pull-apply)

**Files:**
- Modify: `database/useSyncDatabase.ts:1-3` (import), `:184-224` (`tiposProduto` block), `:227-276` (`produtos` block), `:279-341` (`pedidos` block), `:344-412` (`vendas` block)
- Test: Create `database/__tests__/useSyncDatabase.test.ts`

**Interfaces:**
- Consumes: `markChanged(table)` de `./tableWatermark` (Task 1).
- Consumes: `api.sincronizar`/`api.getChanges` de `@/services/api` (mockados no teste).

- [ ] **Step 1: Write the failing test**

```ts
// database/__tests__/useSyncDatabase.test.ts
jest.mock('@/services/api', () => ({
  sincronizar: jest.fn(async () => ({})),
  getChanges: jest.fn(),
}));

jest.mock('../tableWatermark', () => ({
  markChanged: jest.fn(),
}));

jest.mock('../utils/uuid', () => ({
  generateUUID: jest.fn(() => 'generated-uuid'),
}));

import * as api from '@/services/api';
import { markChanged } from '../tableWatermark';
import { sincronizarComServidor } from '../useSyncDatabase';

const mockGetChanges = api.getChanges as jest.Mock;
const mockMarkChanged = markChanged as jest.Mock;

function makeFakeDb() {
  return {
    getFirstAsync: jest.fn(async () => null),
    getAllAsync: jest.fn(async () => []),
    runAsync: jest.fn(async () => ({})),
    execAsync: jest.fn(async () => undefined),
  };
}

describe('sincronizarComServidor — table watermark', () => {
  beforeEach(() => {
    mockMarkChanged.mockReset();
  });

  it('marks produtos changed when the server sends new produtos', async () => {
    mockGetChanges.mockResolvedValue({
      produtos: [{ id: 'p1', nome: 'X', preco: 10, updated_at: Date.now() }],
      pedidos: [],
      vendas: [],
      tiposProduto: [],
    });

    await sincronizarComServidor(makeFakeDb() as any, 'token');

    expect(mockMarkChanged).toHaveBeenCalledWith('produtos');
    expect(mockMarkChanged).not.toHaveBeenCalledWith('pedidos');
    expect(mockMarkChanged).not.toHaveBeenCalledWith('vendas');
  });

  it('marks produtos changed when the server sends new tiposProduto, even with no produtos', async () => {
    mockGetChanges.mockResolvedValue({
      produtos: [],
      pedidos: [],
      vendas: [],
      tiposProduto: [{ id: 1, descricao: 'Bebida', updated_at: Date.now() }],
    });

    await sincronizarComServidor(makeFakeDb() as any, 'token');

    expect(mockMarkChanged).toHaveBeenCalledWith('produtos');
  });

  it('marks pedidos changed when the server sends new pedidos', async () => {
    mockGetChanges.mockResolvedValue({
      produtos: [],
      pedidos: [{ id: 'ped1', status: 'ABERTO', updated_at: Date.now() }],
      vendas: [],
      tiposProduto: [],
    });

    await sincronizarComServidor(makeFakeDb() as any, 'token');

    expect(mockMarkChanged).toHaveBeenCalledWith('pedidos');
    expect(mockMarkChanged).not.toHaveBeenCalledWith('produtos');
  });

  it('marks vendas changed when the server sends new vendas', async () => {
    mockGetChanges.mockResolvedValue({
      produtos: [],
      pedidos: [],
      vendas: [{ id: 'ven1', updated_at: Date.now() }],
      tiposProduto: [],
    });

    await sincronizarComServidor(makeFakeDb() as any, 'token');

    expect(mockMarkChanged).toHaveBeenCalledWith('vendas');
    expect(mockMarkChanged).not.toHaveBeenCalledWith('produtos');
  });

  it('marks nothing changed when the server has nothing new', async () => {
    mockGetChanges.mockResolvedValue({ produtos: [], pedidos: [], vendas: [], tiposProduto: [] });

    await sincronizarComServidor(makeFakeDb() as any, 'token');

    expect(mockMarkChanged).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest database/__tests__/useSyncDatabase.test.ts --watchAll=false`
Expected: the 4 "marks X changed" tests FAIL (`mockMarkChanged` never called); the "marks nothing changed" test PASSes trivially already.

- [ ] **Step 3: Wire `markChanged` into the implementation**

In `database/useSyncDatabase.ts`, add the import at the top (after the existing 2 imports):

```ts
import { markChanged } from './tableWatermark';
```

In the `tiposProduto` upsert block, right after `await database.execAsync('COMMIT;');` and before the `catch`:

```ts
        }
        await database.execAsync('COMMIT;');
        markChanged('produtos');
      } catch (err) {
        await database.execAsync('ROLLBACK;').catch((e) => console.warn('[sync] db op failed', e));
      }
    }

    // Upsert produtos: match by origemProdutoId OR id to avoid duplicates; respect deleted_at
```

In the `produtos` upsert block, same pattern — right after its `await database.execAsync('COMMIT;');` and before its `catch`:

```ts
        }
        await database.execAsync('COMMIT;');
        markChanged('produtos');
      } catch (err) {
        await database.execAsync('ROLLBACK;').catch((e) => console.warn('[sync] db op failed', e));
      }
    }

    // Upsert pedidos (orders) from server
```

In the `pedidos` upsert block, right after its `await database.execAsync('COMMIT;');` and before its `catch`:

```ts
        }
        await database.execAsync('COMMIT;');
        markChanged('pedidos');
      } catch (err) {
        await database.execAsync('ROLLBACK;').catch((e) => console.warn('[sync] db op failed', e));
      }
    }

    // Upsert vendas (completed sales) from server
```

In the `vendas` upsert block, right after its `await database.execAsync('COMMIT;');` and before its `catch`:

```ts
        }
        await database.execAsync('COMMIT;');
        markChanged('vendas');
      } catch (err) {
        await database.execAsync('ROLLBACK;').catch((e) => console.warn('[sync] db op failed', e));
      }
    }

    // Limpeza local baseada na política retornada pelo servidor
```

Each `markChanged` call sits **inside** the `if (changes && Array.isArray(changes.X) && changes.X.length > 0) { try { ... } }` block, so it only runs when the server actually sent a non-empty array for that table, and only after the transaction commits successfully (not on rollback).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest database/__tests__/useSyncDatabase.test.ts --watchAll=false`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add database/useSyncDatabase.ts database/__tests__/useSyncDatabase.test.ts
git commit -m "feat(mobile): mark tables changed when sync pull applies rows"
```

---

### Task 7: gate `hooks/useProductList.ts` (usado por `produtos.tsx` e `index.tsx`)

**Files:**
- Modify: `hooks/useProductList.ts:1-5` (imports), `:102-108` (efeito de `search`/`lastSync`)

**Interfaces:**
- Consumes: `useShouldReload(['produtos'])` de `@/hooks/useShouldReload` (Task 2).

Sem teste automatizado novo nesta task — `produtos.tsx`/`index.tsx` (as duas telas que usam este hook) não têm harness de teste hoje (nenhum componente de tela do app tem, é limitação conhecida do projeto — ver `plano.md`, cobertura de testes é só unit+integração de hooks/lógica pura). Validação é rodar a suíte existente (não deve quebrar) + QA manual no emulador (Task 10).

- [ ] **Step 1: Modify the imports**

No topo de `hooks/useProductList.ts`, troque:

```ts
import { useState, useEffect, useRef } from "react"
import {  useProductDatabase } from "@/database/useProductDatabase"
import { ProductDatabase } from "@/database/types/Produto"
import { useAutoSync } from '@/context/AutoSyncContext'
```

por:

```ts
import { useState, useEffect, useRef } from "react"
import {  useProductDatabase } from "@/database/useProductDatabase"
import { ProductDatabase } from "@/database/types/Produto"
import { useAutoSync } from '@/context/AutoSyncContext'
import { useShouldReload } from '@/hooks/useShouldReload'
```

- [ ] **Step 2: Split the combined effect into a search-driven one (ungated) and a lastSync-driven one (gated)**

Troque o bloco final (linhas 102-108):

```ts
  // Carregar os produtos e tipos de produto quando a pesquisa mudar
  // e também recarregar quando uma sincronização remota for aplicada (lastSync)
  const { lastSync } = useAutoSync();
  useEffect(() => {
    list()
    loadTiposProduto()
  }, [search, lastSync])
```

por:

```ts
  // Carregar produtos+tipos quando a pesquisa mudar - acao direta do usuario,
  // sempre roda, nao passa pelo gate.
  useEffect(() => {
    list()
    loadTiposProduto()
  }, [search])

  // Recarregar quando uma sincronizacao remota for aplicada (lastSync) - so
  // se a tabela de produtos realmente mudou desde a ultima vez que esta tela
  // recarregou. Pula a 1a execucao (mount), ja coberta pelo efeito acima.
  const { lastSync } = useAutoSync();
  const shouldReloadProdutos = useShouldReload(['produtos'])
  const isFirstLastSync = useRef(true)
  useEffect(() => {
    if (isFirstLastSync.current) {
      isFirstLastSync.current = false
      return
    }
    if (!shouldReloadProdutos()) return
    list()
    loadTiposProduto()
  }, [lastSync])
```

- [ ] **Step 3: Run the existing suite and typecheck**

Run: `npx jest --watchAll=false`
Expected: PASS, nenhuma regressão.

Run: `npx tsc --noEmit`
Expected: limpo.

- [ ] **Step 4: Commit**

```bash
git add hooks/useProductList.ts
git commit -m "feat(mobile): gate produtos reload on lastSync behind table watermark"
```

---

### Task 8: gate `app/(tabs)/pedidos.tsx`

**Files:**
- Modify: `app/(tabs)/pedidos.tsx` (imports, corpo do componente)

**Interfaces:**
- Consumes: `useShouldReload(['pedidos', 'produtos'])` de `@/hooks/useShouldReload` (Task 2).

Sem teste automatizado novo (mesma razão da Task 7 — tela sem harness hoje). Validação: suíte existente + QA manual (Task 10).

- [ ] **Step 1: Add the import**

No topo de `app/(tabs)/pedidos.tsx`, adicione junto aos outros imports de hook (perto de `useSyncRefresh`):

```ts
import { useShouldReload } from '@/hooks/useShouldReload';
```

- [ ] **Step 2: Gate both reload triggers**

Adicione a declaração do gate logo após `const { refreshing, onRefresh } = useSyncRefresh();`:

```ts
  const { refreshing, onRefresh } = useSyncRefresh();
  const shouldReloadPedidos = useShouldReload(['pedidos', 'produtos']);
```

Troque:

```ts
  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  useEffect(() => {
    load();
  }, [lastSync]);
```

por:

```ts
  useFocusEffect(
    useCallback(() => {
      if (shouldReloadPedidos()) load();
    }, [])
  );

  useEffect(() => {
    if (shouldReloadPedidos()) load();
  }, [lastSync]);
```

- [ ] **Step 3: Run the existing suite and typecheck**

Run: `npx jest --watchAll=false`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: limpo.

- [ ] **Step 4: Commit**

```bash
git add "app/(tabs)/pedidos.tsx"
git commit -m "feat(mobile): gate pedidos reload behind table watermark"
```

---

### Task 9: gate `app/(tabs)/historico.tsx`

**Files:**
- Modify: `app/(tabs)/historico.tsx` (imports, corpo do componente)

**Interfaces:**
- Consumes: `useShouldReload(['vendas', 'produtos'])` de `@/hooks/useShouldReload` (Task 2).

Sem teste automatizado novo (mesma razão da Task 7). Validação: suíte existente + QA manual (Task 10).

**Importante:** só o `useEffect([lastSync])` é gateado. O `useFocusEffect` (que reseta `setSearchDate(new Date())` e chama `fetchVendas()` toda vez que a aba ganha foco) **fica como está, sem gate** — ele existe pra resetar de propósito uma busca por data customizada de volta pra "últimos 3 dias" quando o usuário volta pra aba. Gatear esse call site prenderia quem buscou uma data específica nesse resultado pra sempre.

- [ ] **Step 1: Add the import**

No topo de `app/(tabs)/historico.tsx`, adicione junto aos outros imports de hook:

```ts
import { useShouldReload } from '@/hooks/useShouldReload';
```

- [ ] **Step 2: Gate only the `lastSync` effect**

Troque:

```ts
  useFocusEffect(
    useCallback(() => {
      setSearchDate(new Date());
      fetchVendas();
    }, [fetchVendas])
  );

  useEffect(() => {
    fetchVendas();
  }, [lastSync]);
```

por:

```ts
  useFocusEffect(
    useCallback(() => {
      setSearchDate(new Date());
      fetchVendas();
    }, [fetchVendas])
  );

  const shouldReloadVendas = useShouldReload(['vendas', 'produtos']);
  useEffect(() => {
    if (!shouldReloadVendas()) return;
    fetchVendas();
  }, [lastSync]);
```

- [ ] **Step 3: Run the existing suite and typecheck**

Run: `npx jest --watchAll=false`
Expected: PASS.

Run: `npx tsc --noEmit`
Expected: limpo.

- [ ] **Step 4: Commit**

```bash
git add "app/(tabs)/historico.tsx"
git commit -m "feat(mobile): gate historico lastSync reload behind table watermark"
```

---

### Task 10: integração final — suíte completa + QA manual no emulador + atualizar `plano.md`

**Files:**
- Modify: `C:/RN/plano.md` (seção da Fase 5 — marcar este sub-item)
- Nenhum arquivo de código novo.

**Interfaces:** nenhuma (task de verificação/documentação).

- [ ] **Step 1: Rodar a suíte inteira e o typecheck**

Run: `npx jest --watchAll=false`
Expected: PASS, todos os testes (incluindo os novos das Tasks 1-6).

Run: `npx tsc --noEmit`
Expected: limpo.

- [ ] **Step 2: Build/rodar no emulador Android**

Run: `npx expo run:android` (ou reaproveitar um build já em execução no emulador, reload via Metro se só mudou JS).

- [ ] **Step 3: QA manual — 3 cenários da spec**

1. Editar um produto existente (nome) pelo app → confirmar que `produtos.tsx` e `index.tsx` (tela de venda) mostram o nome novo sem precisar puxar a lista manualmente.
2. Criar um pedido novo → confirmar que `pedidos.tsx` atualiza sozinho e que `historico.tsx` (se estava em foco antes) **não** dispara uma query nova pro Metro/console (nenhum log de `[sync]` relacionado a vendas nesse ciclo, já que só pedidos mudou).
3. Trocar de aba repetidamente sem nenhuma mudança de dado → confirmar ausência de flash de skeleton/spinner nas 4 telas de lista (mais perceptível que antes, já que agora também pula a query, não só o `setState`).

- [ ] **Step 4: Atualizar `plano.md`**

Em `C:/RN/plano.md`, na seção "Fase 5", trocar a linha solta (linha 190, a ideia original ditada) por uma entrada formal de sub-item, seguindo o padrão das outras entradas da Rodada 2026-08-09 (sub-item 1/4A/4B). Adicionar algo como:

```markdown
**Sub-item 4C — Watermark por tabela + gate de reload nas listas — ✅ implementado, aguardando QA visual do usuário.** Spec: `TozzoBurger/docs/superpowers/specs/2026-08-10-table-watermark-render-gate-mobile-design.md`. Plano (10 tasks): `TozzoBurger/docs/superpowers/plans/2026-08-10-table-watermark-render-gate-mobile.md`.
- Timestamp epoch ms por tabela em memória (`produtos`/`pedidos`/`vendas`), marcado em todo write local (create/update/remove) e em todo bloco de upsert do pull da sync. Cada tela de lista guarda seu próprio "último visto" e só recarrega quando a tabela que ela mostra (ou `produtos`, no caso de `pedidos`/`historico` que mostram nome de produto) realmente mudou — evita query+flash de loading a cada troca de aba ou sync irrelevante.
```

E remover a linha 190 solta (o texto ditado original), já capturada formalmente pela spec.

- [ ] **Step 5: Commit**

```bash
git add plano.md
git commit -m "docs(plano): registrar Fase 5 sub-item 4C (watermark + gate de reload)"
```

## Self-Review (fechado durante a escrita deste plano)

- **Cobertura da spec**: arquitetura (Task 1+2), quem chama `markChanged` nos 3 hooks de DB local (Tasks 3-5) e no sync (Task 6), quem chama `useShouldReload` nas 3 telas/hooks (Tasks 7-9, com a exclusão do `useFocusEffect` de `historico.tsx` explicitamente documentada), testes unit (Tasks 1, 2) e manual (Task 10) — todos os itens da spec têm task correspondente.
- **Sem placeholders**: todo passo tem código real, nenhum "adicionar tratamento apropriado" ou "similar à Task N" sem o código.
- **Consistência de tipos**: `Table` (`'produtos' | 'pedidos' | 'vendas'`) usado igual em `tableWatermark.ts` e `useShouldReload.ts`; `markChanged`/`getChangedAt` com a mesma assinatura em todo lugar que consome.
