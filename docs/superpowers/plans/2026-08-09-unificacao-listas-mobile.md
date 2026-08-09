# Unificação visual das listas mobile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unificar o padrão visual de pedidos/histórico (novo componente `RecordCard`, aproximando do padrão de tabela do site) e dar polish de botão consistente em produtos/venda, resolvendo de passagem o campo "criado por" (hoje só guarda ID, não nome) e um bug de delete morto em `PedidoItem`.

**Architecture:** Dois componentes novos em `components/ui/` (`IconButton`, `RecordCard`) consumidos por `PedidoItem.tsx` e um `VendaItem.tsx` novo (extraído de `historico.tsx`). `ProductItemVenda.tsx`/`Product.tsx` só trocam botões crus por `IconButton`, sem mudar de estrutura. Pré-requisito de dados: API (`obterAlteracoes`) passa a incluir o nome do vendedor no pull, schema local ganha coluna `criado_por_nome`, sync pull-apply e criação local passam a gravá-la.

**Tech Stack:** React Native (Expo SDK 52) + TypeScript, `expo-sqlite`, `@expo/vector-icons/FontAwesome`. API: Bun + Express + Prisma.

## Global Constraints

- Branch mobile: `feat/design-system-mobile-listas`, a partir de `feat/design-system-mobile` (não `dev` — depende dos tokens/componentes da Fase 5, ainda não mergeados).
- Branch api: `feat/sincronizacao-criado-por-nome`, a partir de `dev`.
- Comando de teste correto no mobile é `npx jest --watchAll=false` (o script `"test"` do `package.json` usa `--watchAll` e trava non-interactive — achado documentado em `plano.md`).
- Sem teste de snapshot/render novo para componentes puramente visuais (`IconButton`/`RecordCard`) — mesmo padrão da Fase 5 (só lógica pura é testada, ex.: `getStatusColor`).
- `tsc --noEmit` limpo é requisito de cada task que mexe em `.tsx`/`.ts`.
- Aditivo apenas no schema/sync — nenhuma coluna ou comportamento existente muda, só adiciona `criado_por_nome`.

---

## Task 1: Preparar branches (api + mobile)

**Files:** nenhum arquivo — só setup de branch nos 2 repos.

**Interfaces:** N/A.

- [ ] **Step 1: Mobile — commitar o fix de dependência pendente em `feat/design-system-mobile`**

O `expo-asset`/`expo-file-system` já foram instalados de verdade (sem `--no-save`) nesta sessão pra desbloquear o build Android, mas ainda não commitados nessa branch. Rodar em `C:/RN/TozzoBurger` (branch atual `feat/design-system-mobile`):

```bash
git add package.json package-lock.json
git commit -m "fix(mobile): expo-asset/expo-file-system no package.json (não estavam declarados)"
```

- [ ] **Step 2: Mobile — criar a branch nova a partir daqui**

```bash
git checkout -b feat/design-system-mobile-listas
```

- [ ] **Step 3: API — criar a branch nova a partir de `dev`**

Rodar em `C:/RN/api/api-tozzo.uk`:

```bash
git checkout dev
git pull
git checkout -b feat/sincronizacao-criado-por-nome
```

---

## Task 2: API — `obterAlteracoes` inclui nome do vendedor no pull

**Files:**
- Modify: `modules/sincronizacao/sincronizacao.controller.ts:399-465` (função `obterAlteracoes`)

**Interfaces:**
- Consumes: relação Prisma `vendedor` em `Pedido`/`Venda` (`prisma/schema.prisma:124`/`186`, `vendedor Usuario @relation(fields: [usuarioVendedorId], references: [id])`).
- Produces: cada pedido/venda no payload de `/sincronizacao/pull` ganha `vendedor: { id: string, nome: string } | null` (além dos campos que já existiam). Task 6 (mobile) consome esse campo.

- [ ] **Step 1: Adicionar o include nas 4 queries (2 branches × pedidos/vendas)**

Substituir o bloco `if (sinceDate) { ... } else { ... }` (produtos/pedidos/vendas) por esta versão — só `pedidos`/`vendas` mudam, `produtos`/`tiposProduto` ficam iguais:

```ts
        if (sinceDate) {
            produtos = await prisma.produto.findMany({
                where: {
                    estabelecimentoId,
                    OR: [
                        { updatedAt: { gte: sinceDate } },
                        { deletedAt: { gte: sinceDate } }
                    ]
                }
            });

            pedidos = await prisma.pedido.findMany({
                where: {
                    estabelecimentoId,
                    OR: [
                        { updatedAt: { gte: sinceDate } },
                        { deletedAt: { gte: sinceDate } }
                    ]
                },
                include: { itens: true, vendedor: { select: { id: true, nome: true } } }
            });

            vendas = await prisma.venda.findMany({
                where: {
                    estabelecimentoId,
                    OR: [
                        { updatedAt: { gte: sinceDate } }
                    ]
                },
                include: { itens: true, vendedor: { select: { id: true, nome: true } } }
            });
        } else {
            // comportamento anterior quando since NÃO é fornecido
            produtos = await prisma.produto.findMany({ where: { estabelecimentoId } });

            pedidos = await prisma.pedido.findMany({
                where: {
                    estabelecimentoId,
                    OR: [
                        { status: { not: STATUS_PEDIDO.FECHADO } },
                        {
                            AND: [
                                { status: STATUS_PEDIDO.FECHADO },
                                {
                                    OR: [
                                        { updatedAt: { gte: threeDaysAgo } },
                                        { deletedAt: { gte: threeDaysAgo } }
                                    ]
                                }
                            ]
                        }
                    ]
                },
                include: { itens: true, vendedor: { select: { id: true, nome: true } } }
            });

            vendas = await prisma.venda.findMany({
                where: {
                    estabelecimentoId,
                    OR: [
                        { updatedAt: { gte: threeDaysAgo } },
                        { horario: { gte: threeDaysAgo } }
                    ]
                },
                include: { itens: true, vendedor: { select: { id: true, nome: true } } }
            });
        }
```

- [ ] **Step 2: Verificar tipos**

Run: `bunx tsc --noEmit` (em `C:/RN/api/api-tozzo.uk`)

- [ ] **Step 3: Testar manualmente contra a api local (já rodando nesta sessão em `http://localhost:3001`)**

Run (com um token válido — usar o mesmo token que o app mobile já usa, ou gerar via `POST /auth/login`):

```bash
curl -s "http://localhost:3001/sincronizacao/pull" -H "Authorization: Bearer <TOKEN>" | head -c 2000
```

Expected: pedidos/vendas no JSON de resposta trazem um campo `"vendedor":{"id":"...","nome":"..."}` (ou `null` se `usuarioVendedorId` for de um usuário fora do estabelecimento).

- [ ] **Step 4: Rodar suíte da api**

Run: `bun test` (em `C:/RN/api/api-tozzo.uk`)
Expected: 123 testes continuam passando (nenhum teste cobre `sincronizacao` hoje — ver `plano.md`, `payments`/`graficos` são os únicos módulos sem cobertura citados, mas `sincronizacao` também não tem arquivo em `tests/` — confirmar rodando; se não houver teste pra esse módulo, nenhuma regressão é esperada nos que existem).

- [ ] **Step 5: Commit**

```bash
git add modules/sincronizacao/sincronizacao.controller.ts
git commit -m "feat(sync): obterAlteracoes inclui nome do vendedor (pedidos/vendas)"
```

---

## Task 3: Mobile — schema local ganha `criado_por_nome`

**Files:**
- Modify: `database/initializeDatabase.ts`

**Interfaces:**
- Consumes: nada.
- Produces: colunas `TB_PEDIDOS.criado_por_nome` e `TB_VENDAS.criado_por_nome` (`TEXT NULL`), disponíveis via `SELECT *` (todas as queries de leitura já usam `SELECT *`, não precisam mudar). `SCHEMA_VERSION` sobe pra `1005`.

- [ ] **Step 1: Bump da versão e novas colunas nos `CREATE TABLE`**

Em `database/initializeDatabase.ts:4`, trocar:

```ts
  const SCHEMA_VERSION = 1004; //when update the DB schema, increment this value
```

por:

```ts
  const SCHEMA_VERSION = 1005; //when update the DB schema, increment this value
```

Em `database/initializeDatabase.ts:50-63` (bloco `CREATE TABLE IF NOT EXISTS TB_VENDAS`), trocar:

```ts
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS TB_VENDAS (
      id VARCHAR(36) PRIMARY KEY NOT NULL,
      total REAL NOT NULL,
      horario TEXT NOT NULL,
      cliente TEXT NULL,
      excluida BOOLEAN NULL,
      origemVendaId VARCHAR(36) NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER NULL,
      sync_status TEXT DEFAULT 'synced',
      criado_por TEXT NULL
    );
  `);
```

por:

```ts
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS TB_VENDAS (
      id VARCHAR(36) PRIMARY KEY NOT NULL,
      total REAL NOT NULL,
      horario TEXT NOT NULL,
      cliente TEXT NULL,
      excluida BOOLEAN NULL,
      origemVendaId VARCHAR(36) NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER NULL,
      sync_status TEXT DEFAULT 'synced',
      criado_por TEXT NULL,
      criado_por_nome TEXT NULL
    );
  `);
```

Em `database/initializeDatabase.ts:65-78` (bloco `CREATE TABLE IF NOT EXISTS TB_PEDIDOS`), trocar:

```ts
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS TB_PEDIDOS (
      id VARCHAR(36) PRIMARY KEY NOT NULL,
      total REAL NOT NULL,
      horario TEXT NOT NULL,
      cliente TEXT NULL,
      status TEXT NOT NULL,
      origemPedidoId VARCHAR(36) NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER NULL,
      sync_status TEXT DEFAULT 'synced',
      criado_por TEXT NULL
    );
  `);
```

por:

```ts
  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS TB_PEDIDOS (
      id VARCHAR(36) PRIMARY KEY NOT NULL,
      total REAL NOT NULL,
      horario TEXT NOT NULL,
      cliente TEXT NULL,
      status TEXT NOT NULL,
      origemPedidoId VARCHAR(36) NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER NULL,
      sync_status TEXT DEFAULT 'synced',
      criado_por TEXT NULL,
      criado_por_nome TEXT NULL
    );
  `);
```

- [ ] **Step 2: Migração pra instalações existentes (`ALTER TABLE`)**

Em `database/initializeDatabase.ts:159-168`, logo depois do bloco `ALTER TABLE TB_VENDAS ADD COLUMN criado_por`, adicionar (dentro do mesmo `if (existing && ...)`, mesmo padrão try/catch dos outros):

```ts
      try {
        await database.execAsync(`ALTER TABLE TB_PEDIDOS ADD COLUMN criado_por_nome TEXT NULL;`);
      } catch (err) {
        // ignore if column already exists
      }
      try {
        await database.execAsync(`ALTER TABLE TB_VENDAS ADD COLUMN criado_por_nome TEXT NULL;`);
      } catch (err) {
        // ignore if column already exists
      }
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add database/initializeDatabase.ts
git commit -m "feat(mobile): schema ganha criado_por_nome em TB_PEDIDOS/TB_VENDAS"
```

---

## Task 4: Mobile — tipos `PedidoDatabase`/`VendaDatabase`

**Files:**
- Modify: `database/types/Pedido.ts`
- Modify: `database/types/Venda.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `PedidoDatabase.criado_por_nome?: string | null`, `VendaDatabase.criado_por_nome?: string | null` — consumidos por Task 8 (`PedidoItem`) e Task 9 (`VendaItem`).

- [ ] **Step 1: `database/types/Pedido.ts`**

Trocar:

```ts
export type PedidoDatabase = {
  id: string;
  total: number;
  horario: string;
  cliente?: string | null;
  status: string;
  updated_at: number;
  deleted_at?: number | null;
  sync_status?: string | null;
  criado_por?: string | null;
};
```

por:

```ts
export type PedidoDatabase = {
  id: string;
  total: number;
  horario: string;
  cliente?: string | null;
  status: string;
  updated_at: number;
  deleted_at?: number | null;
  sync_status?: string | null;
  criado_por?: string | null;
  criado_por_nome?: string | null;
};
```

- [ ] **Step 2: `database/types/Venda.ts`**

Trocar:

```ts
export type VendaDatabase = {
    id: string;
    total: number;
    horario: string;
    cliente?: string | null;
    excluida: boolean;
    updated_at: number;
    deleted_at?: number | null;
    sync_status?: string | null;
    criado_por?: string | null;
};
```

por:

```ts
export type VendaDatabase = {
    id: string;
    total: number;
    horario: string;
    cliente?: string | null;
    excluida: boolean;
    updated_at: number;
    deleted_at?: number | null;
    sync_status?: string | null;
    criado_por?: string | null;
    criado_por_nome?: string | null;
};
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add database/types/Pedido.ts database/types/Venda.ts
git commit -m "feat(mobile): tipos ganham criado_por_nome"
```

---

## Task 5: Mobile — sync pull-apply grava `criado_por_nome`

**Files:**
- Modify: `database/useSyncDatabase.ts:302-333` (upsert de pedidos)
- Modify: `database/useSyncDatabase.ts:343-405` (upsert de vendas — linhas mudam depois do Step 1 alterar as de pedidos, usar os marcadores de código pra localizar)

**Interfaces:**
- Consumes: `ped.vendedor?.nome`/`ven.vendedor?.nome` (Task 2, campo novo no payload de `/sincronizacao/pull`).
- Produces: `TB_PEDIDOS.criado_por_nome`/`TB_VENDAS.criado_por_nome` preenchidos a cada pull.

- [ ] **Step 1: Upsert de pedidos — capturar e gravar o nome**

Trocar (dentro do loop `for (const ped of changes.pedidos)`):

```ts
          const criadoPor = ped.usuarioVendedorId ? String(ped.usuarioVendedorId) : (ped.vendedor?.id ? String(ped.vendedor.id) : null);

          if (!local) {
            await database.runAsync(
              'INSERT INTO TB_PEDIDOS (id, total, horario, cliente, status, updated_at, deleted_at, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
              [id, Number(ped.total ?? 0), horario, cliente, status, updatedAt, deletedAt, criadoPor]
            ).catch((e) => console.warn('[sync] db op failed', e));
            for (const it of itensArray) {
              const produtoId = String(it.produtoId);
              const relId = it.id ? String(it.id) : generateUUID();
              await database.runAsync(
                'INSERT INTO RL_PEDIDO_PRODUTO (id, pedidoId, produtoId, quantidade) VALUES (?, ?, ?, ?)',
                [relId, id, produtoId, Number(it.quantidade ?? 1)]
              ).catch((e) => console.warn('[sync] db op failed', e));
            }
          } else {
            const localUpdated = Number(local.updated_at || 0);
            if (updatedAt >= localUpdated) {
              await database.runAsync(
                'UPDATE TB_PEDIDOS SET total = ?, horario = ?, cliente = ?, status = ?, updated_at = ?, deleted_at = ?, criado_por = ?, sync_status = ? WHERE id = ?',
                [Number(ped.total ?? 0), horario, cliente, status, updatedAt, deletedAt, criadoPor, 'synced', id]
              ).catch((e) => console.warn('[sync] db op failed', e));
```

por:

```ts
          const criadoPor = ped.usuarioVendedorId ? String(ped.usuarioVendedorId) : (ped.vendedor?.id ? String(ped.vendedor.id) : null);
          const criadoPorNome = ped.vendedor?.nome ? String(ped.vendedor.nome) : null;

          if (!local) {
            await database.runAsync(
              'INSERT INTO TB_PEDIDOS (id, total, horario, cliente, status, updated_at, deleted_at, criado_por, criado_por_nome) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [id, Number(ped.total ?? 0), horario, cliente, status, updatedAt, deletedAt, criadoPor, criadoPorNome]
            ).catch((e) => console.warn('[sync] db op failed', e));
            for (const it of itensArray) {
              const produtoId = String(it.produtoId);
              const relId = it.id ? String(it.id) : generateUUID();
              await database.runAsync(
                'INSERT INTO RL_PEDIDO_PRODUTO (id, pedidoId, produtoId, quantidade) VALUES (?, ?, ?, ?)',
                [relId, id, produtoId, Number(it.quantidade ?? 1)]
              ).catch((e) => console.warn('[sync] db op failed', e));
            }
          } else {
            const localUpdated = Number(local.updated_at || 0);
            if (updatedAt >= localUpdated) {
              await database.runAsync(
                'UPDATE TB_PEDIDOS SET total = ?, horario = ?, cliente = ?, status = ?, updated_at = ?, deleted_at = ?, criado_por = ?, criado_por_nome = ?, sync_status = ? WHERE id = ?',
                [Number(ped.total ?? 0), horario, cliente, status, updatedAt, deletedAt, criadoPor, criadoPorNome, 'synced', id]
              ).catch((e) => console.warn('[sync] db op failed', e));
```

- [ ] **Step 2: Upsert de vendas — capturar e gravar o nome**

Trocar (dentro do loop `for (const ven of changes.vendas)`):

```ts
          const venCriadoPor = ven.usuarioVendedorId ? String(ven.usuarioVendedorId) : (ven.vendedor?.id ? String(ven.vendedor.id) : null);

          const local = await database.getFirstAsync<{ updated_at?: number }>(`SELECT updated_at FROM TB_VENDAS WHERE id = ?`, [id]).catch(() => null);

          if (!local) {
            await database.runAsync(
              'INSERT INTO TB_VENDAS (id, total, horario, cliente, excluida, updated_at, deleted_at, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
              [id, Number(ven.total ?? 0), horario, cliente, excluida, updatedAt, deletedAt, venCriadoPor]
            ).catch((e) => console.warn('[sync] db op failed', e));
            for (const it of itensArray) {
              const produtoId = String(it.produtoId);
              const relId = it.id ? String(it.id) : generateUUID();
              await database.runAsync(
                'INSERT INTO RL_VENDA_PRODUTO (id, vendaId, produtoId, quantidade) VALUES (?, ?, ?, ?)',
                [relId, id, produtoId, Number(it.quantidade ?? 1)]
              ).catch((e) => console.warn('[sync] db op failed', e));
            }
          } else {
            const localUpdated = Number(local.updated_at || 0);
            if (updatedAt >= localUpdated) {
              await database.runAsync(
                'UPDATE TB_VENDAS SET total = ?, horario = ?, cliente = ?, excluida = ?, updated_at = ?, deleted_at = ?, criado_por = ?, sync_status = ? WHERE id = ?',
                [Number(ven.total ?? 0), horario, cliente, excluida, updatedAt, deletedAt, venCriadoPor, 'synced', id]
              ).catch((e) => console.warn('[sync] db op failed', e));
```

por:

```ts
          const venCriadoPor = ven.usuarioVendedorId ? String(ven.usuarioVendedorId) : (ven.vendedor?.id ? String(ven.vendedor.id) : null);
          const venCriadoPorNome = ven.vendedor?.nome ? String(ven.vendedor.nome) : null;

          const local = await database.getFirstAsync<{ updated_at?: number }>(`SELECT updated_at FROM TB_VENDAS WHERE id = ?`, [id]).catch(() => null);

          if (!local) {
            await database.runAsync(
              'INSERT INTO TB_VENDAS (id, total, horario, cliente, excluida, updated_at, deleted_at, criado_por, criado_por_nome) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [id, Number(ven.total ?? 0), horario, cliente, excluida, updatedAt, deletedAt, venCriadoPor, venCriadoPorNome]
            ).catch((e) => console.warn('[sync] db op failed', e));
            for (const it of itensArray) {
              const produtoId = String(it.produtoId);
              const relId = it.id ? String(it.id) : generateUUID();
              await database.runAsync(
                'INSERT INTO RL_VENDA_PRODUTO (id, vendaId, produtoId, quantidade) VALUES (?, ?, ?, ?)',
                [relId, id, produtoId, Number(it.quantidade ?? 1)]
              ).catch((e) => console.warn('[sync] db op failed', e));
            }
          } else {
            const localUpdated = Number(local.updated_at || 0);
            if (updatedAt >= localUpdated) {
              await database.runAsync(
                'UPDATE TB_VENDAS SET total = ?, horario = ?, cliente = ?, excluida = ?, updated_at = ?, deleted_at = ?, criado_por = ?, criado_por_nome = ?, sync_status = ? WHERE id = ?',
                [Number(ven.total ?? 0), horario, cliente, excluida, updatedAt, deletedAt, venCriadoPor, venCriadoPorNome, 'synced', id]
              ).catch((e) => console.warn('[sync] db op failed', e));
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Rodar suíte**

Run: `npx jest --watchAll=false`
Expected: todos os testes existentes continuam passando (nenhum testa upsert de pull diretamente, mas confirma que a cadeia de imports/tipos não quebrou).

- [ ] **Step 5: Commit**

```bash
git add database/useSyncDatabase.ts
git commit -m "feat(mobile): pull-apply grava criado_por_nome em pedidos/vendas"
```

---

## Task 6: Mobile — criação local grava `criado_por_nome` de imediato

**Files:**
- Modify: `database/usePedidoDatabase.ts:36-64` (`createPedido`)
- Modify: `database/useVendaDatabse.ts:8-28` (`createVenda`)
- Modify: `app/modais/contaModal.tsx:72` e `:105`
- Modify: `app/modais/pedidoModal.tsx:120`

**Interfaces:**
- Consumes: `user?.nome` (já disponível via `useAuth()` nos 3 call sites).
- Produces: `createPedido(produtos, cliente?, status?, criadoPor?, criadoPorNome?)`, `createVenda(produtos, cliente?, criadoPor?, criadoPorNome?)` — 5º/4º parâmetro novo, opcional, não quebra nenhum outro chamador.

- [ ] **Step 1: `database/usePedidoDatabase.ts` — `createPedido` ganha o parâmetro**

Trocar:

```ts
  async function createPedido(
    produtos: PedidoProduto[],
    cliente?: string,
    status: PedidoStatus = STATUS_PEDIDO.ABERTO,
    criadoPor?: string | number | null
  ) {
    const stmt = await database.prepareAsync(
      "INSERT INTO TB_PEDIDOS (id, total, horario, cliente, status, updated_at, sync_status, criado_por) VALUES ($id, $total, $horario, $cliente, $status, $updated_at, $sync_status, $criado_por)"
    );

    try {
      const total = await calculateTotal(produtos);
      const horario = new Date().toISOString();

      if (!isValidStatus(status)) throw new Error('Status inválido');

      const pedidoId = generateUUID();
      const updatedAt = Date.now();

      await stmt.executeAsync({
        $id: pedidoId,
        $total: total,
        $horario: horario,
        $cliente: cliente ?? null,
        $status: status,
        $updated_at: updatedAt,
        $sync_status: 'pending',
        $criado_por: criadoPor != null ? String(criadoPor) : null,
      });
```

por:

```ts
  async function createPedido(
    produtos: PedidoProduto[],
    cliente?: string,
    status: PedidoStatus = STATUS_PEDIDO.ABERTO,
    criadoPor?: string | number | null,
    criadoPorNome?: string | null
  ) {
    const stmt = await database.prepareAsync(
      "INSERT INTO TB_PEDIDOS (id, total, horario, cliente, status, updated_at, sync_status, criado_por, criado_por_nome) VALUES ($id, $total, $horario, $cliente, $status, $updated_at, $sync_status, $criado_por, $criado_por_nome)"
    );

    try {
      const total = await calculateTotal(produtos);
      const horario = new Date().toISOString();

      if (!isValidStatus(status)) throw new Error('Status inválido');

      const pedidoId = generateUUID();
      const updatedAt = Date.now();

      await stmt.executeAsync({
        $id: pedidoId,
        $total: total,
        $horario: horario,
        $cliente: cliente ?? null,
        $status: status,
        $updated_at: updatedAt,
        $sync_status: 'pending',
        $criado_por: criadoPor != null ? String(criadoPor) : null,
        $criado_por_nome: criadoPorNome ?? null,
      });
```

- [ ] **Step 2: `database/useVendaDatabse.ts` — `createVenda` ganha o parâmetro**

Trocar:

```ts
    async function createVenda(produtos: { produtoId: string; quantidade: number }[], cliente?: string, criadoPor?: string | number | null) {
        const statementVenda = await database.prepareAsync(
            "INSERT INTO TB_VENDAS (id, total, horario, cliente, updated_at, sync_status, criado_por) VALUES ($id, $total, $horario, $cliente, $updated_at, $sync_status, $criado_por)"
        );

        try {
            const total = await calculateTotal(produtos);
            const horario = new Date().toISOString();

                        const vendaId = generateUUID();
                        const updatedAt = Date.now();

                        await statementVenda.executeAsync({
                            $id: vendaId,
                            $total: total,
                            $horario: horario,
                            $cliente: cliente ?? null,
                            $updated_at: updatedAt,
                            $sync_status: 'pending',
                            $criado_por: criadoPor != null ? String(criadoPor) : null,
                        });
```

por:

```ts
    async function createVenda(produtos: { produtoId: string; quantidade: number }[], cliente?: string, criadoPor?: string | number | null, criadoPorNome?: string | null) {
        const statementVenda = await database.prepareAsync(
            "INSERT INTO TB_VENDAS (id, total, horario, cliente, updated_at, sync_status, criado_por, criado_por_nome) VALUES ($id, $total, $horario, $cliente, $updated_at, $sync_status, $criado_por, $criado_por_nome)"
        );

        try {
            const total = await calculateTotal(produtos);
            const horario = new Date().toISOString();

                        const vendaId = generateUUID();
                        const updatedAt = Date.now();

                        await statementVenda.executeAsync({
                            $id: vendaId,
                            $total: total,
                            $horario: horario,
                            $cliente: cliente ?? null,
                            $updated_at: updatedAt,
                            $sync_status: 'pending',
                            $criado_por: criadoPor != null ? String(criadoPor) : null,
                            $criado_por_nome: criadoPorNome ?? null,
                        });
```

- [ ] **Step 3: `app/modais/contaModal.tsx` — passar o nome nos 2 call sites**

Trocar (`:72`):

```ts
      const { vendaId } = await createVenda(produtos, cliente, user?.id);
```

por:

```ts
      const { vendaId } = await createVenda(produtos, cliente, user?.id, user?.nome ?? null);
```

Trocar (`:105`):

```ts
      const { pedidoId } = await createPedido(produtos, cliente, undefined, user?.id);
```

por:

```ts
      const { pedidoId } = await createPedido(produtos, cliente, undefined, user?.id, user?.nome ?? null);
```

- [ ] **Step 4: `app/modais/pedidoModal.tsx` — passar o nome**

Trocar (`:120`):

```ts
      const { vendaId } = await createVenda(produtos, cliente ?? '', user?.id);
```

por:

```ts
      const { vendaId } = await createVenda(produtos, cliente ?? '', user?.id, user?.nome ?? null);
```

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 6: Rodar suíte**

Run: `npx jest --watchAll=false`

- [ ] **Step 7: Commit**

```bash
git add database/usePedidoDatabase.ts database/useVendaDatabse.ts app/modais/contaModal.tsx app/modais/pedidoModal.tsx
git commit -m "feat(mobile): criação local grava criado_por_nome (não espera round-trip de sync)"
```

---

## Task 7: `components/ui/IconButton.tsx` (novo)

**Files:**
- Create: `components/ui/IconButton.tsx`

**Interfaces:**
- Consumes: `Colors` (`constants/Colors.ts`), `Colors.status.danger`.
- Produces: `IconButton({ icon: FontAwesomeGlyphName, label: string, onPress: () => void, disabled?: boolean, destructive?: boolean, loading?: boolean, size?: number })` — botão quadrado ghost, 36×36, ícone `FontAwesome`, `ActivityIndicator` no lugar do ícone quando `loading`. Consumido por Task 9 (`RecordCard`), Task 11 (`ProductItemVenda`), Task 12 (`Product`).

- [ ] **Step 1: Criar o componente**

```tsx
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useColorScheme } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Colors from '@/constants/Colors';

type Props = {
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  label: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
  loading?: boolean;
  size?: number;
  color?: string; // sobrescreve a cor padrão — usado quando o ícone fica sobre um
                  // fundo colorido (ex.: dentro de um botão circular preenchido)
                  // e a lógica padrão (texto/muted/danger) daria baixo contraste.
};

export function IconButton({ icon, label, onPress, disabled, destructive, loading, size = 18, color: colorOverride }: Props) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const isDisabled = disabled || loading;
  const color = colorOverride ?? (isDisabled ? colors.textMuted : destructive ? Colors.status.danger : colors.text);

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={isDisabled}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.base, pressed && !isDisabled ? styles.pressed : null]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <FontAwesome name={icon} size={size} color={color} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  pressed: {
    opacity: 0.6,
  },
});
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add components/ui/IconButton.tsx
git commit -m "feat(mobile): componente IconButton (botão ghost quadrado, espelha o site)"
```

---

## Task 8: `components/ui/RecordCard.tsx` (novo)

**Files:**
- Create: `components/ui/RecordCard.tsx`

**Interfaces:**
- Consumes: `Card` (`components/ui/Card.tsx`), `Badge` (`components/ui/Badge.tsx`), `IconButton` (Task 7), `Colors`, `spacing/type` (`constants/theme.ts`).
- Produces:
  ```ts
  export type RecordCardAction = {
    icon: React.ComponentProps<typeof FontAwesome>['name'];
    label: string;
    onPress: () => void;
    disabled?: boolean;
    destructive?: boolean;
    loading?: boolean;
  };

  RecordCard({
    accentColor: string;
    title: string;
    subtitle?: string;
    meta?: string;
    total: number;
    badge?: { label: string; color: string };
    strikethrough?: boolean;
    actions: RecordCardAction[];
  })
  ```
  Consumido por Task 10 (`PedidoItem`) e Task 11 (`VendaItem`).

**Nota de implementação**: a barra de cor é um `View` de 4px de largura como primeiro filho de um container `flexDirection: 'row'` (não posicionamento absoluto como o site — RN não tem o problema de `border-collapse` que motivou a técnica do site; `overflow: 'hidden'` no container garante que a barra não vaze pelos cantos arredondados do `Card`). O divisor tracejado é *dentro* do card, entre o bloco de info e a fileira de ações — não entre cards da lista (cada `RecordCard` já é um `Card` com borda própria nas 4 bordas).

- [ ] **Step 1: Criar o componente**

```tsx
import React from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { IconButton } from '@/components/ui/IconButton';
import Colors from '@/constants/Colors';
import { spacing, type } from '@/constants/theme';

export type RecordCardAction = {
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  label: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
  loading?: boolean;
};

type Props = {
  accentColor: string;
  title: string;
  subtitle?: string;
  meta?: string;
  total: number;
  badge?: { label: string; color: string };
  strikethrough?: boolean;
  actions: RecordCardAction[];
};

export function RecordCard({ accentColor, title, subtitle, meta, total, badge, strikethrough, actions }: Props) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const strike = strikethrough ? { textDecorationLine: 'line-through' as const, color: colors.textMuted } : null;

  return (
    <Card padding={0} style={styles.container}>
      <View style={[styles.accent, { backgroundColor: accentColor }]} />
      <View style={styles.content}>
        <View style={styles.mainRow}>
          <View style={styles.textBlock}>
            <Text style={[styles.title, { color: colors.text }, strike]} numberOfLines={1}>{title}</Text>
            {subtitle ? (
              <Text style={[styles.subtitle, { color: colors.textMuted }, strike]} numberOfLines={1}>{subtitle}</Text>
            ) : null}
            {meta ? (
              <Text style={[styles.meta, { color: colors.textMuted }, strike]} numberOfLines={1}>{meta}</Text>
            ) : null}
          </View>
          <View style={styles.trailing}>
            <Text style={[styles.total, { color: colors.text }, strike]}>R$ {total.toFixed(2)}</Text>
            {badge ? <Badge label={badge.label} color={badge.color} /> : null}
          </View>
        </View>
        <View style={[styles.actionsRow, { borderTopColor: colors.border }]}>
          {actions.map((action) => (
            <IconButton
              key={action.label}
              icon={action.icon}
              label={action.label}
              onPress={action.onPress}
              disabled={action.disabled}
              destructive={action.destructive}
              loading={action.loading}
            />
          ))}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', marginBottom: spacing.md, overflow: 'hidden', padding: 0 },
  accent: { width: 4 },
  content: { flex: 1 },
  mainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: spacing.md,
    gap: spacing.sm,
  },
  textBlock: { flex: 1 },
  title: { fontSize: type.body, fontWeight: '700' },
  subtitle: { fontSize: type.bodySm, marginTop: 2 },
  meta: { fontSize: type.caption, marginTop: 2 },
  trailing: { alignItems: 'flex-end', gap: spacing.xs },
  total: { fontSize: type.body, fontWeight: '700' },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
});
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add components/ui/RecordCard.tsx
git commit -m "feat(mobile): componente RecordCard compartilhado (pedidos/histórico)"
```

---

## Task 9: `components/PedidoItem.tsx` (reescrita — usa `RecordCard`)

**Files:**
- Modify: `components/PedidoItem.tsx` (reescrita completa)

**Interfaces:**
- Consumes: `RecordCard`/`RecordCardAction` (Task 8), `getStatusColor`/`getStatusLabel` (`constants/status.ts`), `PedidoDatabase.criado_por_nome` (Task 4).
- Produces: mesma assinatura pública usada por `pedidos.tsx` — `PedidoItem({ data: PedidoDatabase, index?: number, onEdit: () => void, onDelete?: () => void })`, `export default`.
- **Mudança de interação deliberada** (mesma categoria da simplificação já feita na Fase 5 pra esse arquivo): antes, tocar em qualquer lugar do header (nome do cliente) abria a edição. Agora só o ícone de lápis abre — igual ao comportamento do site (`PedidosTab.tsx`, clique na linha não faz nada, só os `IconButton` da coluna de ações). `index` continua recebido mas não usado (mesmo comportamento de antes — nunca foi usado no JSX).
- **Corrige o bug encontrado no planejamento**: `onDelete` agora é renderizado de verdade (ícone de lixeira) quando informado — antes era recebido e nunca usado.

- [ ] **Step 1: Substituir o arquivo inteiro**

```tsx
import React, { useEffect, useState } from 'react';
import { RecordCard, RecordCardAction } from '@/components/ui/RecordCard';
import { getStatusColor, getStatusLabel } from '@/constants/status';
import { PedidoDatabase } from '@/database/types/Pedido';
import { usePedidosDatabase } from '@/database/usePedidoDatabase';

type Props = {
  data: PedidoDatabase;
  index?: number;
  onEdit: () => void;
  onDelete?: () => void;
};

export function PedidoItem({ data, onEdit, onDelete }: Props) {
  const statusLabel = data.status ?? 'DESCONHECIDO';
  const { getProdutosByPedidoId } = usePedidosDatabase();
  const [produtos, setProdutos] = useState<{ nome: string; quantidade: number }[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const p = await getProdutosByPedidoId(data.id);
        if (mounted) setProdutos(Array.isArray(p) ? p : []);
      } catch (err) {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, [data.id, data.updated_at]);

  const horaFormatada = new Date(data.horario).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const autorTrecho = data.criado_por_nome ? `Criado por ${data.criado_por_nome} · ` : '';

  const actions: RecordCardAction[] = [
    { icon: 'pencil', label: 'Editar pedido', onPress: onEdit },
  ];
  if (onDelete) {
    actions.push({ icon: 'trash', label: 'Excluir pedido', onPress: onDelete, destructive: true });
  }

  return (
    <RecordCard
      accentColor={getStatusColor(statusLabel)}
      badge={{ label: getStatusLabel(statusLabel), color: getStatusColor(statusLabel) }}
      title={(data.cliente && String(data.cliente).trim().length > 0) ? data.cliente : 'Cliente não Informado'}
      subtitle={
        produtos.length > 0
          ? `${produtos.slice(0, 3).map((p) => `(${p.quantidade}x) ${p.nome}`).join(', ')}${produtos.length > 3 ? ' ...' : ''}`
          : undefined
      }
      meta={`${autorTrecho}${horaFormatada}`}
      total={data.total ?? 0}
      actions={actions}
    />
  );
}

export default PedidoItem;
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Rodar suíte**

Run: `npx jest --watchAll=false`

- [ ] **Step 4: Commit**

```bash
git add components/PedidoItem.tsx
git commit -m "refactor(mobile): PedidoItem usa RecordCard, corrige delete morto"
```

---

## Task 10: `components/VendaItem.tsx` (novo — extraído de `historico.tsx`)

**Files:**
- Create: `components/VendaItem.tsx`

**Interfaces:**
- Consumes: `RecordCard`/`RecordCardAction` (Task 8), `getStatusColor` (`constants/status.ts`), `VendaDatabase.criado_por_nome` (Task 4).
- Produces: `VendaItem({ data: VendaDatabase & { produtos: string[] }, index: number, onView: () => void, onPrint: () => void, onDelete: () => void, printing?: boolean })`. Consumido por Task 11 (`historico.tsx`).

- [ ] **Step 1: Criar o componente**

```tsx
import React from 'react';
import { RecordCard, RecordCardAction } from '@/components/ui/RecordCard';
import { getStatusColor } from '@/constants/status';
import { VendaDatabase } from '@/database/types/Venda';

type Props = {
  data: VendaDatabase & { produtos: string[] };
  index: number;
  onView: () => void;
  onPrint: () => void;
  onDelete: () => void;
  printing?: boolean;
};

export function VendaItem({ data, index, onView, onPrint, onDelete, printing }: Props) {
  const excluida = data.excluida === true;
  const horaFormatada = new Date(data.horario).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const autorTrecho = data.criado_por_nome ? `Criado por ${data.criado_por_nome} · ` : '';

  const actions: RecordCardAction[] = [
    { icon: 'eye', label: 'Ver detalhes', onPress: onView, disabled: excluida },
    { icon: 'print', label: 'Imprimir', onPress: onPrint, disabled: excluida, loading: printing },
    { icon: 'trash', label: 'Excluir venda', onPress: onDelete, disabled: excluida, destructive: true },
  ];

  return (
    <RecordCard
      accentColor={getStatusColor('FECHADO')}
      title={(data.cliente && String(data.cliente).trim().length > 0) ? data.cliente : 'Cliente não Informado'}
      subtitle={data.produtos.length > 0 ? data.produtos.join(', ') : undefined}
      meta={`Venda #${index + 1} · ${autorTrecho}${horaFormatada}`}
      total={data.total ?? 0}
      strikethrough={excluida}
      actions={actions}
    />
  );
}

export default VendaItem;
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add components/VendaItem.tsx
git commit -m "feat(mobile): componente VendaItem (extraído de historico.tsx)"
```

---

## Task 11: `app/(tabs)/historico.tsx` (reescrita — orquestrador só, usa `VendaItem`)

**Files:**
- Modify: `app/(tabs)/historico.tsx` (reescrita completa)

**Interfaces:**
- Consumes: `VendaItem` (Task 10).
- Produces: mesma tela pública, sem mudança de rota/props (é uma tela, não um componente reusado). Comportamento idêntico ao atual: busca por data (calendário), listagem últimos 3 dias por padrão, ver/imprimir/excluir por venda.

- [ ] **Step 1: Substituir o arquivo inteiro**

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, FlatList, Alert, TouchableOpacity, useColorScheme, ActivityIndicator, Modal, RefreshControl } from 'react-native';
import { Text, View } from '@/components/Themed';
import { useVendasDatabase } from '@/database/useVendaDatabse';
import { useAutoSync } from '@/context/AutoSyncContext';
import { useSyncRefresh } from '@/hooks/useSyncRefresh';
import { VendaDatabase } from '@/database/types/Venda';
import { useProductDatabase } from '@/database/useProductDatabase';
import { usePrinterDatabase } from '@/database/usePrinterDatabase';
import { useFocusEffect, useRouter } from 'expo-router';
import { formatarVendaParaImpressao } from '@/hooks/formatarVendaImpressao';
import { Produto } from '@/hooks/formatarVendaImpressao';
import { sendMessageToDevice } from '@/useBLE';
import { Calendar } from 'react-native-calendars';
import Colors from '@/constants/Colors';
import { EmptyState } from '@/components/ui/EmptyState';
import { VendaItem } from '@/components/VendaItem';
import { spacing, type } from '@/constants/theme';

export default function HistoricoScreen() {
  const [vendas, setVendas] = useState<Record<string, VendaDatabase[]>>({});
  const [searchDate, setSearchDate] = useState(new Date());
  const [showCalendar, setShowCalendar] = useState(false);
  const [loading, setLoading] = useState(true);
  const { listVendasRecentes, listVendasPorDia, removeVenda, getVendaById } = useVendasDatabase();
  const { lastSync } = useAutoSync();
  const { refreshing, onRefresh } = useSyncRefresh();
  const { showAdd } = useProductDatabase();
  const { getPrinter } = usePrinterDatabase();
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const [title, setTitle] = useState('Histórico de Vendas (Últimos 3 dias)');
  const [loadingPrint, setLoadingPrint] = useState<string | null>(null);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      padding: spacing.xl,
    },
    title: {
      fontSize: type.heading,
      fontWeight: 'bold',
      marginBottom: spacing.xl,
    },
    dateContainer: {
      width: '100%',
      marginBottom: spacing.xl,
    },
    label: {
      fontSize: type.body,
      marginBottom: spacing.sm,
      fontWeight: '500',
    },
    dateButton: {
      padding: spacing.md,
      borderRadius: 8,
      width: '100%',
      borderWidth: 1,
      borderColor: colors.border,
    },
    dateText: {
      fontSize: type.body,
    },
    separator: {
      marginVertical: spacing.sm,
      height: 1,
    },
    dateHeader: {
      fontSize: type.subtitle,
      fontWeight: 'bold',
      marginVertical: spacing.sm,
    },
    searchButton: {
      backgroundColor: colors.primary,
      padding: spacing.md,
      borderRadius: 8,
      width: '100%',
      alignItems: 'center',
    },
    searchButtonText: {
      color: colors.background,
      fontSize: type.body,
      fontWeight: 'bold',
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    calendarContainer: {
      width: '90%',
      padding: spacing.xl,
      borderRadius: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
      elevation: 5,
    },
    modalTitle: {
      fontSize: type.subtitle,
      fontWeight: 'bold',
      marginBottom: spacing.lg,
      textAlign: 'center',
    },
    closeButton: {
      backgroundColor: colors.primary,
      padding: spacing.md,
      borderRadius: 8,
      alignItems: 'center',
      marginTop: spacing.lg,
    },
    closeButtonText: {
      color: colors.background,
      fontSize: type.body,
      fontWeight: 'bold',
    },
  });

  const fetchVendas = useCallback(async () => {
    try {
      setTitle('Histórico de Vendas (Últimos 3 dias)');
      const vendasData = await listVendasRecentes();
      setVendas(vendasData);
      setLoading(false);
    } catch (error) {
      console.error(error);
      Alert.alert('Erro', 'Não foi possível carregar o histórico de vendas.');
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setSearchDate(new Date());
      fetchVendas();
    }, [fetchVendas])
  );

  useEffect(() => {
    fetchVendas();
  }, [lastSync]);

  const formatCalendarDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleSearch = async () => {
    setLoading(true);
    setTitle(`Histórico de Vendas (${searchDate.toLocaleDateString('pt-BR')})`);
    const formattedDate = formatCalendarDate(searchDate);

    try {
      const vendasData = await listVendasPorDia(formattedDate);
      setVendas({ [searchDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })]: vendasData });
    } catch (error) {
      console.error(error);
      Alert.alert('Erro', 'Não foi possível buscar as vendas para a data especificada.');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = async (vendaId: string) => {
    setLoadingPrint(vendaId);
    let venda = await getVendaById(vendaId);
    if (!venda) {
      setLoadingPrint(null);
      return;
    }

    const produtos: Produto[] = await Promise.all(
      venda.produtos.map(async (produto) => {
        let prodInfos = await showAdd(produto.produtoId);
        return {
          nome: prodInfos?.nome ?? 'Produto desconhecido',
          quantidade: produto.quantidade,
          preco: prodInfos?.preco ?? 0,
        };
      })
    );

    let printContent = await formatarVendaParaImpressao(venda, produtos);

    try {
      await sendMessageToDevice(printContent, await getPrinter());
      Alert.alert('Sucesso', 'Conta enviada para impressão.');
    } catch (error) {
      Alert.alert('Erro', `${error}`);
    } finally {
      setLoadingPrint(null);
    }
  };

  const handleExcluir = (vendaId: string) => {
    Alert.alert(
      'Confirmar Exclusão',
      'Tem certeza de que deseja excluir esta venda?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          onPress: async () => {
            try {
              await removeVenda(vendaId);
              setVendas((prevVendas) => {
                const updatedVendas = { ...prevVendas };
                Object.entries(updatedVendas).forEach(([data, vendasPorData]) => {
                  updatedVendas[data] = vendasPorData.map((venda) =>
                    venda.id === vendaId ? { ...venda, excluida: true } : venda
                  );
                });
                return updatedVendas;
              });
            } catch (error) {
              console.error(error);
              Alert.alert('Erro', 'Não foi possível excluir a venda.');
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const renderVendaItem = ({ item, index }: { item: VendaDatabase & { produtos: string[] }; index: number }) => (
    <VendaItem
      data={item}
      index={index}
      onView={() => router.push(`/modais/contaHistoricoModal?vendaId=${item.id}`)}
      onPrint={() => handlePrint(item.id)}
      onDelete={() => handleExcluir(item.id)}
      printing={loadingPrint === item.id}
    />
  );

  const renderVendasPorData = (data: string, vendasDoDia: (VendaDatabase & { produtos: string[] })[]) => {
    const totalVendas = vendasDoDia
      .filter((venda) => venda.excluida != true)
      .reduce((acc, venda) => acc + venda.total, 0)
      .toFixed(2);

    const hoje = new Date();
    const ontem = new Date(hoje);
    ontem.setDate(hoje.getDate() - 1);

    const [dia, mes, ano] = data.split('/');
    const dataFormatada = `${ano}-${mes}-${dia}`;

    const dataRenderizada =
      dataFormatada === hoje.toISOString().split('T')[0]
        ? 'Hoje'
        : dataFormatada === ontem.toISOString().split('T')[0]
          ? 'Ontem'
          : data;

    return (
      <View key={data}>
        <Text style={styles.dateHeader}>
          {dataRenderizada} - Total: R$ {totalVendas}
        </Text>
        <FlatList data={vendasDoDia} renderItem={renderVendaItem} keyExtractor={(item) => String(item.id)} />
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>

      <View style={styles.dateContainer}>
        <Text style={styles.label}>Selecione uma data:</Text>
        <TouchableOpacity style={styles.dateButton} onPress={() => setShowCalendar(true)}>
          <Text style={styles.dateText}>
            {searchDate.toLocaleDateString('pt-BR', {
              weekday: 'short',
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            })}
          </Text>
        </TouchableOpacity>

        <Modal visible={showCalendar} transparent animationType="slide">
          <View style={styles.modalContainer}>
            <View style={styles.calendarContainer} lightColor={Colors.light.surface} darkColor={Colors.dark.surface}>
              <Text style={styles.modalTitle}>Selecione a Data</Text>

              <Calendar
                current={formatCalendarDate(searchDate)}
                onDayPress={(day: { timestamp: number; dateString: string; day: number; month: number; year: number }) => {
                  const selectedDate = new Date(day.year, day.month - 1, day.day, 12, 0, 0);
                  setSearchDate(selectedDate);
                  setShowCalendar(false);
                }}
                markedDates={{
                  [formatCalendarDate(searchDate)]: { selected: true, selectedColor: colors.primary },
                }}
                theme={{
                  calendarBackground: colors.surface,
                  textSectionTitleColor: colors.textMuted,
                  selectedDayBackgroundColor: colors.primary,
                  selectedDayTextColor: colors.background,
                  todayTextColor: colors.primary,
                  dayTextColor: colors.text,
                  textDisabledColor: colors.textMuted,
                  dotColor: colors.primary,
                  selectedDotColor: colors.background,
                  arrowColor: colors.primary,
                  monthTextColor: colors.text,
                  indicatorColor: colors.primary,
                }}
                firstDay={0}
              />

              <TouchableOpacity style={styles.closeButton} onPress={() => setShowCalendar(false)}>
                <Text style={styles.closeButtonText}>Fechar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>

      <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
        <Text style={styles.searchButtonText}>Buscar</Text>
      </TouchableOpacity>

      <View style={styles.separator} />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={Object.entries(vendas)}
          renderItem={({ item }) => {
            const [data, vendasDoDia] = item as [string, (VendaDatabase & { produtos: string[] })[]];
            return renderVendasPorData(data, vendasDoDia);
          }}
          keyExtractor={(item) => item[0]}
          showsVerticalScrollIndicator
          style={{ flex: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<EmptyState icon="clock-o" title="Nenhuma venda no período" message="Busque outra data ou aguarde novas vendas." />}
        />
      )}
    </View>
  );
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Rodar suíte**

Run: `npx jest --watchAll=false`

- [ ] **Step 4: Commit**

```bash
git add "app/(tabs)/historico.tsx"
git commit -m "refactor(mobile): historico.tsx vira orquestrador, usa VendaItem"
```

---

## Task 12: `components/ProductItemVenda.tsx` (polish — `IconButton` no botão +)

**Files:**
- Modify: `components/ProductItemVenda.tsx`

**Interfaces:**
- Consumes: `IconButton` (Task 7).
- Produces: mesma assinatura pública (`ProductItemVenda({ data, tipoNome?, onAddToCart, onAdicionaltoCart })`), sem mudança de comportamento — só o botão `+` passa a ser um `IconButton`.

- [ ] **Step 1: Trocar o botão `+` cru pelo `IconButton`**

Trocar:

```tsx
      <Animated.View style={{ transform: [{ scale: buttonScaleAnim }] }}>
        <Pressable
          onPress={() => { triggerAnimation(buttonScaleAnim); onAddToCart(data); }}
          style={[styles.addButton, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.addButtonText, { color: colors.background }]}>+</Text>
        </Pressable>
      </Animated.View>
```

por:

```tsx
      <Animated.View style={{ transform: [{ scale: buttonScaleAnim }] }}>
        <View style={[styles.addButton, { backgroundColor: colors.primary }]}>
          <IconButton
            icon="plus"
            label="Adicionar à conta"
            onPress={() => { triggerAnimation(buttonScaleAnim); onAddToCart(data); }}
            size={20}
            color={colors.background}
          />
        </View>
      </Animated.View>
```

`color={colors.background}` é necessário aqui porque o círculo `addButton` já tem fundo `colors.primary` (preto no light, branco no dark) — a cor padrão do `IconButton` (`colors.text`) ficaria com baixo contraste em cima dele (preto sobre preto/branco sobre branco); `colors.background` é o inverso exato, igual ao que o `Text` cru já fazia antes (`color: colors.background`).

Adicionar o import (junto dos outros de `components/ui`):

```tsx
import { IconButton } from "@/components/ui/IconButton";
```

- [ ] **Step 2: Remover o estilo `addButtonText` agora não usado**

Em `ProductItemVenda.tsx`, remover a entrada `addButtonText` de `StyleSheet.create` (não é mais referenciada).

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add components/ProductItemVenda.tsx
git commit -m "refactor(mobile): ProductItemVenda usa IconButton no botão de adicionar"
```

---

## Task 13: `components/Product.tsx` (polish — `IconButton` em editar/excluir)

**Files:**
- Modify: `components/Product.tsx`

**Interfaces:**
- Consumes: `IconButton` (Task 7).
- Produces: mesma assinatura pública (`Product({ data, tipoNome?, onDelete, onOpen })`), sem mudança de comportamento — só os 2 ícones crus viram `IconButton`.

- [ ] **Step 1: Substituir o arquivo inteiro**

`colorScheme`/`colors`/`Colors` só existiam neste arquivo pra colorir os 2 ícones crus — depois da troca pro `IconButton` (que resolve cor sozinho via `destructive`), ficam sem uso, então saem junto.

```tsx
import { Pressable, PressableProps, StyleSheet, View } from "react-native";
import { Text } from "@/components/Themed";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/IconButton";
import { IngredientesModal } from "@/components/ui/IngredientesModal";
import { tipoColors, spacing, type } from '@/constants/theme';
import { useState } from "react";
import { ProductDatabase } from "@/database/types/Produto";

type Props = PressableProps & {
  data: ProductDatabase;
  tipoNome?: string;
  onDelete: () => void;
  onOpen: () => void;
};

export function Product({ data, onDelete, onOpen, tipoNome, ...rest }: Props) {
  const [modalVisible, setModalVisible] = useState(false);

  const tipoLabel = tipoNome ?? (data as any).tipoNome ?? `Tipo ${data.tipoProdutoId}`;

  return (
    <Pressable {...rest}>
      <Card style={styles.container}>
        <View style={styles.leftInfo}>
          <Text style={styles.nome}>{data.nome}</Text>
          <Text style={styles.preco}>Preço: R$ {data.preco.toFixed(2)}</Text>
        </View>

        <Pressable onPress={() => setModalVisible(true)}>
          <Badge label={tipoLabel} color={tipoColors[data.tipoProdutoId] ?? '#888'} />
        </Pressable>

        <View style={styles.buttonContainer}>
          <IconButton icon="pencil" label="Editar produto" onPress={onOpen} />
          <IconButton icon="trash" label="Excluir produto" onPress={onDelete} destructive />
        </View>

        <IngredientesModal
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
          nomeProduto={data.nome}
          ingredientes={data.ingredientes}
        />
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "center" },
  leftInfo: { flex: 1 },
  nome: { fontSize: type.body, fontWeight: "bold", marginBottom: 4 },
  preco: { fontSize: type.bodySm },
  buttonContainer: { flexDirection: "row", alignItems: "center", gap: spacing.md },
});
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add components/Product.tsx
git commit -m "refactor(mobile): Product usa IconButton em editar/excluir"
```

---

## Task 14: Regressão final + checklist visual manual

**Files:** nenhum (validação).

**Interfaces:** N/A.

- [ ] **Step 1: `tsc` limpo nos 2 repos**

Run (api): `bunx tsc --noEmit` em `C:/RN/api/api-tozzo.uk`
Run (mobile): `npx tsc --noEmit` em `C:/RN/TozzoBurger`
Expected: sem erros nos dois.

- [ ] **Step 2: Suítes**

Run (api): `bun test` em `C:/RN/api/api-tozzo.uk` — 123 testes passando.
Run (mobile): `npx jest --watchAll=false` em `C:/RN/TozzoBurger` — todos os testes existentes passando.

- [ ] **Step 3: Rebuild Android e validar visualmente no emulador (já de pé nesta sessão)**

Run: `npx expo run:android` em `C:/RN/TozzoBurger` (api local já rodando em `http://localhost:3001`, `.env` do app já aponta pra `http://10.0.2.2:3001`).

Checklist manual, light + dark mode:
- [ ] `pedidos.tsx`: barra de cor por status, badge com label, editar abre modal, excluir funciona (era o bug morto) e pede confirmação, "Criado por" aparece com nome (criar um pedido novo e confirmar que aparece na hora, sem esperar sync).
- [ ] `historico.tsx`: mesma casca visual de `pedidos.tsx` (barra cinza fixa), ver/imprimir/excluir funcionam, venda excluída aparece com strikethrough, "Criado por" aparece.
- [ ] `index.tsx` (venda): botão + continua funcionando (ícone branco/preto legível dentro do círculo), badge de tipo abre modal de ingredientes, quick-add (raio) funciona.
- [ ] `produtos.tsx`: editar/excluir com a cara nova do `IconButton`, mesmo visual de pedidos/histórico.
- [ ] Nenhuma tela com texto/ícone invisível (mesma classe de bug que a Fase 5 corrigiu em `historico.tsx`/`contaHistoricoModal.tsx` — conferir especialmente o `meta`/badge no dark mode).

- [ ] **Step 4: Push das branches (sem abrir PR ainda — usuário decide quando)**

```bash
# em C:/RN/api/api-tozzo.uk
git push -u origin feat/sincronizacao-criado-por-nome

# em C:/RN/TozzoBurger
git push -u origin feat/design-system-mobile-listas
```

---

## Self-Review

**Cobertura da spec**: componente `IconButton` (Task 7) ✓, `RecordCard` (Task 8) ✓, `PedidoItem` migrado + bug de delete corrigido (Task 9) ✓, `VendaItem`/`historico.tsx` (Tasks 10-11) ✓, `ProductItemVenda`/`Product` polish (Tasks 12-13) ✓, `criado_por_nome` end-to-end (Tasks 2-6) ✓, testes/regressão (Task 14) ✓. Realtime via WebSocket fica de fora — spec própria, fora deste plano.

**Placeholder scan**: sem `TBD`/`TODO` — todo step tem código completo, nenhum "similar to Task N" sem o código repetido.

**Consistência de tipos**: `RecordCardAction`/`RecordCard` (Task 8) usados identicamente em `PedidoItem` (Task 9) e `VendaItem` (Task 10) — mesmos nomes de campo (`icon`/`label`/`onPress`/`disabled`/`destructive`/`loading`). `IconButton` (Task 7) já nasce com `color?` — usado sem alteração por `RecordCard` (Task 8, não passa `color`, cai no default), `ProductItemVenda` (Task 12, passa `color={colors.background}`) e `Product` (Task 13, não passa, cai no default). `criado_por_nome` com o mesmo nome em schema (Task 3), tipos (Task 4), pull-apply (Task 5) e criação local (Task 6).
