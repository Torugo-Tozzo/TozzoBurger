# Fase 6 — T0: matriz cross-repo revisada

Baseline comum: branch `feat/fase-6-i18n-english-base`, cada repo divergência
`dev...HEAD = 0 0` e `dev...origin/dev = 0 0` após `git fetch origin dev`.

## Mapa de responsabilidade

| Conceito | API | Front | Mobile |
|---|---|---|---|
| Tenant | Prisma `Estabelecimento`, `estabelecimentoId`, `/estabelecimentos` | `AuthContext.user.estabelecimento`, `nomeFantasia` | `TB_ESTABELECIMENTO`, `estabelecimentoId`, AuthContext |
| Usuário/seller | `Usuario`, `usuarioVendedorId`, `criado_por`, RBAC | `User`, `/usuarios`, `role`, `vendedor` | `TB_USUARIO`, `criado_por`, `criado_por_nome`, SecureStore |
| Produto | `Produto`, `tipoProdutoId`, `preco`, `deletedAt` | ProductsPage/selection modal, `/produtos`, `/tipos` | `TB_PRODUTOS`, `origemProdutoId`, queries locais |
| Pedido | `Pedido`, `ItemPedido`, status PT | PedidosTab, OrdersPage, `/pedidos` | `TB_PEDIDOS`, `RL_PEDIDO_PRODUTO`, pedidos tab/modal |
| Venda | `Venda`, `ItemVenda`, `excluida`, `/vendas` | VendasTab/SalesPage, gráficos | `TB_VENDAS`, `RL_VENDA_PRODUTO`, histórico/impressão |
| Sync | `/sincronizacao/{push,pull}`, `ignorados`, mapas, checkpoint | não consome diretamente | `services/api.ts` + `useSyncDatabase` + AutoSync |
| Realtime | SSE `pedidos`/`vendas` | `useRealtimeEvents`/EventSource | não usa SSE; pull/AutoSync |
| Locale/UI | mensagens/logs PT na API | strings hardcoded PT, sem i18n | strings hardcoded PT, sem i18n |

## Contrato e rename

O rename interno previsto é `Establishment/User/Product/ProductType/Order/OrderItem/
Sale/SaleItem/Printer/Device/Sync`, com sete locales `en`, `pt-BR`, `es`, `fr`,
`zh`, `hi`, `ar`. O wire continua legado nesta fase: paths e arrays
`produtos/pedidos/vendas`, campos `nome`, `preco`, `cliente`, `criado_por`,
`updated_at`, `deleted_at` e status/roles antigos precisam ficar confinados a
adapters.

| Fronteira | Estado T0 | Risco de compatibilidade |
|---|---|---|
| API ↔ app antigo | API aceita push PT; pull sai Prisma/camelCase | delete de venda, `checkpoint`, `mapaVendas` e nomes mistos precisam de teste |
| API ↔ front | Axios recebe DTOs PT diretamente | não há serializer/DTO interno; respostas novas podem virar `undefined` |
| API ↔ app novo | mobile aceita ambos em vários pontos | ainda não há adapter único nem validação de ambiguidade |
| Postgres ↔ Prisma | schema e tabelas 100% PT | migration manual futura precisa preservar rows/FKs/índices/defaults |
| SQLite antigo ↔ app novo | schema 1005, somente adds idempotentes | nenhum rename/upgrade das tabelas/colunas foi implementado |

## Fluxo de sync coberto pelo fixture

O fixture `api/.../sync-legacy-payload.json` contém:

1. produto novo + pedido + venda vinculada;
2. item de pedido inválido `NaN` que deve entrar em `ignorados` sem rollback;
3. seller do mesmo tenant;
4. seller de outro tenant que deve cair no usuário do token;
5. soft delete de produto/pedido e cancelamento de venda;
6. pull com `tiposProduto`, produto, pedido, venda, vendedor e `checkpoint`.

## Bloqueios compartilhados

- Definir serializer/DTO legado antes de renomear propriedades Prisma.
- Decidir a semântica final de `deleted_at`/`deletedAt`/`excluida` e de
  `mapaVendas`/`checkpoint`/watermark.
- Provar migration Postgres e upgrade SQLite em bases efêmeras; nenhum banco
  real foi usado na T0.
- Preservar tenant/RBAC e `syncGuard` serializado; não substituir por booleano.
- Não traduzir nomes, ingredientes, clientes, nomes de estabelecimento ou
  descrições persistidas.
- Completar inventário de strings e somente depois criar sete bundles/checkers;
  `ar` exigirá provider RTL web e Android real.

## Baseline consolidado

| Repo | Suite | Typecheck/build |
|---|---|---|
| API | `bun test --isolate --parallel`: **175/175**, 22 arquivos | `bunx prisma generate` exit 0; `bunx tsc --noEmit` exit 0 |
| Front | `bun test`: **43/43**, 11 arquivos | `bunx tsc --noEmit` exit 0; `bun run build` exit 0, 2331 módulos |
| Mobile | Jest: **14/14 suites**, **66/66 testes**, 1 snapshot | `npx tsc --noEmit` exit 0; Android não executado na T0 (`adb` ausente) |

## Arquivos T0

- API: relatório e fixture canônico.
- Front: relatório; `audit-context/` fica fora do commit.
- Mobile: relatório e esta matriz; spec/plano ficam fora do commit.

