# Fase 7 — Task 0: baseline e inventário do mobile

Data da coleta: 2026-08-27  
Branch: feat/fase-7-sync-status-categoria

Este documento é somente inventário. Nenhum arquivo de código-fonte do mobile foi alterado nesta task.

## 1. Origem da branch

Comandos executados em C:/RN/TozzoBurger:

~~~text
git log --oneline -3
b8c8ef5 docs(plans): plano de implementação da Fase 7 (bloco técnico) - WatermelonDB, status por item, categoria do e...
414681e docs(specs): corrige mecanismo de resolução de conflito na spec da Fase 7
b99fcb8 docs(specs): design da Fase 7 (bloco técnico) - motor de sync WatermelonDB, status por item, categoria do...

git diff dev --stat
(saída vazia)
~~~

O status da branch confirmou feat/fase-7-sync-status-categoria. A comparação com dev não mostrou alterações antes da Task 0.

## 2. Inventário exaustivo de Order.status

Busca literal executada com ripgrep via rtk, excluindo Git, dependências, artefatos de build, documentação e snapshots históricos:

~~~text
rtk grep -vvv -l 400 -m 1000 -n "\b(OPEN|IN_PROGRESS|IN_PREPARATION|DELIVERING|CLOSED)\b" . --hidden --glob "!.git/**" --glob "!node_modules/**" --glob "!dist/**" --glob "!build/**" --glob "!docs/**" --glob "!.superpowers/**" --glob "!graphify-out/**" --glob "!*.diff" --glob "!*.log"
77 matches in 13 files
~~~

Resultado literal, por arquivo/linha:

- app/modais/pedidoModal.tsx:22-25,39,52,80,132,226 — labels/tradução, default OPEN, cálculo de pedido aceito, leitura do status do pedido, fechamento com CLOSED e opções dos quatro status.
- components/PedidoItem.tsx:16,44-47 — leitura de data.status, default OPEN e escolha do label por status.
- components/__tests__/task7c1Status.test.tsx:49 — fixture de pedido OPEN.
- components/__tests__/task7cI18n.test.tsx:120 — fixture de pedido OPEN.
- constants/__tests__/status.test.ts:5-8,11,18 — cores, fallback e label dos status.
- constants/status.ts:1,6,8,10,12-13,18-21,25-28,32 — tipo, normalização, cores, labels e fallback.
- database/__tests__/initializeDatabase.test.ts:78 — expectativa de status OPEN após migração local.
- database/initializeDatabase.ts:102-105 — migração de ABERTO, EM_PREPARO, ENTREGANDO e FECHADO para os quatro valores canônicos.
- database/types/Order.ts:17-20,23-26 — enum canônico e aliases legados.
- database/useOrderDatabase.ts:10-13,40,375,412,418 — validação, default OPEN, filtro de pedidos do usuário e contagens de pedidos OPEN.
- database/useSyncDatabase.ts:290,296,438,442 — default OPEN no pull, remoção de CLOSED e limpeza de relações/pedidos CLOSED já sincronizados.
- services/__tests__/legacyWire.test.ts:23,51 — fixtures/assertions de CLOSED e IN_PREPARATION no wire.
- services/legacyWire.ts:4-11,17-20,38 — conversões canônico ↔ legado e fallback OPEN.

Não houve ocorrência de IN_PROGRESS. O mobile usa IN_PREPARATION como estado vigente.

### Referências contextuais de leitura/escrita

As linhas abaixo foram verificadas por busca contextual e completam os pontos em que o campo é lido ou gravado sem a constante aparecer na mesma linha:

- database/types/Order.ts:8 — campo status: OrderStatus no tipo Order; :16-29 define os valores e aliases.
- database/useOrderDatabase.ts:45 — INSERT de TB_ORDERS com status; :52 valida status de criação via sync; :62-64 lê status de data de sync; :91 grava status no INSERT de pedido recebido do sync; :95 valida data.status; :132 lê TB_ORDERS por SELECT *; :149-153 recebe status na atualização; :238-244 grava status em UPDATE; :281 e :323 fazem SELECT * de pedidos, trazendo status; :374 filtra por OPEN/IN_PREPARATION; :411 e :417 contam por status.
- app/modais/pedidoModal.tsx:33,39,80,101,132 — obtém updateOrder, mantém status no estado, carrega pedido.status, grava o status escolhido e grava CLOSED quando a venda é concluída.
- components/PedidoItem.tsx:16-17,31-32 — normaliza data.status e usa a normalização para cor/badge.
- database/initializeDatabase.ts:186 — cria TB_ORDERS com a coluna status TEXT NOT NULL.
- database/useSyncDatabase.ts:30 — seleciona status de pedidos pendentes para o push; :74 monta o batch; :290 lê status do pedido recebido; :296 decide remoção por CLOSED; :311-312 grava status no INSERT; :326-327 grava status no UPDATE; :437-442 remove relações e pedidos CLOSED no cleanup.
- services/legacyWire.ts:72-85 — lê status de pedidos recebidos; :116-150 monta o payload legado, preservando status; :154-171 lê pedidos e status da resposta de pull.

## 3. Payload de push/pull do sync mobile

### Entrypoints, lock e consumidores

- database/useSyncDatabase.ts:18-456 é o motor atual de push/pull local.
- services/api.ts:109-120 monta POST /sincronizacao/push; :132-146 monta GET /sincronizacao/pull com since.
- services/legacyWire.ts:40-171 faz a tradução dos nomes de campos e status entre o contrato local e o wire legado.
- context/AutoSyncContext.tsx:6-7,15-17,28-29,47,57-60,73,97,109,122,132,142-144 agenda/executa sync e expõe estado de sincronização.
- context/AuthContext.tsx:6-7,195 dispara sync em background após login, usando o lock.
- database/syncGuard.ts:14-54 serializa/coalesce chamadas de sync; não é payload, mas protege a entrada do motor.
- database/tableWatermark.ts:1-20 persiste watermarks por tabela.
- hooks/useShouldReload.ts:2,4,12, hooks/useProductList.ts:110-125, app/(tabs)/pedidos.tsx:49 e app/(tabs)/historico.tsx:12,16,127,129 consomem mudanças/lastSync para recarregar dados.
- components/SyncIndicator.tsx:13-14,29,46,60,64 e hooks/useSyncRefresh.ts apresentam/acionam o estado de sync.

### Push antes e depois da tradução de wire

database/useSyncDatabase.ts lê os registros locais pendentes:

- :24 — TB_PRODUCTS: id, name, productTypeId, price, sourceProductId, ingredients, updated_at, deleted_at.
- :28 — TB_SALES: id, total, soldAt, customerName, isCancelled, updated_at, deleted_at, createdBy, createdByName.
- :30 — TB_ORDERS: id, total, openedAt, customerName, status, updated_at, deleted_at, createdBy, createdByName.
- :36-48 — itens de venda via RL_SALE_PRODUCT: relId, saleId, productId, quantity, sourceProductId; o item montado usa id, saleId, productId (sourceProductId quando existe) e quantity.
- :57-69 — itens de pedido via RL_ORDER_PRODUCT: relId, orderId, productId, quantity, sourceProductId; o item montado usa id, orderId, productId (sourceProductId quando existe) e quantity.
- :74 — batch inicial: products: produtosLocal, sales: vendasLocal, orders: pedidosLocal.
- :94-96 — envia o batch para api.synchronize (ou o alias deprecated api.sincronizar).

services/api.ts:109-115 converte o batch por toLegacySyncPayload antes do POST para /sincronizacao/push. O wire efetivamente enviado por services/legacyWire.ts:116-150 é:

- produtos: id, nome, preco, tipoProdutoId, origemProdutoId, ingredientes, updated_at, deleted_at;
- pedidos: id, total, horario, cliente, status, criado_por, criado_por_nome, updated_at, deleted_at, itens;
- item de pedido: id, produtoId, quantidade;
- vendas: id, total, horario, cliente, excluida, pedidoId, criado_por, criado_por_nome, updated_at, itens;
- item de venda: id, produtoId, quantidade.

O mapper de venda não inclui deleted_at na forma legada. pedidoId é emitido a partir do valor disponível no objeto de venda, podendo ser nulo/ausente no registro selecionado pelo query atual.

### Resposta de push

useSyncDatabase.ts:110-143 lê os mapas de IDs retornados e atualiza sync_status/sourceProductId local:

- productIdMap;
- orderIdMap;
- saleIdMap;
- ignored.

O cliente aceita esses campos pela resposta de services/legacyWire.ts:154-171, inclusive aliases produtos, pedidos, vendas e productTypes. O backend atual documentado no inventário da API monta productIdMap, orderIdMap e ignored, mas não monta saleIdMap; o mobile faz leitura defensiva.

### Pull

services/api.ts:132-137 chama GET /sincronizacao/pull?since=...; useSyncDatabase.ts:149-166 converte lastSyncAt de epoch ms para ISO e passa sinceIso. O campo de avanço temporal é procurado em :179-183 como serverTime, now, timestamp ou checkpoint.

Campos lidos/aplicados em useSyncDatabase.ts:

- productTypes, :186-213 — id, description, color, isActive, updated_at/updatedAt e deleted_at/deletedAt; grava TB_PRODUCT_TYPES.
- products, :231-276 — id, name, ingredients, productTypeId, sourceProductId, price, updated_at/updatedAt e deleted_at/deletedAt; faz upsert em TB_PRODUCTS.
- orders, :282-342 — id, openedAt, customerName, status, updated_at/updatedAt, deleted_at/deletedAt, createdBy, createdByName, total e items; grava/atualiza TB_ORDERS e RL_ORDER_PRODUCT.
- order items, :314-320 e :333-340 — id, productId e quantity.
- sales, :348-413 — id, soldAt, customerName, isCancelled, updated_at/updatedAt, deleted_at/deletedAt, createdBy, createdByName, total e items; grava/atualiza TB_SALES e RL_SALE_PRODUCT.
- sale items — id, productId e quantity.
- politica.vendasDias, :421-445 — janela de limpeza de vendas, default 7; também limpa pedidos CLOSED com sync_status synced.

Para pedidos recebidos, :296 remove fisicamente o pedido e RL_ORDER_PRODUCT se o status for CLOSED ou houver tombstone. Caso contrário, :311-312 ou :326-327 preserva/grava status e refaz as relações dos itens.

### Testes do contrato

- database/__tests__/useSyncDatabase.test.ts:3,18,35-46,50-60,63-74,77-82 — mocks de getChanges, produtos, tipos, pedidos, vendas e itens.
- services/__tests__/legacyWire.test.ts:2-4,9-52 — fixtures de push e pull, aliases legados, status e itens.
- services/__tests__/api.test.ts:11 em diante cobre o serviço HTTP de dados; não há outro consumidor de /sincronizacao.
- database/__tests__/initializeDatabase.test.ts:7-16,56,78 cobre schema legado/migração e status OPEN.

## 4. Baseline executado

### Testes Jest

Comando:

~~~text
npx jest --watchAll=false --runInBand
~~~

Resultado real:

~~~text
Test Suites: 27 passed, 27 total
Tests:       116 passed, 116 total
Snapshots:   1 passed, 1 total
Time:        6.239 s, estimated 7 s
Ran all test suites.
Exit code: 0
~~~

Durante a execução apareceram logs esperados dos testes negativos de i18n e erros/logs simulados do BLE; os testes correspondentes passaram.

### Typecheck

Comando:

~~~text
npx tsc --noEmit
~~~

Resultado:

~~~text
Exit code: 0
(sem saída)
~~~

## 5. Contagem read-only no Postgres

O mobile não abre conexão direta com o Postgres. A consulta foi executada na API, que tinha DATABASE_URL de desenvolvimento configurada e acessível. Credenciais e URL não foram registrados aqui.

Query:

~~~sql
SELECT
  (SELECT count(*)::bigint FROM "TB_ORDERS") AS tb_orders,
  (SELECT count(*)::bigint FROM "RL_ORDER_PRODUCT") AS rl_order_product;
~~~

Saída real:

~~~text
{"tb_orders":"28","rl_order_product":"55"}
Exit code: 0
~~~

Referência do estado observado na API: TB_ORDERS = 28 linhas e RL_ORDER_PRODUCT = 55 linhas.
