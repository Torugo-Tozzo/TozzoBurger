# Fase 7 — Task 1: migration Prisma manual da API

Data: 2026-08-27  
Branch: feat/fase-7-sync-status-categoria  
Repositório: C:/RN/api/api-tozzo.uk

## Escopo e segurança

A Task 1 foi executada com TDD. O teste usa Docker Desktop para iniciar um container efêmero postgres:16-alpine em uma porta aleatória de localhost. A DATABASE_URL do .env não é usada pelo teste: ele monta uma URL com usuário, senha, banco e porta exclusivos do container. O container é removido no finally do teste.

Não foram executados prisma db push, prisma migrate reset, DROP TABLE, TRUNCATE ou conexão de escrita ao Postgres real de desenvolvimento/homologação. As 28 linhas de TB_ORDERS e 55 linhas de RL_ORDER_PRODUCT registradas no inventário T0 permaneceram intocadas.

## Arquivos alterados

- prisma/schema.prisma
  - Remove Order.status.
  - Adiciona Order.isOpen Boolean @default(true).
  - Troca o índice composto para establishmentId + isOpen.
  - Adiciona OrderItem.status com default DELIVERED.
  - Adiciona os enums OrderItemStatus e EstablishmentCategory.
  - Adiciona Establishment.category nullable, sem default.
- prisma/migrations/20260827120000_order_item_status_establishment_category/migration.sql
  - Migration manual com backfill e substituição do índice de pedidos.
- tests/prisma/schema-rename.migration.test.ts
  - Fixture com pedido aberto de dois itens, pedido fechado e venda com item.
  - Invariantes de linhas, isOpen, status dos itens, category, enums, FKs, índices e Prisma Client novo.

## TDD

### RED

O teste foi executado antes da criação da migration T1. A falha foi a ausência esperada do arquivo da migration, não erro de conexão ou de fixture:

~~~text
bun test --isolate tests/prisma/schema-rename.migration.test.ts

bun test v1.4.0 (34cbb9a40)

tests\prisma\schema-rename.migration.test.ts:
Expected: true
Received: false

at tests/prisma/schema-rename.migration.test.ts:276:39
✗ preserves legacy rows while renaming the Prisma/Postgres schema to English [5.13s]

0 pass
1 fail
4 expect() calls
Ran 1 test across 1 file. [5.13s]
exit code: 1
~~~

### GREEN

Depois do schema e da migration manual:

~~~text
bun test --isolate tests/prisma/schema-rename.migration.test.ts

bun test v1.4.0 (34cbb9a40)

tests\prisma\schema-rename.migration.test.ts:
T1_INVARIANTS rowsBefore={"TB_ESTABLISHMENTS":1,"TB_USERS":4,"TB_PRODUCT_TYPES":1,"TB_PRODUCTS":2,"TB_ORDERS":4,"TB_SALES":2,"RL_ORDER_PRODUCT":2,"RL_SALE_PRODUCT":1,"TB_PRINTERS":1,"TB_DEVICES":1} rowsAfter={"TB_ESTABLISHMENTS":1,"TB_USERS":4,"TB_PRODUCT_TYPES":1,"TB_PRODUCTS":2,"TB_ORDERS":4,"TB_SALES":2,"RL_ORDER_PRODUCT":2,"RL_SALE_PRODUCT":1,"TB_PRINTERS":1,"TB_DEVICES":1}
T1_INVARIANTS isOpen=[{"id":"order-closed","isOpen":false},{"id":"order-open","isOpen":true}] itemStatus=[{"id":"order-item-1","status":"DELIVERED"},{"id":"order-item-2","status":"DELIVERED"}] categoryNull=1

1 pass
0 fail
46 expect() calls
Ran 1 test across 1 file. [5.13s]
exit code: 0
~~~

## SQL completo da migration

~~~sql
ALTER TABLE "TB_ORDERS"
  ADD COLUMN "isOpen" BOOLEAN NOT NULL DEFAULT true;

UPDATE "TB_ORDERS"
SET "isOpen" = false
WHERE "status" = 'CLOSED';

CREATE INDEX "TB_ORDERS_establishmentId_isOpen_idx"
  ON "TB_ORDERS" ("establishmentId", "isOpen");

ALTER TABLE "TB_ORDERS"
  DROP COLUMN "status";

CREATE TYPE "OrderItemStatus" AS ENUM ('REQUESTED', 'IN_PREPARATION', 'DELIVERED');

ALTER TABLE "RL_ORDER_PRODUCT"
  ADD COLUMN "status" "OrderItemStatus" NOT NULL DEFAULT 'DELIVERED';

CREATE TYPE "EstablishmentCategory" AS ENUM (
  'HAMBURGUERIA',
  'PIZZARIA',
  'SORVETERIA',
  'CAFETERIA',
  'LANCHONETE',
  'OUTRO'
);

ALTER TABLE "TB_ESTABLISHMENTS"
  ADD COLUMN "category" "EstablishmentCategory";
~~~

A nova chave do índice é criada antes do DROP COLUMN, e o índice antigo dependente da coluna status é substituído atomicamente pela chave equivalente com isOpen. Nenhuma tabela é recriada; FKs e os demais índices são preservados.

## Comandos finais exigidos

### 1. prisma generate

Comando: bunx prisma generate

~~~text
Loaded Prisma config from prisma.config.ts.

Prisma schema loaded from prisma\schema.prisma

✔ Generated Prisma Client (v7.1.0) to .\node_modules\@prisma\client in 107ms

Start by importing your Prisma Client (See: https://pris.ly/d/importing-client)

Tip: Interested in query caching in just a few lines of code? https://pris.ly/tip-3-accelerate
~~~

Exit code: 0.

### 2. suíte completa

Comando: bun test --isolate --parallel

~~~text
bun test v1.4.0 (34cbb9a40) 16× PARALLEL

tests\lib\sse.test.ts:
[dotenv@17.2.3] injecting env (0) from .env -- tip: add access controls to secrets: https://dotenvx.com/ops

tests\middlewares\sseAuth.middleware.test.ts:
[dotenv@17.2.3] injecting env (0) from .env -- tip: backup and recover secrets to teammates

tests\app\app.test.ts:
[dotenv@17.2.3] injecting env (0) from .env -- tip: suppress all logs with { quiet: true }

tests\app\cors.test.ts:
[dotenv@17.2.3] injecting env (0) from .env -- tip: specify custom .env file path

tests\product-types\product-types.controller.test.ts:
[dotenv@17.2.3] injecting env (0) from .env -- tip: enable debug logging with { debug: true }

tests\charts\charts.controller.test.ts:
[dotenv@17.2.3] injecting env (0) from .env -- tip: sync secrets across teammates & machines

tests\payments\payments.webhook.test.ts:
[dotenv@17.2.3] injecting env (0) from .env -- tip: specify custom .env file path
[WEBHOOK] Received event: invoice.payment_succeeded
[WEBHOOK] Ignoring invoice.payment_succeeded (subscription_create) to avoid duplication.
[WEBHOOK] Error verifying signature: No signatures found matching the expected signature for payload.
[WEBHOOK] Error verifying signature: Missing stripe signature
[WEBHOOK] Error verifying signature: No signatures found matching the expected signature for payload.

tests\sync\sync.regression.test.ts:
[sync] 1 item(s) ignored during synchronization: order-item mobile-order-001 productId NaN
[sync] 2 item(s) ignored during synchronization: incomplete product and incomplete sale
[sync] 3 item(s) ignored during synchronization: unknown tombstones
[sync] 1 item(s) ignored during synchronization: missing product

tests\establishments\establishments.controller.test.ts:
[dotenv@17.2.3] injecting env (0) from .env -- tip: enable secrets lifecycle management

tests\sync\sync.controller.test.ts:
[sync] 1 item(s) ignored during synchronization: productId NaN
[SyncPayloadError] Invalid sync payload at products[0].name: conflicting aliases name and nome
[SyncPayloadError] Invalid sync payload at body.products: expected an array

tests\auth\auth.controller.test.ts:
[AUTH] Register attempt: a@a.com
[AUTH] Global active limit reached
[AUTH] Register attempt: novo@a.com
[AUTH] Global pending buffer reached
[AUTH] Register attempt: existing@test.com
[AUTH] User already exists: existing@test.com
[AUTH] Register attempt: dono@a.com
[AUTH] No valid registration key. Setting status to PENDING_PAYMENT.
[AUTH] Establishment created: estab-1
[AUTH] User created: user-2
[AUTH] Registration successful (pending payment).
[AUTH] Register attempt: dono2@a.com
[AUTH] Valid registration key used. Setting status to ACTIVE.
[AUTH] Establishment created: estab-1
[AUTH] User created: user-2
[AUTH] Registration successful (active).
[AUTH] Login attempt: nobody@test.com
[AUTH] Login failed: user not found
[AUTH] Login attempt: joao@test.com
[AUTH] Login failed: invalid password
[AUTH] Login attempt: maria@test.com
[AUTH] Login attempt: pedro@test.com
[AUTH] Subscription expired for estab-1. Updating status...
[AUTH] Login attempt: ok@test.com

tests\orders\orders.controller.test.ts:
[OrderError] You have reached the limit of 3 unfinished orders
[OrderError] Product inexistente is invalid or was not found
[OrderError] Order not found
[OrderError] Order is already closed
[OrderError] Order not found
[OrderError] This order cannot be edited because it is not open
[OrderError] Product fantasma is invalid or was not found

tests\prisma\schema-rename.migration.test.ts:
T1_INVARIANTS rowsBefore={"TB_ESTABLISHMENTS":1,"TB_USERS":4,"TB_PRODUCT_TYPES":1,"TB_PRODUCTS":2,"TB_ORDERS":4,"TB_SALES":2,"RL_ORDER_PRODUCT":2,"RL_SALE_PRODUCT":1,"TB_PRINTERS":1,"TB_DEVICES":1} rowsAfter={"TB_ESTABLISHMENTS":1,"TB_USERS":4,"TB_PRODUCT_TYPES":1,"TB_PRODUCTS":2,"TB_ORDERS":4,"TB_SALES":2,"RL_ORDER_PRODUCT":2,"RL_SALE_PRODUCT":1,"TB_PRINTERS":1,"TB_DEVICES":1}
T1_INVARIANTS isOpen=[{"id":"order-closed","isOpen":false},{"id":"order-open","isOpen":true}] itemStatus=[{"id":"order-item-1","status":"DELIVERED"},{"id":"order-item-2","status":"DELIVERED"}] categoryNull=1

201 pass
0 fail
521 expect() calls
Ran 201 tests across 26 files. [10.19s]
~~~

Exit code: 0. The webhook, sync, order, dotenv and auth messages above are expected logs from existing tests; they did not produce failures.

### 3. typecheck

Comando: bunx tsc --noEmit

~~~text
modules/orders/orders.controller.ts(50,11): error TS2353: Object literal may only specify known properties, and 'status' does not exist in type 'OrderWhereInput'.
modules/orders/orders.controller.ts(84,9): error TS2353: Object literal may only specify known properties, and 'status' does not exist in type 'Without<OrderCreateInput, OrderUncheckedCreateInput> & OrderUncheckedCreateInput'.
modules/orders/orders.controller.ts(326,15): error TS2339: Property 'status' does not exist on type '{ establishmentId: string; customerName: string | null; sellerId: string; updatedAt: Date; deletedAt: Date | null; openedAt: Date; id: string; total: Decimal; isOpen: boolean; }'.
modules/sync/sync.controller.ts(375,15): error TS2353: Object literal may only specify known properties, and 'status' does not exist in type 'OrderWhereInput'.
modules/sync/sync.controller.ts(376,15): error TS2353: Object literal may only specify known properties, and 'status' does not exist in type 'OrderWhereInput'.
~~~

Exit code: 1. Essas cinco falhas são referências existentes a Order.status nos controllers, já listadas no inventário T0 e pertencem à Task 2 (domínio da API). Nenhuma falha de sintaxe/validação do schema ou da migration foi observada; prisma generate e o teste GREEN passaram.

## Prova explícita das invariantes

- Linhas: antes e depois da T1, as 10 tabelas acompanhadas mantiveram exatamente as mesmas contagens:
  - TB_ESTABLISHMENTS 1 → 1
  - TB_USERS 4 → 4
  - TB_PRODUCT_TYPES 1 → 1
  - TB_PRODUCTS 2 → 2
  - TB_ORDERS 4 → 4
  - TB_SALES 2 → 2
  - RL_ORDER_PRODUCT 2 → 2
  - RL_SALE_PRODUCT 1 → 1
  - TB_PRINTERS 1 → 1
  - TB_DEVICES 1 → 1
- Conversão de pedido: order-closed isOpen=false; order-open isOpen=true. Os pedidos antigos com status intermediário também permanecem representáveis como abertos via default true.
- Itens existentes: order-item-1 e order-item-2 receberam status DELIVERED pelo default enum.
- Estabelecimento existente: o único fixture ficou category NULL (categoryNull=1); a leitura pelo Prisma retornou null.
- Enum category: os seis valores esperados foram criados na ordem HAMBURGUERIA, PIZZARIA, SORVETERIA, CAFETERIA, LANCHONETE, OUTRO.
- Integridade: os 14 FKs esperados permaneceram presentes; o teste de FK para produto inexistente continuou rejeitando a inserção.
- Índice: TB_ORDERS_establishmentId_isOpen_idx existe e sua definição contém isOpen; os demais índices verificados continuam presentes.
- Prisma Client novo: criou Order com isOpen=true por default, criou OrderItem com status DELIVERED por default e atualizou Establishment.category para HAMBURGUERIA.

