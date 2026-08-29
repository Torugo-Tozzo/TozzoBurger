# Fase 7 — Task 3: correções do review da API/worker

Data: 2026-08-27  
Repositório: `api-tozzo.uk`  
Branch: `feat/fase-7-sync-status-categoria`  
Base: `5312014`  
Commit da correção: `921d17c` (`fix-sync-C1-I1-I2-I3-review-findings`)

Foram corrigidos os quatro achados do review da Task 3. O relatório não faz parte do commit do repositório.

## C1 — conflito atômico no push

O preflight `findConflicts` foi removido. Cada mutação `updated` válida agora executa `updateMany` com o cursor do cliente na própria operação de escrita:

```ts
const result = await transactionModel(tx, table).updateMany({
  where: conditionalWhere(table, id, establishmentId, context.cursorDate, parentRelation, skipParentTimestamp),
  data,
});
if (result.count !== 1) {
  throw new SyncConflictError([{ table, id: String(id) }]);
}
```

Para `order_items` e `sale_items`, `conditionalWhere` aplica `establishmentId` e `updatedAt <= cursorDate` ao pedido/venda pai. Quando o pai está sendo criado no mesmo push, ou quando o item pertence a um pai também presente em `updated`, o contexto do lote evita o falso conflito; o toque de `updatedAt` do pai é adiado até o fim da transação. Qualquer conflito lança dentro de `$transaction`, portanto o lote inteiro sofre rollback.

IDs enviados em `created` não fazem overwrite: o `P2002` da criação é convertido em `SyncConflictError` e respondido como `409`.

Testes adicionados:

- fake RED antes da implementação: `updateMany` forçado a retornar `count=0` produzia `200`; depois GREEN, `bun test --isolate --parallel tests/sync/sync.protocol.test.ts` passou todos os 17 testes;
- fake para ID duplicado em `created`, retornando `409` sem substituir a linha existente;
- fake para pai e item atualizados no mesmo push, sem falso conflito;
- concorrência real em Postgres efêmero via Docker: o teste lê o cursor pelo pull, grava uma versão concorrente com outro cliente e envia o push antigo. Resultado: `1 pass`, `0 fail`, `6 expect() calls`.

## I1 — tombstones de itens

Foi criada a migration manual `prisma/migrations/20260827130000_add_sync_item_tombstones/migration.sql`:

```sql
ALTER TABLE "RL_ORDER_PRODUCT"
  ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "RL_SALE_PRODUCT"
  ADD COLUMN "deletedAt" TIMESTAMP(3);
```

O schema Prisma declara `deletedAt DateTime?` em `OrderItem` e `SaleItem`. Remoções de itens agora fazem soft delete:

```ts
await tx.orderItem.update({
  where: { id },
  data: { deletedAt: new Date() },
});
```

O mesmo vale para `saleItem`; a substituição dos itens de um pedido em `orders.controller.ts` também marca os itens ativos como removidos antes de criar os novos. Includes e listagens REST de itens ativos usam `where: { deletedAt: null }`.

No pull, itens com `deletedAt` dentro de `(lastPulledAt, checkpoint]` entram em `order_items.deleted` ou `sale_items.deleted`. A regra anterior de itens de pedidos fechados/apagados foi preservada e combinada com a nova regra.

Testes adicionados para item removido de pedido aberto e venda, preservação do tombstone na atualização REST e aplicação da migration. Resultados:

- `bun test --isolate --parallel tests/sync/sync.protocol.test.ts`: `17 pass`, `0 fail`;
- `bun test --isolate --parallel tests/orders/orders.controller.test.ts`: `21 pass`, `0 fail`, `52 expect() calls`;
- `bun test --isolate --parallel tests/prisma/schema-rename.migration.test.ts`: `1 pass`, `0 fail`, `49 expect() calls`.

## I2 — autorização de `product_types`

O sync reutiliza `normalizeUserRole`, `UserRole.OWNER` e `INITIAL_PRODUCT_TYPES` já existentes:

```ts
if (normalizeUserRole(user.role) !== UserRole.OWNER) {
  throwIgnored('PRODUCT_TYPE_OWNER_REQUIRED');
}
if (id !== undefined && INITIAL_PRODUCT_TYPES.some((productType) => productType.id === id)) {
  throwIgnored('SYSTEM_PRODUCT_TYPE_PROTECTED');
}
```

O tratamento de `IgnoredChangeError` adiciona a mutação ao array `ignored` e continua o lote. Isso vale para `created`, `updated` e `deleted`: usuário não-OWNER não altera tipos; IDs de tipos iniciais são sempre protegidos, inclusive para OWNER.

O teste cobre ambos os casos e passou dentro da suíte de protocolo e da suíte completa.

## I3 — eventos SSE após push

Depois do commit transacional, mudanças em orders/sales disparam os eventos correspondentes. Cada envio tem tratamento independente:

```ts
if (result.ordersChanged) {
  try {
    sendEvent(establishmentId, 'pedidos');
  } catch (cause) {
    console.error('Failed to send sync orders event:', cause);
  }
}
if (result.salesChanged) {
  try {
    sendEvent(establishmentId, 'vendas');
  } catch (cause) {
    console.error('Failed to send sync sales event:', cause);
  }
}
```

O teste verifica emissão quando há alteração e confirma resposta `200` quando o mock de `sendEvent` lança erro.

## Verificação final

Comandos executados após a implementação:

```text
bunx prisma generate
Generated Prisma Client v7.1.0 in 87ms
exit code 0

bun test --isolate --parallel
207 pass
0 fail
560 expect() calls
Ran 207 tests across 25 files
exit code 0

bunx tsc --noEmit
sem saída de erro
exit code 0

git diff --cached --check
sem erros de whitespace (apenas os avisos normais de conversão LF/CRLF do Git)
```

Também foi verificado o cenário Postgres concorrente real com Docker, além dos fakes de conflito e dos testes de migration. Não foi feito push nem aberto PR.
