# Fase 7 — Task 2: domínio da API

Data: 2026-08-27  
Repositório: `api-tozzo.uk`  
Branch: `feat/fase-7-sync-status-categoria`  
Base: `d1ee7de`  
Commit: `9ebebf2 feat-api-migrate-order-state-item-status`

## Arquivos alterados

- `lib/legacyWire.ts`
- `modules/establishments/establishments.controller.ts`
- `modules/establishments/establishments.routes.ts`
- `modules/orders/orders.controller.ts`
- `modules/orders/orders.routes.ts`
- `modules/sales/sales.controller.ts`
- `modules/sync/sync.adapter.ts`
- `modules/sync/sync.controller.ts`
- `types/orderTypes.ts`
- `types/syncTypes.ts`
- `tests/api-surface.known-endpoints.ts`
- `tests/establishments/establishments.controller.test.ts`
- `tests/lib/legacyWire.test.ts`
- `tests/orders/orders.controller.test.ts`
- `tests/sales/sales.controller.test.ts`
- `tests/sync/sync.adapter.test.ts`
- `tests/sync/sync.regression.test.ts`

## Endpoints e campos novos ou alterados

- Leituras e escritas de estado de `Order` usam `isOpen: boolean`; a listagem usa `isOpen=true` por padrão e aceita `?isOpen=false` para pedidos fechados.
- Criação/substituição de pedido inicializa `OrderItem.status` como `REQUESTED`.
- Novo endpoint `PATCH /pedidos/:id/items/:itemId`, com body `{ "status": "REQUESTED" | "IN_PREPARATION" | "DELIVERED" }`. Todas as transições são permitidas, sem trava de ordem; a alteração também atualiza o pai para propagação pelo sync legado.
- Fechamento de pedido e criação de `Sale` fecham o pedido com `isOpen=false`, dentro de transação e com atualização condicional para evitar corrida.
- Novo endpoint `PATCH /establishments/:id`, restrito por RBAC a `DONO`/`GERENTE` do mesmo estabelecimento, com body `{ "category": "HAMBURGUERIA" | "PIZZARIA" | "SORVETERIA" | "CAFETERIA" | "LANCHONETE" | "OUTRO" }`.
- `tests/api-surface.known-endpoints.ts` foi atualizado para os dois endpoints PATCH novos.
- Todas as referências ao identificador legado `ORDER_STATUS` foram removidas do código.

## TDD

Os testes foram adaptados para `isOpen` e os novos casos foram executados antes da implementação. A rodada RED confirmou falhas nos controllers de orders, sales e establishments. Também foram adicionados testes RED para o filtro padrão de pedidos abertos, fechamento de pedido já fechado, compatibilidade do adapter de sync e serialização do status de item; após a implementação, todos ficaram verdes.

## Fix de review

- A rota nova de item foi renomeada de `PATCH /pedidos/:id/itens/:itemId` para `PATCH /pedidos/:id/items/:itemId`; o prefixo legado `/pedidos` foi mantido.
- O handler `atualizarStatusItemPedido` foi renomeado para `updateOrderItemStatus`, com import e uso atualizados em `orders.routes.ts` e o nome do grupo de testes ajustado.
- O handler `atualizarEstabelecimentoPorId` foi renomeado para `updateEstablishmentById`, com import e uso atualizados em `establishments.routes.ts`.
- `tests/api-surface.known-endpoints.ts` foi atualizado para registrar `PATCH /pedidos/:id/items/:itemId`.
- A auditoria dos acréscimos da Task 2 não encontrou outra rota, função ou variável nova em português fora desses três casos. Nomes portugueses remanescentes estão restritos à borda legada, mensagens humanas ou fixtures de compatibilidade.

## Verificação final

### `bun test --isolate --parallel`

Saída final:

```text
bun test v1.4.0 (34cbb9a40)
16× PARALLEL

209 pass
0 fail
542 expect() calls
Ran 209 tests across 26 files. [5.74s]
```

Exit code: `0`.

### `bunx tsc --noEmit`

Saída final: nenhuma saída no terminal.

Exit code: `0`.

## Commit

Commit original: `9ebebf2` (`feat-api-migrate-order-state-item-status`).

**Nota do controller**: o subagente que aplicou este fix de review foi
interrompido (`killed`, provável contenção de recurso do SO durante
spawn de subprocesso — 2 tentativas seguidas com o mesmo sintoma) antes
de rodar os comandos finais e commitar. O diff que ele já tinha
produzido (as 6 alterações acima) estava correto e completo. O
controller (Claude, orquestrando) verificou o diff, rodou
`bun test --isolate --parallel` (209 pass, 0 fail) e `bunx tsc --noEmit`
(limpo) diretamente, confirmou que batia com o esperado, e commitou:
`d5f00a0` (`fix(orders,establishments): rename new Task 2
handlers/routes to English`), na mesma branch.

Não foi feito push nem PR. Este relatório está fora do repositório
`api-tozzo.uk` e não foi incluído em nenhum commit.
