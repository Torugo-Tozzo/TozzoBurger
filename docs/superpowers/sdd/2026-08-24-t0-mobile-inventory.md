# Fase 6 — T0: inventário do app mobile/offline

Data: 2026-08-24  
Branch: `feat/fase-6-i18n-english-base`  
Baseline: `d830f39` (`HEAD = dev = origin/dev`)

## Estado e escopo

O checkout começou sem diff de código. Foram preservados os dois untracked
pré-existentes: `docs/superpowers/specs/2026-08-24-fase-6-i18n-design.md` e
`docs/superpowers/plans/2026-08-24-fase-6-i18n.md`. O levantamento cobriu
`database/initializeDatabase.ts`, todos os tipos/hooks/SQLs do banco local,
`services/api.ts`, `services/vendas*.ts`, Auth/AutoSync, telas, modais,
componentes e testes.

## Domínio e dados

| Categoria | Ocorrências atuais | Tratamento previsto |
|---|---|---|
| Identificadores | `Produto`, `Pedido`, `Venda`, `Usuario`, `Impressora`, `TipoProduto`, `usePedidoDatabase`, `useVendaDatabse`, `sincronizarComServidor`, `produtos/pedidos/vendas`, `criado_por`. | Tipos, arquivos e funções internos passam a Product/Order/Sale/User/Printer/Sync; aliases ficam no adapter. |
| Dados de negócio | `nome`, `ingredientes`, `cliente`, `nomeEstabelecimento`, `nomeFantasia`, descrições dos tipos e todos os produtos do trailer. | Preservar texto e valores persistidos; não traduzir produto/cliente/ingredientes. |
| Wire | `/usuarios/me`, `/vendas`, `/sincronizacao/push`, `/sincronizacao/pull`; arrays `produtos`, `pedidos`, `vendas`; `updated_at`, `deleted_at`, `criado_por`, `excluida`. | Um adapter legado explícito em T4, com domínio local inglês. |
| UI | Login, tabs, produtos, pedidos, histórico, configurações, impressão, relatórios e todos os modais têm strings em português em `Text`, `Button`, `Alert`, placeholders e accessibility labels. | Sete bundles e namespace comum/mobile em T7; texto de negócio permanece dinâmico. |
| Comentários/logs | Sync, migração, impressão, loading e regras de tela misturam português/inglês. | Classificar e migrar comentários operacionais em T4/T7; não alterar T0. |
| Fixtures/testes | `database/__tests__/useSyncDatabase.test.ts` já exercita pull de produto/tipo/pedido/venda; testes de API usam `/vendas` e campos PT. | Expandir para fixture canônico da API, deletes, seller e item inválido em T3/T4. |

## SQLite atual: tabelas, colunas e constraints

`SCHEMA_VERSION` atual é **1005**. A inicialização retorna cedo quando o banco
tem versão maior ou igual a 1005; para versões anteriores cria tabelas e só
adiciona colunas incrementais. Não existe rename de tabela/coluna antiga.

| Tabela | Colunas atuais | Constraints/índices |
|---|---|---|
| `TB_PRODUTOS` | `id VARCHAR(36) PK`, `nome`, `tipoProdutoId`, `preco REAL`, `origemProdutoId`, `ingredientes`, `updated_at INTEGER`, `deleted_at INTEGER`, `sync_status` | PK em `id`; sem índice explícito |
| `TB_TP_PRODUTO` | `id INTEGER PK AUTOINCREMENT`, `descricao`, `cor DEFAULT '#9E9E9E'`, `ativo DEFAULT 1`, `updated_at`, `deleted_at`, `sync_status` | PK em `id` |
| `TB_VENDAS` | `id VARCHAR(36) PK`, `total`, `horario TEXT`, `cliente`, `excluida`, `origemVendaId`, `updated_at`, `deleted_at`, `sync_status`, `criado_por`, `criado_por_nome` | PK em `id` |
| `TB_PEDIDOS` | `id VARCHAR(36) PK`, `total`, `horario TEXT`, `cliente`, `status`, `origemPedidoId`, `updated_at`, `deleted_at`, `sync_status`, `criado_por`, `criado_por_nome` | PK em `id` |
| `RL_PEDIDO_PRODUTO` | `id PK`, `pedidoId`, `produtoId`, `quantidade DEFAULT 1` | FKs para pedido/produto, `ON DELETE CASCADE` |
| `RL_VENDA_PRODUTO` | `id PK`, `vendaId`, `produtoId`, `quantidade DEFAULT 1` | FKs para venda/produto, `ON DELETE CASCADE` |
| `TB_IMPRESSORAS` | `id INTEGER PK AUTOINCREMENT`, `uuid`, `nome` | PK em `id` |
| `TB_USUARIO` | `id INTEGER PK AUTOINCREMENT`, `nome`, `email UNIQUE`, `estabelecimentoId`, `nomeEstabelecimento`, `role DEFAULT FUNCIONARIO` | PK e unique em email |
| `TB_ESTABELECIMENTO` | `id INTEGER PK AUTOINCREMENT`, `nomeFantasia` | PK em `id` |
| `TB_SCHEMA` | `version`, `estabelecimentoId`, `usuarioId`, `sincronizacaoAutomatica DEFAULT 0`, `lastSyncAt` | uma linha lógica; sem PK/índice explícito |

As tabelas finais do spec são `TB_PRODUCTS`, `TB_PRODUCT_TYPES`, `TB_SALES`,
`TB_ORDERS`, `RL_ORDER_PRODUCT`, `RL_SALE_PRODUCT`, `TB_PRINTERS`, `TB_USERS`
e `TB_ESTABLISHMENTS`. O mapeamento é histórico preservador, não criação de
tabelas vazias.

SQL relevante fora da inicialização: todos os hooks em `database/`, AuthContext
e AutoSync consultam os nomes acima; `useSyncDatabase.ts` concentra push/pull,
upserts, soft delete, limpeza de retenção e `lastSyncAt`. Queries observadas
usam placeholders para valores; os nomes de tabela/coluna são literais do
schema.

## Sync: consumidores e fluxo

1. `context/AuthContext.tsx` chama login/`getMe`, salva token em SecureStore e
   dispara `runWithLock(() => sincronizarComServidor(...))`.
2. `context/AutoSyncContext.tsx` dispara sync em boot, foreground e rede; o
   `components/SyncIndicator.tsx` mostra sucesso/erro e permite retry.
3. `database/useSyncDatabase.ts` lê `TB_SCHEMA.lastSyncAt`, coleta rows
   `pending`, monta push, aplica mapas, chama pull, faz upsert condicional por
   timestamp e atualiza o watermark.
4. `hooks/useSyncRefresh.ts`, `useShouldReload.ts` e `tableWatermark.ts` avisam
   telas sobre mudanças locais/remotas. `syncGuard.ts` serializa promises e
   faz coalescing; não é lock booleano.
5. Telas `app/(tabs)/index.tsx`, `produtos.tsx`, `pedidos.tsx`, `historico.tsx`
   e configurações consomem o banco local. Modais de pedido/conta/relatório e
   impressão consomem produtos, pedidos e vendas.

Push local observado:

- produtos: `id,nome,tipoProdutoId,preco,origemProdutoId,ingredientes,updated_at,deleted_at`;
- pedidos: `id,total,horario,cliente,status,updated_at,deleted_at,criado_por,itens`;
- vendas: `id,total,horario,cliente,excluida,updated_at,deleted_at,criado_por,itens`;
- itens carregam IDs de relação, mas o wire principal usa `produtoId` e
  `quantidade`;
- produto local novo recebe `origemProdutoId` do `mapaProdutos`; pedidos/vendas
  são marcados `synced` quando o push retorna, mesmo se o mapa não existir.

Pull observado:

- aceita `updated_at`/`updatedAt` e `deleted_at`/`deletedAt`;
- aceita `itens` ou `items`;
- seller vem de `usuarioVendedorId` ou `vendedor.id`, com `vendedor.nome` para
  renderização;
- pedido `FECHADO` ou deletado é removido localmente junto dos itens; venda
  cancelada/deletada vira `excluida=1` e recebe `deleted_at`;
- `tiposProduto`, produtos, pedidos e vendas geram `markChanged` por tabela;
- `lastSyncAt` é epoch ms local e é convertido para ISO na query `since`;
- limpeza remove vendas antigas e pedidos fechados já sincronizados conforme
  política retornada.

Seller/ignorados/eventos: o mobile envia `criado_por`, aceita no pull
`usuarioVendedorId`/`vendedor`, e exibe `criado_por_nome`. A resposta API
`ignorados` ainda não é persistida/exibida por código estável no mobile. SSE é
web-only; o app usa pull/AutoSync.

Fixture de payload legado: [fixture canônico na API](../../../../api/api-tozzo.uk/docs/superpowers/sdd/fixtures/sync-legacy-payload.json).

## Divergências/bloqueios para revisão

1. Não há upgrade de SQLite para renomear tabelas/colunas: `initializeDatabase`
   apenas cria tabelas e adiciona `lastSyncAt`, `role` e `criado_por*`.
2. `TB_USUARIO`/`TB_ESTABELECIMENTO` são singulares e usam IDs INTEGER,
   enquanto Postgres usa `TB_USUARIOS`/`TB_ESTABELECIMENTOS` e UUID TEXT.
3. O domínio local ainda expõe nomes portugueses; `services/api.ts` espalha
   o wire legado em vez de um adapter único.
4. `horario` é ISO/texto, enquanto `updated_at`, `deleted_at` e `lastSyncAt`
   são epoch ms; essa distinção precisa ser mantida/documentada antes do
   rename, conforme a regra de timestamps do app.
5. Pull de pedido fechado/deletado executa `DELETE` local, e a retenção remove
   vendas/pedidos sincronizados; revisar compatibilidade com a política de
   soft delete sem apagar fila pendente.
6. A API não retorna `mapaVendas`; o mobile suporta a chave, mas não consegue
   usá-la no baseline.
7. `useSyncDatabase` aceita tanto snake_case quanto camelCase no pull, mas não
   valida mistura ambígua nem produz DTO inglês interno.
8. Há catches históricos que retornam `null`/lista vazia ou ignoram falhas de
   operação SQLite; devem ser revisados contra a regra de não esconder erros,
   sem alteração nesta T0.
9. Não existe i18n, locale persistido, checker de sete bundles ou suporte RTL
   nativo configurado. Android nativo não foi executado nesta T0.

## Baseline executado

| Comando | Resultado real |
|---|---|
| `npx jest --watchAll=false --runInBand` | exit 0; **14 suites pass**, **66 testes pass**, 1 snapshot pass |
| `npx tsc --noEmit` | exit 0, sem saída |

`where adb` retornou exit 1 (não encontrado). `npx expo run:android` não faz
parte da T0 e não foi iniciado; build nativo/SDK/emulador fica bloqueio de
validação para T9/T10, não foi inferido como aprovado.

## Limitações operacionais

`rg` não está disponível e `rtk` não iniciou por HOME ausente; foram usados
`git ls-files`/`git grep` e leituras dirigidas já coletadas. Não houve alteração
de banco, migration, sync real, Android, push, merge ou PR.

