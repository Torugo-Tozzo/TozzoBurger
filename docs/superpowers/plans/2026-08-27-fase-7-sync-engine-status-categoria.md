# Fase 7 (bloco técnico) — Plano de implementação: WatermelonDB, status por item, categoria do estabelecimento

> Pré-requisito: aprovação explícita do usuário para este plano. Nenhuma
> task abaixo foi executada nesta rodada de brainstorm/planejamento.

Spec: C:/RN/TozzoBurger/docs/superpowers/specs/2026-08-27-fase-7-sync-engine-status-categoria-design.md

## Objetivo

Substituir o motor de sync caseiro do mobile (`database/useSyncDatabase.ts`
+ `database/syncGuard.ts` + `POST /sincronizacao/push` + `GET
/sincronizacao/pull` da api) por **WatermelonDB**, redesenhar status de
pedido pra granularidade por item (`OrderItem.status`), simplificar
`Order.status` pra `Order.isOpen` (boolean), e introduzir categoria do
estabelecimento (`Establishment.category`) alimentando um onboarding de
seed consciente de tipo de produto — nos três repositórios.

A ordem obrigatória é:

1. Schema e domínio da API (Prisma, controllers, RBAC);
2. Protocolo de sync novo da API (`pullChanges`/`pushChanges` nativo do
   Watermelon, remoção do adapter legado);
3. Camada local do mobile (WatermelonDB — schema, models, hooks, sync);
4. Onboarding de categoria (mobile + front);
5. Limpeza de UI (remoção da cor de status de 4 valores) nas duas
   interfaces;
6. Validação integrada e QA nativo.

## Protocolo de execução

- Só começar depois da aprovação do usuário a este plano.
- Criar uma branch de feature separada em cada repositório (api, front,
  mobile), sempre baseada em `dev`. `main` fica intocada.
- Cada task é entregue a um subagente dedicado (Codex). Toda criação de
  subagente, inclusive reviewer e revisão final, deve declarar
  explicitamente `model: gpt-5.6-luna` e `reasoning_effort: max`. Nunca
  herdar o modelo da sessão nem usar outro identificador.
- O worker implementa a task com TDD, roda os testes focados e registra
  evidências. Um reviewer separado revisa a task antes da próxima;
  findings Critical/Important precisam ser corrigidos pelo worker e
  reavaliados.
- Ao terminar todas as tasks, um subagente de revisão final examina cada
  branch completa, o diff contra `dev`, o blast radius e os critérios da
  spec. Só depois o controller prepara os PRs destinados a `dev`.
- Nenhum worker pode usar `prisma db push`, `reset`, `clean` destrutivo,
  drop de tabela ou conectar em banco real sem autorização nova e
  explícita. A migration (T1) é testada primeiro em Postgres efêmero.
- Sem dispositivo mobile legado em produção a preservar (confirmado na
  spec) — nenhuma task precisa de caminho de migração de dado local
  antigo. O schema SQLite é recriado do zero no formato Watermelon.
- Package managers permanecem: Bun na api/front, npm/Expo no mobile.
- Nenhuma task desta leva mexe em LGPD ou Play Store — sub-partes com
  spec própria, fora deste plano.

## Dependências entre tasks

    T0 baseline e inventário (3 repos)
      ↓
    T1 migration Prisma (isOpen, OrderItem.status, Establishment.category)
      ↓
    T2 domínio da api (controllers, RBAC, fechamento de pedido)
      ↓
    T3 protocolo de sync novo da api (pullChanges/pushChanges)
      ↓
    T4 WatermelonDB: schema + models (mobile)
      ↓
    T5 hooks simples (produtos, usuário, impressora) ──┐
      ↓                                                 │
    T6 hook de pedidos (isOpen + status por item)        │
      ↓                                                 │
    T7 hook de vendas ───────────────────────────────────┘
      ↓
    T8 sync novo do mobile (synchronize() + syncGuard)
      ↓
    T9 onboarding categoria (mobile) ──┐
    T10 onboarding categoria (front) ──┤
      ↓                                │
    T11 UI: remoção de cor de status (front + mobile)
      ↓
    T12 QA integrada end-to-end
      ↓
    T13 revisão final de branch (3 repos)

T9/T10 podem rodar em paralelo depois de T2 (só dependem do campo
`Establishment.category` existir na api, não do sync novo). T5 pode
começar assim que T4 terminar; T6/T7 dependem de T5 só pelos models
compartilhados (Product), não pela lógica em si — mas rodam em sequência
pra evitar 2 workers mexendo em `database/watermelon/` ao mesmo tempo.

---

## Task 0 — Baseline e inventário

### Objetivo

Confirmar o estado real dos três repositórios antes de qualquer mudança e
mapear todos os pontos de acesso a dado local/sync que serão tocados.

### Escopo

- API: `modules/sync/` completo (`sync.controller.ts`, `sync.routes.ts`,
  `sync.adapter.ts`), `modules/orders/`, `modules/sales/`,
  `modules/establishments/`, schema Prisma atual (`Order`, `OrderItem`,
  `Establishment`), suíte de testes desses módulos.
- Mobile: `database/useSyncDatabase.ts`, `database/syncGuard.ts`,
  `database/tableWatermark.ts`, `database/useOrderDatabase.ts`,
  `database/useSaleDatabase.ts`, `database/useProductDatabase.ts`,
  `database/useUserDatabase.ts`, `database/usePrinterDatabase.ts`,
  `database/salesQuery.ts`, `database/initializeDatabase.ts`, telas que
  consomem esses hooks (`app/(tabs)/pedidos.tsx`, `historico.tsx`,
  `produtos.tsx`, `index.tsx`, modais `pedidoModal`/`contaModal`).
- Front: `src/lib/status.ts`, `src/pages/dashboard/OrdersPage`,
  componente(s) de modal de pedido, tela de configurações do
  estabelecimento (se existir) onde `category` poderia ser exibido.

### Passos

1. Confirmar branch de trabalho a partir de `dev` nos 3 repos, sem
   sobrescrever alterações preexistentes.
2. Listar exaustivamente todo lugar que lê ou escreve `Order.status`
   (valores `OPEN`/`IN_PROGRESS`/`DELIVERING`/`CLOSED`) nos 3 repos —
   controllers, RBAC, front, mobile, testes, seeds.
3. Listar todo lugar que hoje monta o payload de push/pull do sync mobile
   (campos exatos usados por `useSyncDatabase.ts` e `sync.controller.ts`).
4. Rodar as suítes e typecheck de baseline nos 3 repos; registrar números
   reais (não assumir os números do `plano.md`).
5. Confirmar no Postgres de desenvolvimento (efêmero ou local) quantas
   linhas existem hoje em `TB_ORDERS`/`RL_ORDER_PRODUCT` — isso decide o
   volume real afetado pela migration da T1.

### Saída

Inventário salvo em `docs/superpowers/sdd/` da branch de cada repo tocado
(seguindo o padrão já usado na Fase 6), sem alteração de comportamento.

---

## Task 1 — Migration Prisma manual

### Objetivo

Adicionar os 3 campos novos ao schema sem drop/recreate e sem perda de
dado real (Postgres de dev/homolog já tem estabelecimentos e pedidos de
teste reais).

### Arquivos

- Modificar: `prisma/schema.prisma`
- Criar: `prisma/migrations/<timestamp>_order_item_status_establishment_category/migration.sql`
- Criar/modificar: teste de migração e invariantes (mesmo padrão usado na
  migration da Fase 6, Postgres efêmero via Docker)

### Passos

1. Escrever teste RED em Postgres efêmero: aplicar migrations existentes,
   inserir estabelecimento, pedido `OPEN` com 2 itens, pedido `CLOSED`
   antigo, venda com itens — provar que o schema atual permite isso antes
   da mudança.
2. Alterar `schema.prisma`:
   - `Order.status: String @default("OPEN")` → `Order.isOpen: Boolean
     @default(true)`. Remover o campo `status` do model.
   - `OrderItem` ganha `status: OrderItemStatus @default(DELIVERED)`.
     Novo enum `OrderItemStatus { REQUESTED IN_PREPARATION DELIVERED }`.
   - `Establishment` ganha `category: EstablishmentCategory?` (nullable,
     sem default). Novo enum `EstablishmentCategory { HAMBURGUERIA
     PIZZARIA SORVETERIA CAFETERIA LANCHONETE OUTRO }`.
3. Escrever SQL explícito:
   - `ALTER TABLE "TB_ORDERS" ADD COLUMN "isOpen" BOOLEAN NOT NULL DEFAULT true;`
     seguido de `UPDATE "TB_ORDERS" SET "isOpen" = false WHERE "status" =
     'CLOSED';` (preserva o estado real de todo pedido já fechado antes de
     derrubar a coluna antiga), depois `ALTER TABLE "TB_ORDERS" DROP
     COLUMN "status";`.
   - `CREATE TYPE "OrderItemStatus" AS ENUM ('REQUESTED',
     'IN_PREPARATION', 'DELIVERED');` seguido de `ALTER TABLE
     "RL_ORDER_PRODUCT" ADD COLUMN "status" "OrderItemStatus" NOT NULL
     DEFAULT 'DELIVERED';` — default `DELIVERED` pra linhas existentes é
     intencional: pedidos/itens já criados antes desta fase não têm sinal
     real de progresso de preparo, e marcar como "entregue" não bloqueia
     nada nem gera falso alarme de item esquecido na cozinha.
   - `CREATE TYPE "EstablishmentCategory" AS ENUM ('HAMBURGUERIA',
     'PIZZARIA', 'SORVETERIA', 'CAFETERIA', 'LANCHONETE', 'OUTRO');`
     seguido de `ALTER TABLE "TB_ESTABLISHMENTS" ADD COLUMN "category"
     "EstablishmentCategory";` — sem default, fica `NULL` pra
     estabelecimento já existente. `category IS NULL` é o sinal usado
     depois (T9/T10) pra disparar o onboarding.
4. Conferir que não existe `DROP TABLE`, `TRUNCATE` ou perda de FK/índice.
5. Rodar o teste de migration e provar: mesma contagem de linhas, pedido
   `CLOSED` antigo virou `isOpen = false`, pedido `OPEN` antigo virou
   `isOpen = true`, todo `OrderItem` existente ganhou `status =
   'DELIVERED'`, todo `Establishment` existente ficou com `category =
   NULL`, FKs e índices intactos, leitura/escrita pelo Prisma Client novo
   funcionando.
6. Rodar `prisma generate` e o typecheck da api.

### Critérios específicos de revisão

- Nenhuma linha de negócio (produto, cliente, venda) foi apagada ou
  truncada.
- O `UPDATE` que popula `isOpen` roda **antes** do `DROP COLUMN status`,
  nunca depois.
- Enum novo sem valor órfão (nenhum pedido/item fica com status
  inexistente no enum).

---

## Task 2 — Domínio da api: `isOpen`, status por item, categoria

### Objetivo

Portar controllers, regras e testes da api pros campos novos, sem quebrar
RBAC nem tenant isolation.

### Arquivos

- Modificar: `modules/orders/orders.controller.ts`,
  `modules/orders/orders.routes.ts`, `modules/orders/orders.rules.ts` (se
  existir arquivo de regra separado)
- Modificar: `modules/sales/sales.controller.ts` (fechamento de pedido →
  venda passa a setar `isOpen: false` em vez de `status: 'CLOSED'`)
- Modificar: `modules/establishments/establishments.controller.ts`,
  `establishments.routes.ts` (endpoint novo ou campo novo em
  `PATCH /establishments/:id` pra gravar `category`)
- Modificar: testes correspondentes em `tests/orders/`, `tests/sales/`,
  `tests/establishments/`
- Atualizar `tests/api-surface.known-endpoints.ts` se algum path novo for
  criado

### Passos

1. Atualizar todo teste que hoje monta `Order` com `status: 'OPEN'`/
   `'CLOSED'` pra usar `isOpen: true`/`false`.
2. Trocar toda leitura/escrita de `order.status` nos controllers por
   `order.isOpen`. Remover qualquer referência ao enum antigo
   `ORDER_STATUS`.
3. `OrderItem` criado/atualizado via endpoint REST normal (não sync) usa
   `status: 'REQUESTED'` como default ao criar; endpoint novo ou campo em
   `PATCH` de item de pedido pra transicionar status
   (`REQUESTED`→`IN_PREPARATION`→`DELIVERED`, ou direto
   `REQUESTED`→`DELIVERED`) — sem validação de trava de ordem (qualquer
   transição é permitida, decisão da spec).
4. Fechamento de pedido (`sales.controller.ts`, criação de `Sale` a partir
   de `Order`): setar `order.isOpen = false`. `SaleItem` continua sem
   campo `status`.
5. `PATCH /establishments/:id` aceita `category` (um dos 6 valores do
   enum) — endpoint já existente, só adicionar o campo à validação/RBAC
   (`DONO`/`GERENTE` apenas, mesmo padrão dos outros campos editáveis do
   estabelecimento).
6. Rodar suíte completa da api + `tsc --noEmit`.

### Critérios específicos de revisão

- Nenhum teste ainda referencia o enum `status` antigo do pedido.
- RBAC de `category` segue o mesmo padrão de outros campos de
  `Establishment` (não abre brecha nova de permissão).
- Fechamento de pedido testado cobrindo: pedido com itens em status
  variados vira venda corretamente (status de item não bloqueia
  fechamento).

---

## Task 3 — Protocolo de sync novo da api

### Objetivo

Substituir `POST /sincronizacao/push` + `GET /sincronizacao/pull` (com
`sync.adapter.ts` de wire legado) pelo protocolo nativo do WatermelonDB:
`pullChanges`/`pushChanges`.

### Arquivos

- Deletar: `modules/sync/sync.adapter.ts`
- Reescrever do zero: `modules/sync/sync.controller.ts`,
  `modules/sync/sync.routes.ts`
- Modificar: `tests/sync/` (suíte reescrita do zero contra o protocolo
  novo)
- Atualizar `tests/api-surface.known-endpoints.ts`

### Passos

1. Trocar o prefixo de rota de `/sincronizacao` pra `/sync` (sem
   dispositivo legado a preservar, alinhado ao domínio em inglês já
   adotado na Fase 6).
2. `GET /sync/pull?lastPulledAt=<ms|omitido>&schemaVersion=<n>` —
   implementa `pullChanges`: retorna `{ changes: { products: {created,
   updated, deleted}, product_types: {...}, orders: {...}, order_items:
   {...}, sales: {...}, sale_items: {...} }, timestamp: <ms server> }`.
   Cada `created`/`updated` é o registro raw (nomes de coluna iguais ao
   schema SQLite que a T4 vai definir — usar snake_case pra bater com
   convenção Watermelon). `deleted` é só array de IDs.
   - Escopo por `establishmentId` do token (RBAC de tenant, igual ao pull
     legado).
   - Pedido com `isOpen = false` (fechado) entra em `orders.deleted`
     (nunca em `updated`) — mobile trata fechamento como remoção local,
     igual ao comportamento de hoje.
3. `POST /sync/push` com body `{ changes: {...}, lastPulledAt: <ms> }` —
   implementa `pushChanges`:
   - Para cada tabela/registro em `created`/`updated`: checar se
     `updatedAt` do registro correspondente no Postgres é mais recente
     que `lastPulledAt` informado. Se **qualquer** registro do lote
     estiver assim, abortar a transação inteira e responder erro (ex:
     `409` com código `SYNC_CONFLICT`) — **sem** aplicar nada parcial.
   - Se não houver conflito: aplicar todos os `created`/`updated`/
     `deleted` numa transação Prisma. `productId` novo local (UUID
     gerado pelo mobile) já é o ID final (Watermelon usa string IDs
     gerados pelo cliente, sem `idMap` como o protocolo antigo).
   - `deleted` de `orders`: tratar como pedido fechado localmente sem ter
     passado pela api ainda — se o pedido ainda existe e está `isOpen`,
     ignorar o delete silenciosamente (fechamento real acontece via
     endpoint de venda, T2, não via sync). Registrar esse caso no log,
     não é erro fatal.
4. Erro de item/produto inválido (produto que não existe mais, quantidade
   inválida) continua sendo ignorado por item (não derruba a transação
   inteira) e reportado — mesmo princípio do `ignorados` já documentado no
   `CLAUDE.md`, adaptado pro formato de resposta do Watermelon (campo
   extra na resposta, já que o protocolo padrão não prevê isso — documentar
   como extensão não-padrão no swagger).
5. Escrever a suíte nova cobrindo: pull sem `lastPulledAt` (primeira sync,
   traz tudo), pull incremental, push sem conflito, push com conflito
   (rejeição em bloco), pedido fechado vira `deleted` no pull de outro
   dispositivo, tenant isolation (estabelecimento A não recebe dado de B).
6. Rodar suíte completa + `tsc --noEmit`.

### Critérios específicos de revisão

- Push com conflito não aplica nenhuma alteração parcial (tudo ou nada).
- Pull nunca vaza dado de outro `establishmentId`.
- Nenhum resquício de `sync.adapter.ts` ou campo em português
  (`produtos`/`pedidos`/`vendas`) sobrevive no controller novo.

---

## Task 4 — WatermelonDB: schema e models (mobile)

### Objetivo

Introduzir a dependência e definir schema/models — sem ainda migrar
nenhum hook (próximas tasks).

### Arquivos

- Modificar: `package.json` (`@nozbe/watermelondb`, adapter JSI)
- Criar: `database/watermelon/schema.ts` (`appSchema`/`tableSchema` pras
  tabelas `products`, `product_types`, `orders`, `order_items`, `sales`,
  `sale_items`, `users`, `printers`)
- Criar: `database/watermelon/models/` — um arquivo por model
  (`Product.ts`, `ProductType.ts`, `Order.ts`, `OrderItem.ts`, `Sale.ts`,
  `SaleItem.ts`, `User.ts`, `Printer.ts`)
- Criar: `database/watermelon/database.ts` (instância `Database` +
  `SQLiteAdapter` com `jsi: true`, dado que `app.json` já tem
  `newArchEnabled: true`)
- Criar: `database/watermelon/migrations.ts` (schema migrations do
  Watermelon — só a versão inicial nesta task, sem histórico anterior a
  preservar)

### Passos

1. Instalar `@nozbe/watermelondb` (`npm install --save`, projeto usa
   npm/Expo, não `--no-save`).
2. Definir `appSchema` com `version: 1` e as 8 tabelas, colunas em
   snake_case batendo com o schema Prisma em inglês da Fase 6 (`name`,
   `price`, `is_open`, `status`, `category`, etc — Watermelon exige
   `created_at`/`updated_at` reservados pra seu próprio controle de sync,
   então os `updatedAt` de negócio existentes viram os campos reservados
   do próprio Watermelon, não uma coluna de app separada).
3. Definir cada `Model` com `@field`/`@date`/`@relation`/`@children`
   batendo 1:1 com a tabela.
4. Configurar `SQLiteAdapter({ schema, jsi: true, dbName: 'tozzoburger',
   onSetUpError })`.
5. Testes: instanciar o banco em teste (Jest), criar 1 registro de cada
   tabela via Model API, confirmar leitura — prova que schema/adapter
   funcionam antes de qualquer hook depender disso.
6. `npx tsc --noEmit`.

### Critérios específicos de revisão

- Nomes de tabela/coluna batem exatamente com o que a T3 espera no
  payload de sync (mesma nomenclatura, senão pull/push quebra em
  silêncio).
- `OrderItem.status`/`Order.isOpen`/`Establishment` (via `Product`? não —
  `category` fica só na api, mobile não guarda estabelecimento inteiro
  localmente, confirmar que schema mobile não duplica isso à toa) — só
  replicar localmente o que os hooks realmente precisam offline.

---

## Task 5 — Migrar hooks simples pro Watermelon

### Objetivo

Portar os 3 hooks de menor risco primeiro, validando o padrão antes de
tocar em pedidos/vendas (mais críticos).

### Arquivos

- Reescrever: `database/useProductDatabase.ts`, `database/useUserDatabase.ts`,
  `database/usePrinterDatabase.ts`
- Manter: assinatura pública dos hooks (nomes de função exportados,
  formato de retorno) igual ao que as telas já consomem — só a
  implementação interna troca de SQL cru pra Watermelon Query API.

### Passos

1. Para cada hook: escrever teste que já existia (Jest) adaptado pra
   popular o banco via Model API do Watermelon em vez de SQL cru,
   mantendo as mesmas asserções de comportamento.
2. Reescrever a implementação usando `database.get('products').query(...)`,
   `.create()`, `.update()` no lugar de `getAllAsync`/`runAsync`.
3. Confirmar que toda tela que consome esses hooks
   (`app/(tabs)/produtos.tsx`, `login.tsx`, `configs.tsx`, fluxo de
   impressora) continua funcionando sem alteração de código nelas — só o
   hook muda por dentro.
4. Rodar suíte focada + `tsc --noEmit`.

### Critérios específicos de revisão

- Assinatura pública de cada hook não mudou (nenhuma tela precisou ser
  tocada por causa desta task).
- Nenhum SQL cru (`execAsync`/`runAsync`/`getAllAsync` de `expo-sqlite`)
  sobrou nesses 3 arquivos.

---

## Task 6 — Migrar hook de pedidos pro Watermelon

### Objetivo

Portar `useOrderDatabase.ts`, incluindo `Order.isOpen` e
`OrderItem.status`.

### Arquivos

- Reescrever: `database/useOrderDatabase.ts`
- Modificar: `app/(tabs)/pedidos.tsx`, `pedidoModal.tsx` (consumo do
  campo `isOpen` no lugar do enum antigo; UI de transição de status por
  item no modal)

### Passos

1. Escrever testes cobrindo: criar pedido (`isOpen: true` por padrão),
   adicionar item (`status: 'REQUESTED'` por padrão), transicionar item
   pra `IN_PREPARATION`, transicionar direto `REQUESTED`→`DELIVERED`
   (sem trava), fechar pedido (`isOpen: false`).
2. Reescrever a implementação com Watermelon Query/Model API.
3. Atualizar `pedidoModal.tsx` pra exibir e permitir alterar o status de
   cada item da lista do pedido (3 estados + transição livre) — UI mínima
   viável (ex: botão/select por item), sem redesenho visual maior (Fase
   5/design system mobile já definiu os componentes base a reaproveitar,
   ex: `Badge`).
4. Remover qualquer leitura de `pedido.status` (enum antigo) em
   `pedidos.tsx` — lista de pedidos não filtra mais por status, só mostra
   pedidos com `isOpen: true` (pedido fechado já não aparece, vira venda).
5. Rodar suíte focada + `tsc --noEmit`.

### Critérios específicos de revisão

- Transição de status de item nunca bloqueia (nenhuma validação de
  "precisa passar por IN_PREPARATION antes").
- Pedido fechado (`isOpen: false`) some da lista de pedidos
  imediatamente, sem estado intermediário visível.

---

## Task 7 — Migrar hook de vendas pro Watermelon

### Objetivo

Portar `useSaleDatabase.ts` e `salesQuery.ts`.

### Arquivos

- Reescrever: `database/useSaleDatabase.ts`, `database/salesQuery.ts`
- Modificar: `app/(tabs)/historico.tsx`, `app/(tabs)/index.tsx` (tela de
  venda), `contaModal.tsx`, `contaHistoricoModal.tsx`,
  `relatorioModal.tsx`

### Passos

1. Escrever testes cobrindo criação de venda a partir de pedido fechado
   (herdando os itens do pedido, sem `status` no `SaleItem`), busca por
   data/período (`salesQuery.ts`), cancelamento de venda.
2. Reescrever a implementação com Watermelon Query/Model API.
3. Confirmar que a busca de venda por data (hoje 100% local, achado
   registrado no `plano.md` como pendência da Fase 5 sub-item 4B) **não**
   ganha fallback de API nesta task — fora de escopo, fica registrado
   como pendência a resolver na Fase 5 quando ela retomar.
4. Rodar suíte focada + `tsc --noEmit`.

### Critérios específicos de revisão

- `SaleItem` continua sem campo `status` em nenhum lugar do código novo.
- Nenhuma tela quebrou por causa da troca de implementação.

---

## Task 8 — Sync novo do mobile

### Objetivo

Substituir `useSyncDatabase.ts` pelo `synchronize()` nativo do
WatermelonDB, wireado nos endpoints da T3, mantendo serialização de
chamadas concorrentes.

### Arquivos

- Deletar: `database/useSyncDatabase.ts` (função antiga completa)
- Reescrever: `database/syncGuard.ts` (mesma função `runWithLock`, só
  troca o que é executado dentro do lock — de `synchronizeWithServer`
  caseiro pra chamada de `synchronize()` do Watermelon)
- Criar: `database/watermelon/sync.ts` (implementação de `pullChanges` e
  `pushChanges` que chamam `services/api.ts` contra `/sync/pull` e
  `/sync/push` da T3)
- Avaliar e provavelmente remover: `database/tableWatermark.ts` — o
  padrão de "watermark + gate de reload" (Fase 5, sub-item 4C) existe pra
  compensar a ausência de reatividade real no SQL cru; Watermelon tem
  `Query.observe()` nativo. Se a avaliação confirmar que dá pra trocar
  telas por `withObservables`/`useDatabase`+`observe` sem perda de
  comportamento, remover `tableWatermark.ts` e os usos em
  `pedidos.tsx`/`historico.tsx`/`produtos.tsx`/`index.tsx` nesta mesma
  task (registrar a decisão tomada no relatório da task, não deixar
  ambíguo).

### Passos

1. Implementar `pullChanges({ lastPulledAt, schemaVersion })` chamando
   `GET /sync/pull` e mapeando a resposta pro formato exato que
   `synchronize()` espera.
2. Implementar `pushChanges({ changes, lastPulledAt })` chamando
   `POST /sync/push`; tratar `409 SYNC_CONFLICT` deixando o
   `synchronize()` fazer o retry automático (comportamento padrão da lib
   — não escrever retry manual).
3. Confirmar que `synchronize()` é chamado dentro de `syncGuard.runWithLock`
   — mesma proteção contra chamadas concorrentes que existe hoje, só
   trocando o corpo executado.
4. Testes: mock do `pullChanges`/`pushChanges`, provar que 2 chamadas
   concorrentes de sync não corrompem estado (mesmo teste que já existe
   pra `syncGuard.ts` hoje, adaptado).
5. Teste de regressão do bug original: simular pedido com item novo local
   + `isOpen` alterado remotamente entre `lastPulledAt` e o push — provar
   que o pull (que roda antes do push no `synchronize()`) já resolve o
   valor de `isOpen` antes do push acontecer.
6. Rodar suíte completa + `tsc --noEmit`.

### Critérios específicos de revisão

- Nenhuma chamada de sync roda fora do `syncGuard`.
- O teste de regressão do bug original (motivo desta fase inteira) está
  presente e passando.

---

## Task 9 — Onboarding de categoria (mobile)

### Objetivo

Tela de primeiro acesso: escolher categoria → ver seed sugerido de
`ProductType` → editar → confirmar.

### Arquivos

- Criar: tela/modal novo (ex: `app/onboarding.tsx` ou modal disparado a
  partir de `login.tsx`/`_layout.tsx` quando `establishment.category ===
  null`)
- Criar: `database/watermelon/categorySeeds.ts` (tabela estática
  categoria → lista de nomes de `ProductType` sugeridos — dado de config,
  não vem da api)
- Modificar: fluxo pós-login em `app/(tabs)/_layout.tsx` ou equivalente,
  pra checar `category` do estabelecimento (via chamada
  `GET /establishments/:id` já existente) e disparar o onboarding quando
  `null`

### Passos

1. Definir a lista estática de sugestão por categoria em
   `categorySeeds.ts` (conteúdo real, não placeholder — ex: `HAMBURGUERIA`
   → `['Lanches', 'Bebidas', 'Porções', 'Sobremesas']`, um conjunto por
   categoria coerente com o negócio, revisado pelo reviewer da task).
2. Tela: seleção de categoria (6 opções) → mostra lista sugerida
   editável (adicionar/remover item de texto livre) → confirma.
3. Ao confirmar: `PATCH /establishments/:id` com `category` (T2) +
   criação em lote dos `ProductType` confirmados (endpoint já existente
   de criar tipo de produto, chamado N vezes ou em lote se já suportar).
4. Testes: fluxo completo mockado (escolhe categoria, edita lista, remove
   1 item, confirma, verifica chamadas feitas).
5. Rodar suíte focada + `tsc --noEmit`.

### Critérios específicos de revisão

- Onboarding só dispara quando `category === null` — não repete depois
  de confirmado.
- Editar a lista sugerida (add/remove) antes de confirmar realmente muda
  o que é criado (não ignora a edição do usuário).

---

## Task 10 — Onboarding de categoria (front/dashboard)

### Objetivo

Mesmo fluxo do lado web — dono pode configurar categoria pelo dashboard,
não só no primeiro acesso do app.

### Arquivos

- Criar: seção nova em alguma página de configurações do estabelecimento
  no front (confirmar path exato durante a T0; se não existir página de
  configurações do estabelecimento ainda, criar uma mínima)
- Criar: `src/lib/categorySeeds.ts` (mesma lista de sugestão da T9,
  duplicada intencionalmente — front e mobile são repos/builds
  independentes, não há pacote compartilhado, ver `CLAUDE.md`)

### Passos

1. UI: mesma lógica da T9 (escolher categoria → ver sugestão → editar →
   confirmar), adaptada pros componentes do design system web
   (`components/ui`).
2. Reaproveitar os mesmos endpoints da T2/T9 (`PATCH /establishments/:id`
   + criação de `ProductType`).
3. Testes (Vitest/RTL): fluxo completo, incluindo edição da lista antes
   de confirmar.
4. Rodar suíte + `tsc --noEmit` + `bun run build`.

### Critérios específicos de revisão

- Lista de sugestão por categoria bate com a do mobile (mesmo conteúdo,
  ainda que arquivos duplicados) — divergência aqui é bug de dado, não de
  arquitetura.

---

## Task 11 — UI: remoção da cor de status de pedido (front + mobile)

### Objetivo

Remover o mapeamento de 4 cores por status de pedido (hoje inútil — lista
de pedidos só mostra pedido aberto).

### Arquivos

- Modificar: `front/front-tozzo.uk/src/lib/status.ts`,
  `OrdersPage`/tabela de pedidos
- Modificar: mapeamento equivalente no mobile (`RecordCard`/`Badge` usado
  em `pedidos.tsx`)
- Manter intocado: indicador de `Sale.isCancelled` nas duas interfaces
  (não faz parte desta mudança)

### Passos

1. Remover o enum/mapa de 4 cores (`ABERTO`/`EM_PREPARO`/`ENTREGANDO`/
   `FECHADO`) de `status.ts` e do equivalente mobile.
2. Confirmar que nenhuma tela depende mais desse mapa (grep antes de
   apagar).
3. Adicionar, no modal de detalhe do pedido (não na lista), o indicador
   visual de `OrderItemStatus` por item — reaproveitar `Badge` já
   existente no design system das duas interfaces.
4. Testes: snapshot/RTL do front atualizado, teste do mobile atualizado.
5. Rodar suíte + `tsc --noEmit` (+ `bun run build` no front).

### Critérios específicos de revisão

- Nenhum código morto do mapa de 4 cores sobrou (nem tipo, nem função,
  nem teste órfão).
- Detalhe do pedido mostra status por item de forma legível (não é preciso
  redesenho completo, só reaproveitar componentes existentes).

---

## Task 12 — QA integrada end-to-end

### Objetivo

Validar o fluxo completo real, sem mock, nos 3 repos rodando juntos.

### Passos

1. Subir api local + Postgres com a migration da T1 aplicada.
2. Rodar front local, confirmar onboarding de categoria funcionando
   contra api real.
3. Rodar app mobile via `npx expo run:android` (build nativo real, não só
   Metro — regra já registrada no `CLAUDE.md`), confirmar:
   - onboarding de categoria no primeiro acesso;
   - criar pedido, adicionar item, transicionar status de item;
   - reproduzir o cenário do bug original (mudar algo no pedido pela web
     enquanto o app teria uma escrita local concorrente) e confirmar que
     não regride mais;
   - fechar pedido → vira venda, some da lista de pedidos;
   - sync completo (2 dispositivos/abas, um vê a mudança do outro).
4. Registrar evidência (screenshots/console/log de rede) no relatório da
   task — não marcar aceite por inferência.
5. Qualquer falha aqui bloqueia a T13.

### Saída

Relatório de integração em `docs/superpowers/sdd/` da branch mobile
(mesmo padrão da Fase 6), com resultados reais e pendências.

---

## Task 13 — Revisão final de branch (3 repos)

### Objetivo

Revisão diferencial completa antes de preparar integração em `dev`, sem
promover para `main`.

### Checklist do reviewer final

- diff de cada repo comparado com `dev`;
- migration sem operação destrutiva, testada em Postgres efêmero antes de
  qualquer aplicação real;
- `sync.adapter.ts` e o protocolo legado (`/sincronizacao/*`) realmente
  removidos, sem resquício;
- os 6 hooks do mobile sem nenhum SQL cru sobrando;
- `OrderItemStatus`/`Order.isOpen`/`Establishment.category` consistentes
  entre Prisma, schema Watermelon e as duas UIs;
- onboarding de categoria testado nas duas interfaces;
- teste de regressão do bug original presente e passando;
- suítes, typechecks e build (front) com evidência real;
- build Android real (`npx expo run:android`) executado, não só Metro;
- `plano.md` e a spec atualizados com o resultado real da fase;
- PRs, se autorizados depois, apontam somente para `dev`.

Depois da aprovação desse reviewer e do usuário, o controller prepara os
commits/PRs de integração em `dev`. Esta rodada de planejamento não cria
nenhum.

---

## Comandos finais esperados

API:

    bunx prisma generate
    bun test --isolate --parallel
    bunx tsc --noEmit

Front:

    bun test
    bun run build

Mobile:

    npx jest --watchAll=false --runInBand
    npx tsc --noEmit
    npx expo run:android

A migration de Postgres real e qualquer deploy para dev/homolog continuam
dependentes de aprovação posterior e revisão humana do diff SQL — mesma
regra já usada na Fase 6.
