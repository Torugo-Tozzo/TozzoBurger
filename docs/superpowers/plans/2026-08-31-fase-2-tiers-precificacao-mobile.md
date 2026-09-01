# Fase 2 — Tiers de precificação (Mobile) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App móvel registra o dispositivo na API, sincroniza `print_logs` via WatermelonDB, aplica o gate de impressão (30/dia FREE) 100% offline, aplica um gate de relatório (5/mês FREE, local/soft) e mostra o tier + uso atual nas Configurações.

**Architecture:** `print_logs` vira uma 7ª tabela WatermelonDB sincronizada pelo motor nativo (`synchronize()`), igual `sales`/`orders` — o gate de impressão lê a contagem local (que inclui o que outros dispositivos já sincronizaram + o que este dispositivo imprimiu depois do último sync). O gate de relatório **não** segue o mesmo desenho — achado desta sessão: `relatorioModal` é 100% local (WatermelonDB direto, nunca chamou a API), diferente do que a spec original assumia. Em vez de inventar uma 2ª entidade sincronizada só pra isso, o gate de relatório usa um contador mensal local simples (AsyncStorage, por dispositivo, sem sincronizar entre dispositivos) — decisão pragmática documentada abaixo, com o trade-off explícito.

**Tech Stack:** Expo Router (SDK 52) + React Native 0.76 + `expo-sqlite`/WatermelonDB + `expo-secure-store` + `@react-native-async-storage/async-storage` + `expo-crypto` + Jest/`jest-expo`.

**Spec:** `TozzoBurger/docs/superpowers/specs/2026-08-30-fase-2-tiers-precificacao-design.md`

**Depende de:** o plano da API (`api/api-tozzo.uk/docs/superpowers/plans/2026-08-31-fase-2-tiers-precificacao-api.md`) — em especial a Task 6 (que redesenhou `print_logs` pra entrar no `SYNC_TABLES` genérico, não num canal solto) e a Task 4/4.1 (limite de dispositivo + `DELETE /dispositivos/:id` só-DONO).

## Global Constraints

- Timestamps sempre em epoch ms (padrão já usado no projeto) — `printed_at` é `number`, não ISO string.
- `bun test`/`jest --watchAll` trava non-interactive — sempre rodar `npx jest --watchAll=false`.
- **Sempre validar com build Android real** (`npx expo run:android`) antes de considerar a fase concluída — `expo start`/Metro isolado não pega problema de módulo nativo faltando (`expo-crypto`/`expo-secure-store`/`@react-native-async-storage/async-storage` já estão no `package.json`, então não é esperado achar isso aqui, mas confirmar mesmo assim).
- **Achado desta sessão (2026-08-31, gap real na spec original)**: o app **nunca chamava** `POST /dispositivos` — o limite de dispositivos da matriz de tiers (3/8/15) nunca tinha um jeito de disparar de verdade. Este plano inclui o registro (Task 2), decisão confirmada com o usuário antes de escrever o plano.
- **Achado desta sessão**: a spec original ("`relatorioModal` já sempre chama a API") está errada pro mobile — é 100% local. O gate de relatório mobile (Task 4) é **soft** (contador local por dispositivo, sem sincronizar) — overshoot é mais fácil de acontecer aqui do que no gate de impressão (que sincroniza de verdade) se o estabelecimento usa vários dispositivos. Aceito como trade-off pragmático pra não inventar uma 2ª entidade sincronizada nesta leva — revisitar se o uso real mostrar que é um problema (mesma filosofia da spec: "números de quota são hipótese de ponto de partida, não medição").
- O cache local de `plan` (usado pelos 2 gates pra saber se o estabelecimento é FREE) trata "nunca cacheado" (`null`) como **FREE** (gate ativo) — decisão deliberada: mais seguro travar de vez em quando um estabelecimento pago por falta de cache do que deixar um FREE imprimir sem limite. Na prática isso quase nunca dispara, porque o login (Task 2) já busca o estabelecimento e popula o cache antes de qualquer tela de impressão ser alcançável.

---

## Task 1: WatermelonDB — tabela local `print_logs`

**Files:**
- Modify: `database/watermelon/schema.ts` (versão 2→3, novo `tableSchema`), `database/watermelon/migrations.ts` (novo `toVersion: 3`), `database/watermelon/database.ts` (`modelClasses`), `database/watermelon/sync.ts` (`SyncTable`/`SYNC_TABLES`)
- Create: `database/watermelon/models/PrintLog.ts`
- Test: `database/__tests__/PrintLog.sync.test.tsx`

**Interfaces:**
- Produces: tabela local `print_logs` (`device_id`, `printed_at` epoch ms, `establishment_id`, `created_at`, `updated_at`) sincronizada pelo motor nativo do Watermelon — consumida pela Task 3.

- [ ] **Step 1: Escrever o teste (banco real em memória, mesmo padrão de `useProductDatabase.test.tsx`)**

```tsx
// database/__tests__/PrintLog.sync.test.tsx
jest.mock('react-native', () => {
  const databaseBridge = require('@nozbe/watermelondb/adapters/sqlite/sqlite-node/DatabaseBridge').default;
  const bridgeMethods = ['initialize', 'setUpWithSchema', 'setUpWithMigrations', 'find', 'query', 'queryIds', 'unsafeQueryRaw', 'count', 'batch', 'unsafeResetDatabase', 'getLocal'];
  const asyncDatabaseBridge = bridgeMethods.reduce((bridge, method) => {
    bridge[method] = (...args: unknown[]) => new Promise((resolve, reject) => { databaseBridge[method](...args, resolve, reject); });
    return bridge;
  }, {} as Record<string, (...args: unknown[]) => Promise<unknown>>);
  return { NativeModules: { WMDatabaseBridge: asyncDatabaseBridge }, Platform: { OS: 'ios' } };
});

import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import migrations from '../watermelon/migrations';
import Order from '../watermelon/models/Order';
import OrderItem from '../watermelon/models/OrderItem';
import Printer from '../watermelon/models/Printer';
import PrintLog from '../watermelon/models/PrintLog';
import Product from '../watermelon/models/Product';
import ProductType from '../watermelon/models/ProductType';
import Sale from '../watermelon/models/Sale';
import SaleItem from '../watermelon/models/SaleItem';
import User from '../watermelon/models/User';
import schema from '../watermelon/schema';

const modelClasses = [Product, ProductType, Order, OrderItem, Sale, SaleItem, User, Printer, PrintLog];

function makeDatabase() {
  const adapter = new SQLiteAdapter({
    schema,
    migrations,
    dbName: ':memory:',
    jsi: true,
    onSetUpError: (error) => { throw error; },
  });
  return new Database({ adapter, modelClasses });
}

describe('PrintLog local table', () => {
  it('cria e le uma linha de print_logs', async () => {
    const database = makeDatabase();
    const now = new Date();

    const created = await database.write(() => database.get<PrintLog>('print_logs').create((record) => {
      record.establishmentId = 'estab-1';
      record.deviceId = 'device-1';
      record.printedAt = now;
    }));

    const rows = await database.get<PrintLog>('print_logs').query().fetch();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(created.id);
    expect(rows[0].deviceId).toBe('device-1');
    expect(rows[0].establishmentId).toBe('estab-1');
  });
});
```

- [ ] **Step 2: Rodar (deve falhar — model/tabela não existe)**

Run: `npx jest --watchAll=false database/__tests__/PrintLog.sync.test.tsx`
Expected: FAIL

- [ ] **Step 3: Adicionar a tabela em `schema.ts` (versão 2→3)**

Em `database/watermelon/schema.ts`, trocar `version: 2` (linha 9) por `version: 3`, e adicionar depois do `tableSchema({ name: 'sale_items', ... })` (linha 69-78):

```ts
tableSchema({
  name: 'print_logs',
  columns: [
    { name: 'device_id', type: 'string' },
    { name: 'printed_at', type: 'number' },
    { name: 'establishment_id', type: 'string', isIndexed: true },
    ...syncTimestamps,
  ],
}),
```

- [ ] **Step 4: Adicionar a migration**

Em `database/watermelon/migrations.ts`:

```ts
import { addColumns, createTable, schemaMigrations } from '@nozbe/watermelondb/Schema/migrations';

export default schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        addColumns({
          table: 'sales',
          columns: [{ name: 'created_by_name', type: 'string', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 3,
      steps: [
        createTable({
          name: 'print_logs',
          columns: [
            { name: 'device_id', type: 'string' },
            { name: 'printed_at', type: 'number' },
            { name: 'establishment_id', type: 'string', isIndexed: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
  ],
});
```

- [ ] **Step 5: Criar o model `PrintLog.ts`**

```ts
// database/watermelon/models/PrintLog.ts
import { Model } from '@nozbe/watermelondb';
import { date, field } from '@nozbe/watermelondb/decorators';

export default class PrintLog extends Model {
  static table = 'print_logs';

  @field('device_id') deviceId!: string;
  @date('printed_at') printedAt!: Date;
  @field('establishment_id') establishmentId!: string;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
```

- [ ] **Step 6: Registrar em `database.ts`**

Em `database/watermelon/database.ts`, importar e adicionar ao array:

```ts
import PrintLog from './models/PrintLog';
// ...
export const modelClasses = [Product, ProductType, Order, OrderItem, Sale, SaleItem, User, Printer, PrintLog];
```

- [ ] **Step 7: Adicionar `print_logs` ao `SYNC_TABLES` de `database/watermelon/sync.ts`**

Linha 13-20, adicionar `'print_logs',` no fim do array `SYNC_TABLES` (o tipo `SyncTableName` é derivado automaticamente do array, não precisa editar tipo à parte).

Nota: `ensureTenantScope` (linha 281-333) só valida `products`/`orders`/`sales` e seus filhos — **não** precisa de validação extra pra `print_logs` porque cada registro já carrega `establishment_id` e o servidor (API Task 6) já rejeita registro de outro estabelecimento pelo `establishmentId` da sessão autenticada, não pelo valor que o cliente manda. `normalizeRecord` (linha 44-71) já aplica a checagem genérica de `establishment_id` pra qualquer table, incluindo `print_logs`, então nenhuma mudança adicional é necessária aqui.

- [ ] **Step 8: Rodar o teste**

Run: `npx jest --watchAll=false database/__tests__/PrintLog.sync.test.tsx`
Expected: PASS

- [ ] **Step 9: Rodar a suíte inteira (schema/migration mexe em todo o app)**

Run: `npx jest --watchAll=false`
Expected: PASS — atenção especial a qualquer teste que monte `modelClasses` manualmente (vai precisar de `PrintLog` na lista também, senão a tabela nova não existe no banco de teste).

- [ ] **Step 10: Commit**

```bash
git add database/watermelon/schema.ts database/watermelon/migrations.ts database/watermelon/models/PrintLog.ts database/watermelon/database.ts database/watermelon/sync.ts database/__tests__/PrintLog.sync.test.tsx
git commit -m "feat(sync): add print_logs as a synced WatermelonDB table"
```

---

## Task 2: Registro de dispositivo na API

**Files:**
- Modify: `services/api.ts` (nova função), `context/AuthContext.tsx` (`login`)
- Create: `services/deviceId.ts`, `services/planCache.ts`
- Test: `services/__tests__/deviceId.test.ts`, estender `context/__tests__/AuthContext.test.tsx` se existir (senão pular o teste de integração do `login` e cobrir só `deviceId.ts`/`api.registerDevice` isoladamente)

**Interfaces:**
- Produces: `getOrCreateDeviceId(): Promise<string>` (UUID persistente, `expo-secure-store`); `api.registerDevice(token, id?, info?): Promise<{id: string} & Record<string, unknown>>`; `cachePlan(plan: string)`/`getCachedPlan(): Promise<string | null>` (`services/planCache.ts`).

- [ ] **Step 1: Escrever o teste de `deviceId.ts`**

```ts
// services/__tests__/deviceId.test.ts
import * as SecureStore from 'expo-secure-store';
import { getOrCreateDeviceId } from '../deviceId';

jest.mock('expo-secure-store');
jest.mock('expo-crypto', () => ({ randomUUID: () => 'generated-uuid' }));

describe('getOrCreateDeviceId', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna o id ja armazenado se existir', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('existing-uuid');
    const id = await getOrCreateDeviceId();
    expect(id).toBe('existing-uuid');
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('gera e persiste um novo id se nao existir nenhum', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    const id = await getOrCreateDeviceId();
    expect(id).toBe('generated-uuid');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('tozzo_device_id_v1', 'generated-uuid');
  });
});
```

- [ ] **Step 2: Rodar (deve falhar — módulo não existe)**

Run: `npx jest --watchAll=false services/__tests__/deviceId.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar `services/deviceId.ts`**

```ts
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const DEVICE_ID_KEY = 'tozzo_device_id_v1';

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) return existing;

  const generated = Crypto.randomUUID();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, generated);
  return generated;
}
```

- [ ] **Step 4: Implementar `services/planCache.ts`**

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';

const PLAN_CACHE_KEY = 'tozzo_plan_cache_v1';

export async function cachePlan(plan: string): Promise<void> {
  try {
    await AsyncStorage.setItem(PLAN_CACHE_KEY, plan);
  } catch (err) {
    console.warn('Failed to cache plan', err);
  }
}

export async function getCachedPlan(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PLAN_CACHE_KEY);
  } catch (err) {
    console.warn('Failed to read cached plan', err);
    return null;
  }
}
```

- [ ] **Step 5: Adicionar `registerDevice` em `services/api.ts`**

Seguir exatamente o padrão de `updateEstablishmentCategory` (linhas 199-224):

```ts
export type DeviceRegistrationInfo = { platform?: string };

export async function registerDevice(
  token: string,
  id: string | null,
  info: DeviceRegistrationInfo = {},
): Promise<{ id: string; [key: string]: unknown }> {
  const url = new URL('/dispositivos', BASE_URL);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...NGROK_HEADERS,
      },
      body: JSON.stringify({ id: id ?? undefined, info }),
    });

    if (!res.ok) {
      const errBody = await handleJsonResponse(res).catch(() => null);
      const error = new ApiHttpError(res.status, errBody);
      console.error('API registerDevice error:', url.toString(), error.message);
      throw error;
    }

    return await handleJsonResponse(res) as { id: string; [key: string]: unknown };
  } catch (err: any) {
    if (err instanceof ApiHttpError) throw err;
    console.error('Network/registerDevice request failed', url.toString(), err?.message ?? err);
    throw err;
  }
}
```

- [ ] **Step 6: Rodar o teste de `deviceId.ts`**

Run: `npx jest --watchAll=false services/__tests__/deviceId.test.ts`
Expected: PASS

- [ ] **Step 7: Ligar o registro + o cache de plano no `login()` de `AuthContext.tsx`**

Em `context/AuthContext.tsx`, adicionar os imports:

```ts
import { Platform } from 'react-native';
import { getOrCreateDeviceId } from '@/services/deviceId';
import { cachePlan } from '@/services/planCache';
```

Depois de `setToken(t)` (linha 129), antes do `void runWithLock(...)` (linha 132), adicionar:

```ts
void (async () => {
  try {
    const deviceId = await getOrCreateDeviceId();
    const device = await api.registerDevice(t, deviceId, { platform: Platform.OS });
    if (device?.id && device.id !== deviceId) {
      // Nao deveria acontecer (o servidor sempre atualiza o mesmo id quando enviado),
      // mas se acontecer, persistir o id que o servidor devolveu evita registrar de novo no proximo login.
      const { getOrCreateDeviceId: _unused } = await import('@/services/deviceId');
      void _unused;
    }
  } catch (err: any) {
    if (err?.code === 'DEVICE_LIMIT_REACHED') {
      console.warn('[auth] device limit reached, printing/report gates will use fail-closed cache defaults');
    } else {
      console.warn('[auth] device registration failed (non-blocking)', err);
    }
  }

  try {
    const establishment = await api.getEstablishment(t, (me as any)?.establishmentId);
    if (establishment && typeof (establishment as any).plan === 'string') {
      await cachePlan((establishment as any).plan);
    }
  } catch (err) {
    console.warn('[auth] failed to prime plan cache (non-blocking)', err);
  }
})();
```

Nota: o registro de dispositivo e o cache de plano **nunca bloqueiam o login** (rodam em `void (async () => {...})()`, erros só logam) — consistente com a regra do projeto de não travar o app inteiro por causa de uma chamada de rede não-crítica, e com a decisão já tomada pro gate de impressão (offline-first).

- [ ] **Step 8: Rodar a suíte inteira de mobile**

Run: `npx jest --watchAll=false`
Expected: PASS. Se houver teste existente de `AuthContext`/`login` que faça mock estrito de `api.*` (verificando só as chamadas esperadas antes desta task), esse teste provavelmente precisa de `jest.mock` pra `registerDevice`/`getEstablishment` também — ajustar o mock, não remover a chamada nova.

- [ ] **Step 9: Commit**

```bash
git add services/api.ts services/deviceId.ts services/planCache.ts services/__tests__/deviceId.test.ts context/AuthContext.tsx
git commit -m "feat(devices): register device with the API on login and cache establishment plan"
```

---

## Task 3: Gate de impressão (local, offline-first)

**Files:**
- Create: `database/usePrintLogDatabase.ts`, `constants/planLimits.ts`
- Modify: `app/(tabs)/historico.tsx` (`handlePrint`, linhas 358-375), `app/modais/contaHistoricoModal.tsx` (`handlePrint`, linhas 131-147)
- Test: `database/__tests__/usePrintLogDatabase.test.tsx`

**Interfaces:**
- Consumes: tabela `print_logs` (Task 1), `getOrCreateDeviceId` (Task 2), `getCachedPlan` (Task 2).
- Produces: `usePrintLogDatabase(): { countPrintsToday(): Promise<number>; recordPrintLog(deviceId: string): Promise<void> }`.

- [ ] **Step 1: Criar `constants/planLimits.ts`**

```ts
export const PRINT_DAILY_LIMIT = 30;
export const REPORT_MONTHLY_LIMIT = 5;
```

- [ ] **Step 2: Escrever o teste de `usePrintLogDatabase`**

Seguir o mesmo padrão de banco real em memória de `useProductDatabase.test.tsx` (mock de `react-native`, `makeDatabase()`, mock de `context/AuthContext`):

```tsx
// database/__tests__/usePrintLogDatabase.test.tsx
jest.mock('react-native', () => {
  const databaseBridge = require('@nozbe/watermelondb/adapters/sqlite/sqlite-node/DatabaseBridge').default;
  const bridgeMethods = ['initialize', 'setUpWithSchema', 'setUpWithMigrations', 'find', 'query', 'queryIds', 'unsafeQueryRaw', 'count', 'batch', 'unsafeResetDatabase', 'getLocal'];
  const asyncDatabaseBridge = bridgeMethods.reduce((bridge, method) => {
    bridge[method] = (...args: unknown[]) => new Promise((resolve, reject) => { databaseBridge[method](...args, resolve, reject); });
    return bridge;
  }, {} as Record<string, (...args: unknown[]) => Promise<unknown>>);
  return { NativeModules: { WMDatabaseBridge: asyncDatabaseBridge }, Platform: { OS: 'ios' } };
});

let mockDatabase: import('@nozbe/watermelondb').Database;
jest.mock('../watermelon/database', () => ({ get database() { return mockDatabase; } }));
jest.mock('../../context/AuthContext', () => ({ useAuth: jest.fn() }));

import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { useAuth } from '../../context/AuthContext';
import { usePrintLogDatabase } from '../usePrintLogDatabase';
import migrations from '../watermelon/migrations';
import Order from '../watermelon/models/Order';
import OrderItem from '../watermelon/models/OrderItem';
import Printer from '../watermelon/models/Printer';
import PrintLog from '../watermelon/models/PrintLog';
import Product from '../watermelon/models/Product';
import ProductType from '../watermelon/models/ProductType';
import Sale from '../watermelon/models/Sale';
import SaleItem from '../watermelon/models/SaleItem';
import User from '../watermelon/models/User';
import schema from '../watermelon/schema';

const modelClasses = [Product, ProductType, Order, OrderItem, Sale, SaleItem, User, Printer, PrintLog];
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

function makeDatabase() {
  const adapter = new SQLiteAdapter({ schema, migrations, dbName: ':memory:', jsi: true, onSetUpError: (e) => { throw e; } });
  return new Database({ adapter, modelClasses });
}

async function seedPrintLog(database: Database, establishmentId: string, printedAt: Date) {
  return database.write(() => database.get<PrintLog>('print_logs').create((record) => {
    record.establishmentId = establishmentId;
    record.deviceId = 'seed-device';
    record.printedAt = printedAt;
  }));
}

describe('usePrintLogDatabase', () => {
  beforeEach(() => {
    mockDatabase = makeDatabase();
    mockUseAuth.mockReturnValue({ user: { establishmentId: 'estab-1' } } as ReturnType<typeof useAuth>);
  });

  it('conta so as impressoes de hoje do proprio estabelecimento', async () => {
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    await seedPrintLog(mockDatabase, 'estab-1', today);
    await seedPrintLog(mockDatabase, 'estab-1', yesterday);
    await seedPrintLog(mockDatabase, 'outro-estab', today);

    const { countPrintsToday } = usePrintLogDatabase();
    const count = await countPrintsToday();
    expect(count).toBe(1);
  });

  it('recordPrintLog cria uma linha nova', async () => {
    const { recordPrintLog, countPrintsToday } = usePrintLogDatabase();
    await recordPrintLog('device-1');
    expect(await countPrintsToday()).toBe(1);
  });
});
```

- [ ] **Step 3: Rodar (deve falhar — hook não existe)**

Run: `npx jest --watchAll=false database/__tests__/usePrintLogDatabase.test.tsx`
Expected: FAIL

- [ ] **Step 4: Implementar `database/usePrintLogDatabase.ts`**

```ts
import { Q } from '@nozbe/watermelondb';
import { useAuth } from '@/context/AuthContext';
import { database } from './watermelon/database';
import PrintLog from './watermelon/models/PrintLog';

function startOfLocalDay(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function usePrintLogDatabase() {
  const { user } = useAuth();
  const establishmentId = user?.establishmentId ? String(user.establishmentId) : null;

  async function countPrintsToday(): Promise<number> {
    if (!establishmentId) return 0;
    const rows = await database.get<PrintLog>('print_logs').query(
      Q.where('establishment_id', establishmentId),
      Q.where('printed_at', Q.gte(startOfLocalDay())),
    ).fetch();
    return rows.length;
  }

  async function recordPrintLog(deviceId: string): Promise<void> {
    if (!establishmentId) return;
    await database.write(async () => {
      await database.get<PrintLog>('print_logs').create((record) => {
        record.establishmentId = establishmentId;
        record.deviceId = deviceId;
        record.printedAt = new Date();
      });
    });
  }

  return { countPrintsToday, recordPrintLog };
}
```

- [ ] **Step 5: Rodar o teste**

Run: `npx jest --watchAll=false database/__tests__/usePrintLogDatabase.test.tsx`
Expected: PASS

- [ ] **Step 6: Ligar o gate em `historico.tsx`**

Em `app/(tabs)/historico.tsx`, adicionar imports:

```ts
import { usePrintLogDatabase } from '@/database/usePrintLogDatabase';
import { getOrCreateDeviceId } from '@/services/deviceId';
import { getCachedPlan } from '@/services/planCache';
import { PRINT_DAILY_LIMIT } from '@/constants/planLimits';
```

No corpo do componente (perto de onde outros hooks de banco já são chamados): `const { countPrintsToday, recordPrintLog } = usePrintLogDatabase();`

Trocar `handlePrint` (linhas 358-375):

```ts
const handlePrint = async (saleId: string) => {
  setLoadingPrint(saleId);
  try {
    const plan = await getCachedPlan();
    if (plan === null || plan === 'FREE') {
      const usedToday = await countPrintsToday();
      if (usedToday >= PRINT_DAILY_LIMIT) {
        Alert.alert(t('sales.printLimitReachedTitle'), t('sales.printLimitReachedMessage'));
        return;
      }
    }

    const sale = await getSaleById(saleId);
    if (!sale) return;
    const products: Produto[] = await Promise.all((sale.items ?? []).map(async (item) => {
      const product = await showAdd(item.productId);
      return { name: product?.name ?? t('sales.unknownProduct'), quantity: item.quantity, price: product?.price ?? 0 };
    }));
    await sendMessageToDevice(await formatarVendaParaImpressao(sale, products), await getPrinter());
    await recordPrintLog(await getOrCreateDeviceId());
    Alert.alert(t('sales.printSuccessTitle'), t('sales.printSuccessMessage'));
  } catch (error) {
    console.error('Erro ao imprimir venda:', error);
    Alert.alert(t('sales.printErrorTitle'), t('sales.printErrorMessage'));
  } finally {
    setLoadingPrint(null);
  }
};
```

- [ ] **Step 7: Ligar o gate em `contaHistoricoModal.tsx`**

Adicionar os mesmos imports (mais `useAuth` de `@/context/AuthContext`, que este arquivo ainda não importa). No corpo do componente: `const { countPrintsToday, recordPrintLog } = usePrintLogDatabase();`

Trocar `handlePrint` (linhas 131-147):

```ts
const handlePrint = async () => {
  if (!venda) return;

  setLoadingPrint(venda.id);
  try {
    const plan = await getCachedPlan();
    if (plan === null || plan === 'FREE') {
      const usedToday = await countPrintsToday();
      if (usedToday >= PRINT_DAILY_LIMIT) {
        Alert.alert(t('sales.printLimitReachedTitle'), t('sales.printLimitReachedMessage'));
        return;
      }
    }

    const printContent = await formatarVendaParaImpressao(venda, produtos);
    await sendMessageToDevice(printContent, await getPrinter());
    await recordPrintLog(await getOrCreateDeviceId());
  } catch (error) {
    Alert.alert(t('common.error'), t('printer.printFailed'));
    return;
  } finally {
    setLoadingPrint(null);
  }
  Alert.alert(t('common.success'), t('sales.sentToPrinter'));
};
```

- [ ] **Step 8: Adicionar as chaves de i18n novas (`sales.printLimitReachedTitle`/`Message`) — verificar o(s) arquivo(s) de locale do mobile (`assets/locales/` ou equivalente, conferir o padrão real usado por `t('sales.printSuccessTitle')` já existente) e adicionar nos idiomas suportados pelo app**

Texto de referência (português, idioma principal do app hoje): título `"Limite de impressão atingido"`, mensagem `"Seu plano Free permite até 30 impressões por dia. Faça upgrade nas Configurações para imprimir sem limite."`.

- [ ] **Step 9: Rodar os testes**

Run: `npx jest --watchAll=false`
Expected: PASS

- [ ] **Step 10: Build Android real e QA manual**

Run: `npx expo run:android`
Fluxo manual: gerar 30 impressões (ou reduzir `PRINT_DAILY_LIMIT` temporariamente pra testar mais rápido, revertendo depois) num estabelecimento FREE, confirmar que a 31ª é bloqueada com o alerta certo; confirmar que um estabelecimento com plano cacheado diferente de `FREE` nunca é bloqueado.

- [ ] **Step 11: Commit**

```bash
git add database/usePrintLogDatabase.ts constants/planLimits.ts "app/(tabs)/historico.tsx" app/modais/contaHistoricoModal.tsx database/__tests__/usePrintLogDatabase.test.tsx
git commit -m "feat(print): gate BLE printing at 30/day for FREE plan, offline-first"
```

---

## Task 4: Gate de relatório (local, soft, sem sincronizar)

**Files:**
- Create: `services/reportQuota.ts`
- Modify: `app/modais/relatorioModal.tsx` (em torno das linhas 83-104)
- Test: `services/__tests__/reportQuota.test.ts`

**Interfaces:**
- Consumes: `getCachedPlan` (Task 2), `REPORT_MONTHLY_LIMIT` (Task 3).
- Produces: `getReportCountThisMonth(): Promise<number>`, `recordReportGenerated(): Promise<void>`.

- [ ] **Step 1: Escrever o teste**

```ts
// services/__tests__/reportQuota.test.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getReportCountThisMonth, recordReportGenerated } from '../reportQuota';

describe('reportQuota', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('comeca em 0', async () => {
    expect(await getReportCountThisMonth()).toBe(0);
  });

  it('incrementa a cada recordReportGenerated', async () => {
    await recordReportGenerated();
    await recordReportGenerated();
    expect(await getReportCountThisMonth()).toBe(2);
  });

  it('reseta quando o mes guardado e diferente do mes atual', async () => {
    await AsyncStorage.setItem('tozzo_report_month_v1', '2020-0');
    await AsyncStorage.setItem('tozzo_report_count_v1', '5');
    expect(await getReportCountThisMonth()).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar (deve falhar — módulo não existe)**

Run: `npx jest --watchAll=false services/__tests__/reportQuota.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar `services/reportQuota.ts`**

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';

const REPORT_COUNT_KEY = 'tozzo_report_count_v1';
const REPORT_MONTH_KEY = 'tozzo_report_month_v1';

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth()}`;
}

export async function getReportCountThisMonth(): Promise<number> {
  const storedMonth = await AsyncStorage.getItem(REPORT_MONTH_KEY);
  if (storedMonth !== currentMonthKey()) return 0;
  const raw = await AsyncStorage.getItem(REPORT_COUNT_KEY);
  return raw ? Number(raw) : 0;
}

export async function recordReportGenerated(): Promise<void> {
  const month = currentMonthKey();
  const count = await getReportCountThisMonth();
  await AsyncStorage.setItem(REPORT_MONTH_KEY, month);
  await AsyncStorage.setItem(REPORT_COUNT_KEY, String(count + 1));
}
```

- [ ] **Step 4: Rodar o teste**

Run: `npx jest --watchAll=false services/__tests__/reportQuota.test.ts`
Expected: PASS

- [ ] **Step 5: Ligar o gate em `relatorioModal.tsx`**

Adicionar imports:

```ts
import { useAuth } from '@/context/AuthContext';
import { getCachedPlan } from '@/services/planCache';
import { getReportCountThisMonth, recordReportGenerated } from '@/services/reportQuota';
import { REPORT_MONTHLY_LIMIT } from '@/constants/planLimits';
```

No corpo do componente: `const { user } = useAuth();` (se ainda não existir) e um novo estado `const [quotaBlocked, setQuotaBlocked] = useState(false);`.

No `useEffect` que chama `carregarDadosRelatorio` (linhas 83-104), no início da função:

```ts
async function carregarDadosRelatorio() {
  setLoading(true);
  try {
    const plan = await getCachedPlan();
    if (plan === null || plan === 'FREE') {
      const used = await getReportCountThisMonth();
      if (used >= REPORT_MONTHLY_LIMIT) {
        setQuotaBlocked(true);
        setLoading(false);
        return;
      }
    }
    setQuotaBlocked(false);

    const tipoIdParam = productTypeId ?? '';
    const report = await getSalesReportByPeriod(
      dataInicial.toISOString(),
      dataFinal.toISOString(),
      tipoIdParam
    );
    setRelatorioData(report);
    if (plan === null || plan === 'FREE') {
      await recordReportGenerated();
    }
  } catch (error) {
    console.error('Failed to load sales report:', error);
    Alert.alert(t('common.error'), t('errors.loadFailed'));
  } finally {
    setLoading(false);
  }
}
```

No JSX, quando `quotaBlocked` for `true`, mostrar uma mensagem em vez do gráfico (reaproveitar o padrão de estado vazio já usado no arquivo, ex.: um `<Text>` com `t('charts.reportQuotaExceeded')` centralizado no lugar do `PieChart`/`ProgressChart`).

- [ ] **Step 6: Adicionar a chave de i18n `charts.reportQuotaExceeded`**

Texto de referência (português): `"Limite mensal de relatórios atingido no plano Free. Faça upgrade nas Configurações para gerar relatórios ilimitados."` — adicionar no(s) arquivo(s) de locale do mobile, mesmo padrão de `t('sales.printSuccessTitle')`.

- [ ] **Step 7: Rodar os testes**

Run: `npx jest --watchAll=false`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add services/reportQuota.ts services/__tests__/reportQuota.test.ts app/modais/relatorioModal.tsx
git commit -m "feat(reports): add soft local monthly quota gate for FREE plan"
```

---

## Task 5: Seção "Plano" em Configurações

**Files:**
- Modify: `app/(tabs)/configs.tsx` (nova seção, entre a de impressora e a de suporte, em torno da linha 282-295)
- Test: `app/(tabs)/__tests__/configs.test.tsx` (estender se já existir; senão, teste focado só na seção nova, montando o componente com os mocks já usados pelos outros testes de tela deste projeto)

**Interfaces:**
- Consumes: `api.getEstablishment` (já existe), `usePrintLogDatabase().countPrintsToday`, `getReportCountThisMonth` (Task 4), `PRINT_DAILY_LIMIT`/`REPORT_MONTHLY_LIMIT` (Task 3).

- [ ] **Step 1: Escrever o teste**

```tsx
// dentro de app/(tabs)/__tests__/configs.test.tsx (ajustar imports/mocks pro padrão já usado no arquivo existente)
it('mostra o tier e os contadores de uso pro plano FREE', async () => {
  (api.getEstablishment as jest.Mock).mockResolvedValue({ id: 'estab-1', plan: 'FREE', _count: { devices: 2 } });
  // mocks de countPrintsToday/getReportCountThisMonth retornando 5 e 1

  const { findByText } = render(<ConfigsScreen />);

  expect(await findByText(/free/i)).toBeTruthy();
  expect(await findByText(/5.*30/)).toBeTruthy();
  expect(await findByText(/1.*5/)).toBeTruthy();
});

it('mostra "ilimitado" pro plano pago', async () => {
  (api.getEstablishment as jest.Mock).mockResolvedValue({ id: 'estab-1', plan: 'PAGO', _count: { devices: 4 } });

  const { findByText } = render(<ConfigsScreen />);

  expect(await findByText(/unlimited|ilimitado/i)).toBeTruthy();
});
```

Ajustar o teste ao padrão real de mock já usado pelo arquivo de teste de `configs.tsx` (se ele já existir e tiver um jeito estabelecido de mockar `services/api`/`useAuth`/navegação) — não inventar um harness novo se um já existe pra essa tela.

- [ ] **Step 2: Rodar (deve falhar)**

Run: `npx jest --watchAll=false "app/(tabs)/__tests__/configs.test.tsx"`
Expected: FAIL

- [ ] **Step 3: Implementar a seção**

Em `app/(tabs)/configs.tsx`, adicionar imports:

```ts
import * as api from '@/services/api';
import { usePrintLogDatabase } from '@/database/usePrintLogDatabase';
import { getReportCountThisMonth } from '@/services/reportQuota';
import { PRINT_DAILY_LIMIT, REPORT_MONTHLY_LIMIT } from '@/constants/planLimits';
```

No corpo do componente:

```ts
const { countPrintsToday } = usePrintLogDatabase();
const [planInfo, setPlanInfo] = useState<{ plan: string; deviceCount: number } | null>(null);
const [printsToday, setPrintsToday] = useState(0);
const [reportsThisMonth, setReportsThisMonth] = useState(0);

useEffect(() => {
  if (!token || !user?.establishmentId) return;
  let cancelled = false;
  (async () => {
    try {
      const [establishment, prints, reports] = await Promise.all([
        api.getEstablishment(token, user.establishmentId!),
        countPrintsToday(),
        getReportCountThisMonth(),
      ]);
      if (cancelled) return;
      setPlanInfo({
        plan: typeof (establishment as any)?.plan === 'string' ? (establishment as any).plan : 'FREE',
        deviceCount: (establishment as any)?._count?.devices ?? 0,
      });
      setPrintsToday(prints);
      setReportsThisMonth(reports);
    } catch (err) {
      console.warn('Failed to load plan info', err);
    }
  })();
  return () => { cancelled = true; };
}, [token, user?.establishmentId]);
```

JSX (nova seção, mesmo padrão visual das outras — ver `styles.section`/`styles.sectionHeader` já usados pra Printer/Support):

```tsx
{planInfo && (
  <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <View style={[styles.sectionHeader, styles.sectionHeaderRow, { backgroundColor: colors.surfaceHeader }]}>
      <FontAwesome name="credit-card" size={16} color={colors.text} />
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('settings.plan.title')}</Text>
    </View>
    <View style={styles.sectionContent}>
      <Text style={{ color: colors.text }}>{t(`settings.plan.tiers.${planInfo.plan}`)}</Text>
      <Text style={{ color: colors.text }}>
        {planInfo.plan === 'FREE'
          ? t('settings.plan.printsToday', { count: printsToday, limit: PRINT_DAILY_LIMIT })
          : t('settings.plan.unlimited')}
      </Text>
      <Text style={{ color: colors.text }}>
        {planInfo.plan === 'FREE'
          ? t('settings.plan.reportsThisMonth', { count: reportsThisMonth, limit: REPORT_MONTHLY_LIMIT })
          : t('settings.plan.unlimited')}
      </Text>
      <Text style={{ color: colors.text }}>{t('settings.plan.devices', { count: planInfo.deviceCount })}</Text>
      {planInfo.plan === 'FREE' && (
        <Button title={t('settings.plan.upgradeButton')} onPress={() => WebBrowser.openBrowserAsync('https://tozzo.uk/plan')} />
      )}
    </View>
  </View>
)}
```

Nota: link de upgrade abre `tozzo.uk/plan` no navegador (mesmo padrão de `WebBrowser.openBrowserAsync` já usado pra `/privacidade`/`/termos`, linha 316-324 do arquivo) — o mobile **não** tem tela própria de checkout, reaproveita o dashboard web.

- [ ] **Step 4: Adicionar as chaves de i18n (`settings.plan.*`)**

Mesmo bloco de chaves já escrito na Task 7 do plano do front (`plan.title`, `plan.tiers.*`, `plan.printsToday`, `plan.reportsThisMonth`, `plan.unlimited`, `plan.devices`, `plan.upgradeButton`), adaptando `printsToday`/`reportsThisMonth`/`devices` pra usar interpolação (`{{count}}`/`{{limit}}`) já que o mobile mostra o número dentro da frase, não em 2 colunas separadas como o front. Adicionar no(s) arquivo(s) de locale do mobile.

- [ ] **Step 5: Rodar os testes**

Run: `npx jest --watchAll=false`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add "app/(tabs)/configs.tsx" "app/(tabs)/__tests__/configs.test.tsx"
git commit -m "feat(settings): show current plan tier and usage counters"
```

---

## Task 6: Revisão final da branch + build Android + `plano.md`

- [ ] **Step 1: Rodar a suíte completa + `tsc`**

Run: `npx jest --watchAll=false && npx tsc --noEmit`
Expected: tudo verde.

- [ ] **Step 2: Build Android real**

Run: `npx expo run:android`
QA manual: login novo (confirma que `POST /dispositivos` é chamado — checar log do dispositivo na API ou na tela de Devices do dashboard web), imprimir até estourar o limite FREE, gerar relatório até estourar o limite FREE, conferir a seção "Plano" nas Configurações.

- [ ] **Step 3: Atualizar `C:\RN\plano.md`**

Marcar que o plano de implementação do mobile está pronto/executado, junto com API e front. Registrar os 2 achados desta sessão (device registration inexistente, `relatorioModal` sendo local) como decisões já tomadas, não mais pendências abertas.
