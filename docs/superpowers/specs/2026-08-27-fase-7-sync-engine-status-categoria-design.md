# Fase 7 (bloco técnico) — Motor de sync (WatermelonDB) + status por item + categoria do estabelecimento

> Spec produzida via brainstorming (2026-08-27). Cobre só o bloco técnico da
> Fase 7 (`plano.md`): troca do motor de sync mobile, redesenho de status por
> item de pedido, e categoria do estabelecimento com seed consciente de tipos
> de produto. **LGPD e Play Store são sub-partes independentes da mesma Fase
> 7, com brainstorm/spec própria — não fazem parte deste documento.**

## Contexto e motivação

QA manual da Fase 6 (2026-08-26) reproduziu um bug real de sincronização:
alterar status de um pedido pela web e, em seguida, adicionar item ao mesmo
pedido pelo app, faz o status voltar pro valor antigo. Causa raiz confirmada
em código:

- `TozzoBurger/database/useSyncDatabase.ts` marca a **linha inteira** como
  `sync_status = 'pending'` em qualquer escrita local — não rastreia qual
  campo mudou.
- O push manda o **snapshot inteiro da linha** local, incluindo campos que o
  cliente nunca teve intenção de alterar (ex: `status` desatualizado, só
  carona no mesmo payload que carrega o item novo).
- `api/api-tozzo.uk/modules/sync/sync.controller.ts:192` já faz merge
  campo-a-campo (`if (order.status !== existing.status) data.status =
  order.status`), mas não tem como saber se aquele campo era realmente a
  intenção da escrita ou só um valor velho carregado junto — o mais recente
  não necessariamente vence.

A causa raiz é estrutural (falta de dirty-tracking por campo no cliente), não
um bug pontual de um `if`. Motivou avaliar substituir o motor de sync caseiro
por algo desenhado pra essa classe de problema.

## Decisão: WatermelonDB (não implementação própria, não PowerSync/ElectricSQL)

Alternativas descartadas antes desta spec (registrado pra não repetir a
pesquisa):

- **PowerSync**: resolve o problema de raiz (conflito por campo pronto), mas
  free tier (2GB sync/mês, medido por transfer bruto pra cada dispositivo —
  não é dado único) é insuficiente pra produção real; self-host é FSL
  (source-available, grátis, mas não OSS puro) e é serviço novo a manter.
- **ElectricSQL**: 100% OSS (Apache 2.0), mas só resolve o lado
  leitura/replicação (shape sync de tabela única). Escrita/conflito
  continuaria sendo código próprio — resolve só metade do problema.
- **Implementação própria** (versionamento por campo em cima do
  `syncGuard.ts`/`useSyncDatabase.ts` atual): viável, mas essa classe de bug
  é exatamente o motivo desses produtos existirem — clock skew, retry,
  offline concorrente, idempotência — fácil de errar de novo (já erraram uma
  vez com versão mais simples).

**WatermelonDB** (MIT, RN-nativo, produção em escala — Deliveroo, Nozbe)
venceu por: dirty-tracking **por coluna** automático (resolve o bug de raiz
sem exigir lógica de merge manual), adapter JSI (app já roda com
`newArchEnabled: true` em `app.json`, sem overhead de bridge assíncrona),
zero custo de licença/serviço externo.

**Trade-off aceito conscientemente**: WatermelonDB não é só motor de sync —
substitui toda a camada de acesso local. Os 6 arquivos abaixo serão
reescritos (não só `useSyncDatabase.ts`):

- `database/useOrderDatabase.ts`
- `database/useSaleDatabase.ts`
- `database/useProductDatabase.ts`
- `database/useUserDatabase.ts`
- `database/usePrinterDatabase.ts`
- `database/salesQuery.ts`
- `database/initializeDatabase.ts` (schema/migração vira `appSchema`/`tableSchema` do Watermelon)

Sem impacto de performance esperado — Watermelon foi desenhado pra esse tipo
de carga (lazy loading, observables) e a escala deste app (1 dispositivo por
garçom, 1 estabelecimento) é bem menor que os casos de uso de produção
documentados da lib.

## Sem migração de dado legado

Confirmado com o usuário: este será o **lançamento oficial** do app (Play
Store). O app anterior era instalado via APK avulso, só 1 cliente real. Não
há frota de dispositivos em produção com dado pendente a preservar — schema
pode ser reescrito do zero, sem rotina de migração dado-a-dado do banco
antigo.

## Escopo do schema

### `Order` (Prisma) / `TB_ORDERS` (SQLite local)

- `status: String @default("OPEN")` (enum de 4 valores) → **`isOpen:
  Boolean @default(true)`**. Justificativa: com status granular movendo pra
  nível de item, o que resta relevante no pedido como um todo é só "conta
  ainda aberta na mesa" vs "paga/fechada" — os estados intermediários
  (`EM_PREPARO`/`ENTREGANDO`) deixam de fazer sentido no nível do pedido.
- Fechamento continua sendo a transição pedido → venda (mesmo fluxo de hoje:
  `Sale.orderId` referencia o `Order` original). Ao fechar, `isOpen` vira
  `false` e a linha local do pedido é removida/oculta da lista "Pedidos" no
  mobile e no front (vira só "Venda" — não fica um estado intermediário
  "fechado" visível na lista de pedidos).

### `OrderItem` (Prisma) / `RL_ORDER_PRODUCT` (SQLite local)

- Ganha campo **`status`**, enum novo `OrderItemStatus`: `REQUESTED` →
  `IN_PREPARATION` → `DELIVERED`. Transição `REQUESTED → DELIVERED` direta é
  permitida (sem trava de passar por `IN_PREPARATION`) — decisão do
  estabelecimento/garçom se quer rastrear a etapa de preparo ou não, item a
  item, sem flag de configuração nenhuma (nenhum produto ou tipo de produto
  precisa declarar se "tem preparo" — a decisão é operacional, não de
  cadastro).
- `SaleItem`/`RL_SALE_PRODUCT` **não** ganha status — venda é fato histórico
  já consumado (pago, entregue), sem mais transição de estado a rastrear.

### `Establishment` (Prisma)

- Ganha campo **`category`**, enum fixo no código (não administrável nesta
  fase — YAGNI): `HAMBURGUERIA`, `PIZZARIA`, `SORVETERIA`, `CAFETERIA`,
  `LANCHONETE`, `OUTRO` (lista final de valores + o seed de `ProductType`
  sugerido por categoria é detalhado na fase de implementação, não nesta
  spec — a lista acima é o ponto de partida).
  Usado **só** pra sugerir o seed inicial de `ProductType` no onboarding —
  **não bloqueia** criação de tipo de produto fora da categoria (decisão
  explícita: hamburgueria que também vende açaí não fica travada).

### Onboarding novo (primeiro acesso do estabelecimento)

Fluxo: dono escolhe categoria → app/dashboard mostra o seed de `ProductType`
sugerido pra aquela categoria → dono pode adicionar/remover itens da lista
sugerida **antes** de confirmar → confirma → seed é gravado. Resolve dois
achados de uma vez: o seed hoje bagunçado (`hamburguer, batata, açaí,
sorvete, sushi` juntos, sem sentido pra nenhum estabelecimento real) e a
pendência já registrada no `plano.md` sobre um tutorial de boas-vindas no
primeiro acesso.

## Protocolo de sync (API)

- `api/api-tozzo.uk/modules/sync/sync.controller.ts` e `sync.routes.ts` são
  reescritos pra falar o protocolo nativo do WatermelonDB
  (`pullChanges(lastPulledAt) → { changes: { created, updated, deleted },
  timestamp }` por tabela; `pushChanges({ changes, lastPulledAt })`).
- `sync.adapter.ts` (camada de tradução de wire legado em português) é
  **removido** — sem dispositivo legado em campo, não há motivo pra manter
  compatibilidade retroativa.
- Resolução de conflito usa o mecanismo padrão do Watermelon: no push, cada
  registro carrega só as colunas que o cliente realmente alterou
  (`_changed`); o merge no servidor aplica só essas colunas por cima do
  estado mais recente, sem pisar em campos que o cliente nem tocou. Não
  requer lógica de merge customizada nem CRDT.

## Impacto de UI (front + mobile)

- A cor de linha por status na lista de "Pedidos" (front `OrdersPage`,
  mobile design system v2) **é removida** — como pedido fechado desaparece
  da lista imediatamente (vira venda), toda linha visível na lista é sempre
  "aberta" por definição; não sobra distinção visual a fazer ali.
- O detalhe/modal do pedido ganha indicação de status por item
  (`REQUESTED`/`IN_PREPARATION`/`DELIVERED`), pra cozinha/garçom marcar
  progresso item a item.
- `src/lib/status.ts` (front) e o mapeamento equivalente no mobile perdem o
  enum de 4 valores de pedido. `Sale.isCancelled` (campo já existente,
  sem mudança nesta fase) continua sendo o único indicador visual na lista
  de vendas. Os dois ganham o mapeamento novo de `OrderItemStatus`.

## Testes

- Mobile: suíte Jest/`jest-expo` reescrita para os 6 hooks migrados —
  TDD conforme padrão do projeto. Cobertura mínima: dirty-tracking por
  campo (push só manda coluna alterada), pull aplica merge sem sobrescrever
  campo não tocado, onboarding de categoria+seed, transições de
  `OrderItemStatus` (incluindo skip direto `REQUESTED → DELIVERED`).
- API: suíte de `modules/sync/` reescrita do zero contra o protocolo
  Watermelon (`bun test --isolate`), cobrindo `pullChanges`/`pushChanges`,
  merge por campo, fechamento de pedido → criação de venda.
- Front: ajuste dos testes existentes de `OrdersPage`/`status.ts` pra
  refletir remoção do enum de 4 cores e adição de status por item no
  detalhe do pedido.

## Fora de escopo desta spec

- LGPD/compliance e Play Store (sub-partes da mesma Fase 7, spec própria).
- Categoria administrável pelo usuário (lista fixa no código por enquanto).
- Qualquer flag de "produto precisa de preparo" (decisão explícita: não
  existe, pipeline completo sempre disponível pra todo item).
- Migração de dado de dispositivo legado (não existe frota em produção a
  preservar).

## Riscos conhecidos, registrados

- Reescrever os 6 hooks de acesso local é o maior item de esforço da fase —
  blast radius grande mesmo sem mudança de UX visível na maioria das telas.
- Enum de categoria fixo no código significa que adicionar uma categoria
  nova exige deploy — aceito como YAGNI consciente, não bloqueia nada (só
  limita a sugestão de seed).
