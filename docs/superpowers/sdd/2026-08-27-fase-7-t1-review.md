# Fase 7 — Task 1 — revisão independente da migration Prisma

Data da revisão: 2026-08-27
Branch: feat/fase-7-sync-status-categoria
Commit revisado: d1ee7de0322e5d8ebbcb3a8848f78b1d13873eed
Repositório: C:/RN/api/api-tozzo.uk

## Veredito final

APROVADO

Não há achados Critical, Important ou Minor. O typecheck retorna exatamente cinco referências legadas a Order.status, todas esperadas para a Task 2 conforme a instrução de revisão; isso não bloqueia a Task 1.

## Achados por severidade

### Critical

Nenhum.

### Important

Nenhum.

### Minor

Nenhum.

## Conferência independente

A migration só toca as três tabelas previstas:

- TB_ORDERS: adiciona isOpen, faz o backfill de CLOSED, remove status e cria o índice equivalente.
- RL_ORDER_PRODUCT: adiciona status com OrderItemStatus.
- TB_ESTABLISHMENTS: adiciona category com EstablishmentCategory.

O UPDATE ocorre nas linhas 4–6 e o DROP COLUMN status somente nas linhas 11–12. Não existe DROP TABLE, TRUNCATE, DELETE ou CREATE TABLE. OrderItemStatus contém somente REQUESTED, IN_PREPARATION e DELIVERED, com DELIVERED como default para linhas existentes. EstablishmentCategory contém somente os seis valores da spec; category é nullable e sem default. Portanto não há valor órfão possível.

O schema commitado é consistente com a SQL e com a spec: Order.isOpen Boolean @default(true), OrderItem.status OrderItemStatus @default(DELIVERED), Establishment.category nullable e índice TB_ORDERS_establishmentId_isOpen_idx.

## Evidência real dos comandos

### Commit

Comando:

    rtk git show d1ee7de --stat

Saída:

~~~text
commit d1ee7de0322e5d8ebbcb3a8848f78b1d13873eed
Author: Victor H. T. Filho <victorhugo.tozzo@gmail.com>
Date:   Thu Aug 27 10:53:44 2026 -0300

    feat(prisma): add order item status and establishment category

 .../migration.sql                                  |  29 ++++
 prisma/schema.prisma                               |  21 ++-
 tests/prisma/schema-rename.migration.test.ts       | 187 ++++++++++++++++++---
 3 files changed, 214 insertions(+), 23 deletions(-)
~~~

Comando do diff completo, lido integralmente:

    rtk git show d1ee7de --format=medium --unified=20 --no-color

Saída real do diff, incluindo todas as linhas alteradas da migration e do schema:

~~~diff
diff --git a/prisma/migrations/20260827120000_order_item_status_establishment_category/migration.sql b/prisma/migrations/20260827120000_order_item_status_establishment_category/migration.sql
new file mode 100644
index 0000000..e4f1e2b
--- /dev/null
+++ b/prisma/migrations/20260827120000_order_item_status_establishment_category/migration.sql
@@ -0,0 +1,29 @@
+ALTER TABLE "TB_ORDERS"
+  ADD COLUMN "isOpen" BOOLEAN NOT NULL DEFAULT true;
+
+UPDATE "TB_ORDERS"
+SET "isOpen" = false
+WHERE "status" = 'CLOSED';
+
+CREATE INDEX "TB_ORDERS_establishmentId_isOpen_idx"
+  ON "TB_ORDERS" ("establishmentId", "isOpen");
+
+ALTER TABLE "TB_ORDERS"
+  DROP COLUMN "status";
+
+CREATE TYPE "OrderItemStatus" AS ENUM ('REQUESTED', 'IN_PREPARATION', 'DELIVERED');
+
+ALTER TABLE "RL_ORDER_PRODUCT"
+  ADD COLUMN "status" "OrderItemStatus" NOT NULL DEFAULT 'DELIVERED';
+
+CREATE TYPE "EstablishmentCategory" AS ENUM (
+  'HAMBURGUERIA',
+  'PIZZARIA',
+  'SORVETERIA',
+  'CAFETERIA',
+  'LANCHONETE',
+  'OUTRO'
+);
+
+ALTER TABLE "TB_ESTABLISHMENTS"
+  ADD COLUMN "category" "EstablishmentCategory";
diff --git a/prisma/schema.prisma b/prisma/schema.prisma
index 3e0972a..d7de246 100644
--- a/prisma/schema.prisma
+++ b/prisma/schema.prisma
@@ -1,72 +1,82 @@
 model Establishment {
+  category              EstablishmentCategory?
 }
 
+enum EstablishmentCategory {
+  HAMBURGUERIA
+  PIZZARIA
+  SORVETERIA
+  CAFETERIA
+  LANCHONETE
+  OUTRO
+}
+
 model Order {
-  status          String        @default("OPEN")
+  isOpen          Boolean       @default(true)
@@
-  @@index([establishmentId, status], map: "TB_ORDERS_establishmentId_status_idx")
+  @@index([establishmentId, isOpen], map: "TB_ORDERS_establishmentId_isOpen_idx")
 }
 
 model OrderItem {
+  status           OrderItemStatus @default(DELIVERED)
 }
 
+enum OrderItemStatus {
+  REQUESTED
+  IN_PREPARATION
+  DELIVERED
+}
~~~

The test part of the same diff was also read completely; its added assertions cover table row counts, CLOSED to false, OPEN to true, item defaults, NULL category, both enums, replacement index, all FKs, removal of the legacy status column, defaults and Prisma Client reads/writes.

### Migration lida por completo

Comando:

    rtk read --line-numbers prisma\migrations\20260827120000_order_item_status_establishment_category\migration.sql

Saída:

~~~text
 1 │ ALTER TABLE "TB_ORDERS"
 2 │   ADD COLUMN "isOpen" BOOLEAN NOT NULL DEFAULT true;
 3 │ 
 4 │ UPDATE "TB_ORDERS"
 5 │ SET "isOpen" = false
 6 │ WHERE "status" = 'CLOSED';
 7 │ 
 8 │ CREATE INDEX "TB_ORDERS_establishmentId_isOpen_idx"
 9 │   ON "TB_ORDERS" ("establishmentId", "isOpen");
10 │ 
11 │ ALTER TABLE "TB_ORDERS"
12 │   DROP COLUMN "status";
13 │ 
14 │ CREATE TYPE "OrderItemStatus" AS ENUM ('REQUESTED', 'IN_PREPARATION', 'DELIVERED');
15 │ 
16 │ ALTER TABLE "RL_ORDER_PRODUCT"
17 │   ADD COLUMN "status" "OrderItemStatus" NOT NULL DEFAULT 'DELIVERED';
18 │ 
19 │ CREATE TYPE "EstablishmentCategory" AS ENUM (
20 │   'HAMBURGUERIA',
21 │   'PIZZARIA',
22 │   'SORVETERIA',
23 │   'CAFETERIA',
24 │   'LANCHONETE',
25 │   'OUTRO'
26 │ );
27 │ 
28 │ ALTER TABLE "TB_ESTABLISHMENTS"
29 │   ADD COLUMN "category" "EstablishmentCategory";
~~~

### Teste focado executado por mim

Comando solicitado:

    bun test tests/prisma/schema-rename.migration.test.ts

Saída:

~~~text
bun test v1.4.0 (34cbb9a40)

tests\prisma\schema-rename.migration.test.ts:
T1_INVARIANTS rowsBefore={"TB_ESTABLISHMENTS":1,"TB_USERS":4,"TB_PRODUCT_TYPES":1,"TB_PRODUCTS":2,"TB_ORDERS":4,"TB_SALES":2,"RL_ORDER_PRODUCT":2,"RL_SALE_PRODUCT":1,"TB_PRINTERS":1,"TB_DEVICES":1} rowsAfter={"TB_ESTABLISHMENTS":1,"TB_USERS":4,"TB_PRODUCT_TYPES":1,"TB_PRODUCTS":2,"TB_ORDERS":4,"TB_SALES":2,"RL_ORDER_PRODUCT":2,"RL_SALE_PRODUCT":1,"TB_PRINTERS":1,"TB_DEVICES":1}
T1_INVARIANTS isOpen=[{"id":"order-closed","isOpen":false},{"id":"order-open","isOpen":true}] itemStatus=[{"id":"order-item-1","status":"DELIVERED"},{"id":"order-item-2","status":"DELIVERED"}] categoryNull=1

1 pass
0 fail
46 expect() calls
Ran 1 test across 1 file. [5.73s]
~~~

Exit code observado: 0.

### Prisma generate executado por mim

Comando:

    bunx prisma generate

Saída:

~~~text
Loaded Prisma config from prisma.config.ts.

Prisma schema loaded from prisma\schema.prisma

✔ Generated Prisma Client (v7.1.0) to .\node_modules\@prisma\client in 89ms

Start by importing Prisma Client (See: https://pris.ly/d/importing-client)

Tip: Want to turn off tips? https://pris.ly/tip-4-nohints
~~~

Exit code observado: 0.

### Suíte completa executada por mim

Comando solicitado:

    bun test --isolate --parallel

Saída:

~~~text
bun test v1.4.0 (34cbb9a40) 16× PARALLEL

tests\lib\sse.test.ts:
[dotenv@17.2.3] injecting env (0) from .env -- tip: 🔐 encrypt with Dotenvx: https://dotenvx.com

tests\middlewares\sseAuth.middleware.test.ts:
[dotenv@17.2.3] injecting env (0) from .env -- tip: 🛠️ run anywhere with dotenvx

tests\app\cors.test.ts:
(node:35824) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
[dotenv@17.2.3] injecting env (0) from .env -- tip: 🔐 prevent committing .env

tests\payments\payments.webhook.test.ts:
[WEBHOOK] Received event: invoice.payment_succeeded
[WEBHOOK] Ignoring invoice.payment_succeeded (subscription_create) to avoid duplication.
[WEBHOOK] Error verifying signature: No signatures found matching the expected signature for payload.
[WEBHOOK] Error verifying signature: Missing stripe signature
[WEBHOOK] Error verifying signature: No signatures found matching the expected signature for payload.

tests\charts\charts.controller.test.ts:
[dotenv@17.2.3] injecting env (0) from .env -- tip: ⚙️ suppress all logs

tests\sync\sync.regression.test.ts:
[sync] 1 item(s) ignored during synchronization
[sync] 2 item(s) ignored during synchronization
[sync] 3 item(s) ignored during synchronization
[sync] 1 item(s) ignored during synchronization

tests\orders\orders.controller.test.ts:
[OrderError] You have reached the limit of 3 unfinished orders
[OrderError] Product inexistente is invalid or was not found
[OrderError] Order not found
[OrderError] Order is already closed
[OrderError] Order not found
[OrderError] This order cannot be edited because it is not open
[OrderError] Product fantasma is invalid or was not found

tests\sync\sync.controller.test.ts:
[SyncPayloadError] Invalid sync payload at products[0].name: conflicting aliases name and nome
[SyncPayloadError] Invalid sync payload at body.products: expected an array

tests\auth\auth.controller.test.ts:
[AUTH] Register attempt: a@a.com
[AUTH] Global active limit reached
[AUTH] Register attempt: novo@a.com
[AUTH] Global pending buffer reached
[AUTH] User already exists: existing@test.com
[AUTH] No valid registration key. Setting status to PENDING_PAYMENT.
[AUTH] Establishment created: estab-1
[AUTH] User created: user-2
[AUTH] Registration successful (pending payment).
[AUTH] Valid registration key used. Setting status to ACTIVE.
[AUTH] Establishment created: estab-1
[AUTH] User created: user-2
[AUTH] Registration successful (active).
[AUTH] Login failed: user not found
[AUTH] Login failed: invalid password
[AUTH] Subscription expired for estab-1. Updating status...
[AUTH] Login attempt: ok@test.com

tests\sales\sales.controller.test.ts:
tests\prisma\schema-rename.migration.test.ts:
T1_INVARIANTS rowsBefore={"TB_ESTABLISHMENTS":1,"TB_USERS":4,"TB_PRODUCT_TYPES":1,"TB_PRODUCTS":2,"TB_ORDERS":4,"TB_SALES":2,"RL_ORDER_PRODUCT":2,"RL_SALE_PRODUCT":1,"TB_PRINTERS":1,"TB_DEVICES":1} rowsAfter={"TB_ESTABLISHMENTS":1,"TB_USERS":4,"TB_PRODUCT_TYPES":1,"TB_PRODUCTS":2,"TB_ORDERS":4,"TB_SALES":2,"RL_ORDER_PRODUCT":2,"RL_SALE_PRODUCT":1,"TB_PRINTERS":1,"TB_DEVICES":1}
T1_INVARIANTS isOpen=[{"id":"order-closed","isOpen":false},{"id":"order-open","isOpen":true}] itemStatus=[{"id":"order-item-1","status":"DELIVERED"},{"id":"order-item-2","status":"DELIVERED"}] categoryNull=1

201 pass
0 fail
521 expect() calls
Ran 201 tests across 26 files. [7.82s]
~~~

Exit code observado: 0.

### Typecheck executado por mim

Comando solicitado:

    bunx tsc --noEmit

Saída:

~~~text
modules/orders/orders.controller.ts(50,11): error TS2353: Object literal may only specify known properties, and 'status' does not exist in type 'OrderWhereInput'.
modules/orders/orders.controller.ts(84,9): error TS2353: Object literal may only specify known properties, and 'status' does not exist in type 'Without<OrderCreateInput, OrderUncheckedCreateInput> & OrderUncheckedCreateInput'.
modules/orders/orders.controller.ts(326,15): error TS2339: Property 'status' does not exist on type '{ establishmentId: string; customerName: string | null; sellerId: string; updatedAt: Date; deletedAt: Date | null; openedAt: Date; id: string; total: Decimal; isOpen: boolean; }'.
modules/sync/sync.controller.ts(375,15): error TS2353: Object literal may only specify known properties, and 'status' does not exist in type 'OrderWhereInput'.
modules/sync/sync.controller.ts(376,15): error TS2353: Object literal may only specify known properties, and 'status' does not exist in type 'OrderWhereInput'.
~~~

Exit code observado: 1. São exatamente 5 erros, todos nas referências legadas a Order.status que a Task 2 deve portar.

### Evidência do Postgres efêmero

A leitura direta do teste confirmou: imagem postgres:16-alpine; nome de container aleatório com prefixo tozzo-t1; --rm; publicação em 127.0.0.1::5432; URL construída a partir da porta aleatória; e o comando histórico de migrate deploy recebe explicitamente DATABASE_URL=databaseUrl, não a DATABASE_URL do .env. O teste aplica a migration da Task 1 dentro de BEGIN/COMMIT, mede as dez tabelas antes/depois e faz ROLLBACK em erro.

Após os testes:

~~~text
docker ps -a --filter "name=tozzo-t1" --format "container={{.Names}} status={{.Status}} image={{.Image}}"
(exit code 0; saída vazia)
~~~

### Histórico de comandos proibidos

Verifiquei o histórico global de PowerShell:

~~~text
$ rtk grep -vvv -n "prisma db push" "C:\Users\lipoi\AppData\Roaming\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt"
grep: 'prisma db push' in C:\Users\lipoi\AppData\Roaming\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt
0 matches for 'prisma db push'

$ rtk grep -vvv -n "prisma migrate reset" "C:\Users\lipoi\AppData\Roaming\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt"
grep: 'prisma migrate reset' in C:\Users\lipoi\AppData\Roaming\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt
0 matches for 'prisma migrate reset'

$ rtk grep -vvv -n "DROP TABLE" "C:\Users\lipoi\AppData\Roaming\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt"
grep: 'DROP TABLE' in C:\Users\lipoi\AppData\Roaming\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt
0 matches for 'DROP TABLE'

$ rtk grep -vvv -n "TRUNCATE" "C:\Users\lipoi\AppData\Roaming\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt"
grep: 'TRUNCATE' in C:\Users\lipoi\AppData\Roaming\Microsoft\Windows\PowerShell\PSReadLine\ConsoleHost_history.txt
0 matches for 'TRUNCATE'
~~~

Também auditei os quatro logs de sessão de 27/08 ligados ao worker e filtrei exclusivamente payloads que chamavam tools.exec_command, excluindo texto de relatório/prompt:

~~~text
No exact prohibited term in payloads containing tools.exec_command.
~~~

O histórico registrado mostra inspeção, Bun test, Prisma generate, o teste com Postgres efêmero, typecheck e git add/commit; não mostra comando proibido nem escrita contra banco real.

### Estado final após a revisão

Comandos:

    rtk git status --short --branch
    rtk git diff --name-only

Saída:

~~~text
## feat/fase-7-sync-status-categoria

~~~

O reviewer não alterou arquivo de código e não criou commit.

### Registro literal da segunda execução da suíte (sequências ANSI removidas)

~~~text
bun test v1.4.0 (34cbb9a40) 16× PARALLEL

tests\lib\sse.test.ts:
[dotenv@17.2.3] injecting env (0) from .env -- tip: ⚙️  write to custom object with { processEnv: myObject }

tests\middlewares\sseAuth.middleware.test.ts:
[dotenv@17.2.3] injecting env (0) from .env -- tip: 🔄 add secrets lifecycle management: https://dotenvx.com/ops

tests\app\cors.test.ts:
(node:32980) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `bun.exe --trace-warnings ...` to show where the warning was created)
[dotenv@17.2.3] injecting env (0) from .env -- tip: ⚙️  enable debug logging with { debug: true }
[dotenv@17.2.3] injecting env (0) from .env -- tip: 👥 sync secrets across teammates & machines: https://dotenvx.com/ops

tests\sales\sales.controller.test.ts:
(node:48408) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `bun.exe --trace-warnings ...` to show where the warning was created)
[dotenv@17.2.3] injecting env (0) from .env -- tip: ⚙️  override existing env vars with { override: true }

tests\devices\devices.controller.test.ts:
(node:17592) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `bun.exe --trace-warnings ...` to show where the warning was created)
[dotenv@17.2.3] injecting env (0) from .env -- tip: ⚙️  write to custom object with { processEnv: myObject }

tests\charts\charts.controller.test.ts:
(node:27396) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `bun.exe --trace-warnings ...` to show where the warning was created)
[dotenv@17.2.3] injecting env (0) from .env -- tip: ⚙️  override existing env vars with { override: true }

tests\auth\auth.controller.test.ts:
(node:46784) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `bun.exe --trace-warnings ...` to show where the warning was created)
[dotenv@17.2.3] injecting env (0) from .env -- tip: ⚙️  override existing env vars with { override: true }
[AUTH] Register attempt: a@a.com

tests\app\app.test.ts:
(node:3520) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `bun.exe --trace-warnings ...` to show where the warning was created)
[dotenv@17.2.3] injecting env (0) from .env -- tip: ✅ audit secrets and track compliance: https://dotenvx.com/ops
[dotenv@17.2.3] injecting env (0) from .env -- tip: 📡 add observability to secrets: https://dotenvx.com/ops

tests\establishments\establishments.controller.test.ts:
(node:47864) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `bun.exe --trace-warnings ...` to show where the warning was created)
[dotenv@17.2.3] injecting env (0) from .env -- tip: 🔑 add access controls to secrets: https://dotenvx.com/ops

tests\payments\payments.webhook.test.ts:
(node:8268) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `bun.exe --trace-warnings ...` to show where the warning was created)
[dotenv@17.2.3] injecting env (0) from .env -- tip: 👥 sync secrets across teammates & machines: https://dotenvx.com/ops
[WEBHOOK] Received event: invoice.payment_succeeded
[WEBHOOK] Ignoring invoice.payment_succeeded (subscription_create) to avoid duplication.
[WEBHOOK] Error verifying signature: No signatures found matching the expected signature for payload. Are you passing the raw request body you received from Stripe? 
 If a webhook request is being forwarded by a third-party tool, ensure that the exact request body, including JSON formatting and new line style, is preserved.

Learn more about webhook signing and explore webhook integration examples for various frameworks at https://docs.stripe.com/webhooks/signature

[WEBHOOK] Error verifying signature: Missing stripe signature
[WEBHOOK] Error verifying signature: No signatures found matching the expected signature for payload. Are you passing the raw request body you received from Stripe? 
 If a webhook request is being forwarded by a third-party tool, ensure that the exact request body, including JSON formatting and new line style, is preserved.

Learn more about webhook signing and explore webhook integration examples for various frameworks at https://docs.stripe.com/webhooks/signature


tests\products\products.controller.test.ts:
(node:34612) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `bun.exe --trace-warnings ...` to show where the warning was created)
[dotenv@17.2.3] injecting env (0) from .env -- tip: ⚙️  suppress all logs with { quiet: true }

tests\sync\sync.regression.test.ts:
(node:20060) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `bun.exe --trace-warnings ...` to show where the warning was created)
[dotenv@17.2.3] injecting env (0) from .env -- tip: ⚙️  enable debug logging with { debug: true }
[sync] 1 item(s) ignored during synchronization [
  {
    type: "order-item",
    entityId: "mobile-order-001",
    productId: "NaN",
  }
]

tests\auth\auth.controller.test.ts:
[AUTH] Register attempt: novo@a.com
[AUTH] Global active limit reached
[AUTH] Register attempt: novo@a.com
[AUTH] Global pending buffer reached

tests\sync\sync.regression.test.ts:
[sync] 2 item(s) ignored during synchronization [
  {
    type: "product",
    entityId: "p-incomplete",
    reason: "missing required fields: price",
  }, {
    type: "sale",
    entityId: "s-incomplete",
    reason: "missing required fields: total",
  }
]
[sync] 3 item(s) ignored during synchronization [
  {
    type: "product",
    entityId: "p-unknown-tombstone",
    reason: "missing required fields for an unknown deletion tombstone",
  }, {
    type: "order",
    entityId: "o-unknown-tombstone",
    reason: "missing required fields for an unknown deletion tombstone",
  }, {
    type: "sale",
    entityId: "s-unknown-tombstone",
    reason: "missing required fields for an unknown cancellation tombstone",
  }
]
[sync] 1 item(s) ignored during synchronization [
  {
    type: "order-item",
    entityId: "o-valid",
    productId: "missing-product",
  }
]

tests\orders\orders.controller.test.ts:
(node:46936) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `bun.exe --trace-warnings ...` to show where the warning was created)
[dotenv@17.2.3] injecting env (0) from .env -- tip: ⚙️  override existing env vars with { override: true }
52 |           deletedAt: null,
53 |         },
54 |       });
55 | 
56 |       if (openOrdersCount >= 3) {
57 |         throw new OrderError('ORDER_LIMIT_REACHED', 'You have reached the limit of 3 unfinished orders', 400);
                   ^
error: You have reached the limit of 3 unfinished orders
 status: 400,
   code: "ORDER_LIMIT_REACHED"

      at <anonymous> (C:\RN\api\api-tozzo.uk\modules\orders\orders.controller.ts:57:15)
      at async handle (file:///C:/RN/api/api-tozzo.uk/node_modules/elysia/dist/bun/index.js:48:20)


tests\sync\sync.controller.test.ts:
(node:46908) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `bun.exe --trace-warnings ...` to show where the warning was created)
[dotenv@17.2.3] injecting env (0) from .env -- tip: ⚙️  suppress all logs with { quiet: true }
[sync] 1 item(s) ignored during synchronization [
  {
    type: "order-item",
    entityId: "p1",
    productId: "NaN",
  }
]
63 |   if (present.length === 0) return undefined;
64 | 
65 |   const first = record[present[0]!];
66 |   for (const alias of present.slice(1)) {
67 |     if (!deepEqual(first, record[alias])) {
68 |       throw new SyncPayloadError(path, `conflicting aliases ${present.join(' and ')}`);
                 ^
SyncPayloadError: Invalid sync payload at products[0].name: conflicting aliases name and nome
 path: "products[0].name",

      at readAlias (C:\RN\api\api-tozzo.uk\modules\sync\sync.adapter.ts:68:13)
      at normalizeProduct (C:\RN\api\api-tozzo.uk\modules\sync\sync.adapter.ts:186:32)
      at <anonymous> (C:\RN\api\api-tozzo.uk\modules\sync\sync.adapter.ts:288:26)
      at forEach (1:11)
      at normalizeList (C:\RN\api\api-tozzo.uk\modules\sync\sync.adapter.ts:286:9)
      at normalizeSyncBatch (C:\RN\api\api-tozzo.uk\modules\sync\sync.adapter.ts:305:15)
      at <anonymous> (C:\RN\api\api-tozzo.uk\modules\sync\sync.controller.ts:45:19)
      at handle (file:///C:/RN/api/api-tozzo.uk/node_modules/elysia/dist/bun/index.js:38:20)

279 |   entityType: SyncEntityType,
280 |   normalize: (item: unknown, index: number) => T,
281 |   invalidEntities: InvalidSyncEntity[],
282 | ): T[] {
283 |   if (value === undefined) return [];
284 |   if (!Array.isArray(value)) throw new SyncPayloadError(path, 'expected an array');
                                         ^
SyncPayloadError: Invalid sync payload at body.products: expected an array
 path: "body.products",

      at normalizeList (C:\RN\api\api-tozzo.uk\modules\sync\sync.adapter.ts:284:36)
      at normalizeSyncBatch (C:\RN\api\api-tozzo.uk\modules\sync\sync.adapter.ts:305:15)
      at <anonymous> (C:\RN\api\api-tozzo.uk\modules\sync\sync.controller.ts:45:19)
      at handle (file:///C:/RN/api/api-tozzo.uk/node_modules/elysia/dist/bun/index.js:38:20)


tests\orders\orders.controller.test.ts:
65 |       const productId = item.productId ?? item.produtoId;
66 |       const quantity = Number(item.quantity ?? item.quantidade);
67 |       const product = await prisma.product.findUnique({ where: { id: productId } });
68 | 
69 |       if (!product || product.establishmentId !== establishmentId) {
70 |         throw new OrderError('PRODUCT_NOT_FOUND', `Product ${productId} is invalid or was not found`, 400);
                   ^
error: Product inexistente is invalid or was not found
 status: 400,
   code: "PRODUCT_NOT_FOUND"

      at <anonymous> (C:\RN\api\api-tozzo.uk\modules\orders\orders.controller.ts:70:15)
      at async handle (file:///C:/RN/api/api-tozzo.uk/node_modules/elysia/dist/bun/index.js:48:20)

180 |       const order = await tx.order.findFirst({
181 |         where: { id, establishmentId },
182 |         include: { items: { include: { product: true } } },
183 |       });
184 | 
185 |       if (!order) throw new OrderError('ORDER_NOT_FOUND', 'Order not found', 404);
                              ^
error: Order not found
 status: 404,
   code: "ORDER_NOT_FOUND"

      at <anonymous> (C:\RN\api\api-tozzo.uk\modules\orders\orders.controller.ts:185:25)

181 |         where: { id, establishmentId },
182 |         include: { items: { include: { product: true } } },
183 |       });
184 | 
185 |       if (!order) throw new OrderError('ORDER_NOT_FOUND', 'Order not found', 404);
186 |       if (order.status === ORDER_STATUS.CLOSED) throw new OrderError('ORDER_ALREADY_CLOSED', 'Order is already closed', 400);
                                                            ^
error: Order is already closed
 status: 400,
   code: "ORDER_ALREADY_CLOSED"

      at <anonymous> (C:\RN\api\api-tozzo.uk\modules\orders\orders.controller.ts:186:55)

253 |     const result = await prisma.$transaction(async (tx: any) => {
254 |       const whereClause: any = { id, establishmentId };
255 |       if (roleOf(user) === UserRole.CUSTOMER) whereClause.sellerId = userId;
256 | 
257 |       const order = await tx.order.findFirst({ where: whereClause });
258 |       if (!order) throw new OrderError('ORDER_NOT_FOUND', 'Order not found', 404);
                              ^
error: Order not found
 status: 404,
   code: "ORDER_NOT_FOUND"

      at <anonymous> (C:\RN\api\api-tozzo.uk\modules\orders\orders.controller.ts:258:25)

255 |       if (roleOf(user) === UserRole.CUSTOMER) whereClause.sellerId = userId;
256 | 
257 |       const order = await tx.order.findFirst({ where: whereClause });
258 |       if (!order) throw new OrderError('ORDER_NOT_FOUND', 'Order not found', 404);
259 |       if (order.status !== ORDER_STATUS.OPEN) {
260 |         throw new OrderError('ORDER_NOT_OPEN', 'This order cannot be edited because it is not open', 400);
                    ^
error: This order cannot be edited because it is not open
 status: 400,
   code: "ORDER_NOT_OPEN"

      at <anonymous> (C:\RN\api\api-tozzo.uk\modules\orders\orders.controller.ts:260:15)

269 |         for (const item of inputItems) {
270 |           const productId = item.productId ?? item.produtoId;
271 |           const quantity = Number(item.quantity ?? item.quantidade);
272 |           const product = await tx.product.findUnique({ where: { id: productId } });
273 |           if (!product || product.establishmentId !== establishmentId) {
274 |             throw new OrderError('PRODUCT_NOT_FOUND', `Product ${productId} is invalid or was not found`, 400);
                        ^
error: Product fantasma is invalid or was not found
 status: 400,
   code: "PRODUCT_NOT_FOUND"

      at <anonymous> (C:\RN\api\api-tozzo.uk\modules\orders\orders.controller.ts:274:19)


tests\product-types\product-types.controller.test.ts:
(node:39196) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `bun.exe --trace-warnings ...` to show where the warning was created)
[dotenv@17.2.3] injecting env (0) from .env -- tip: 🗂️ backup and recover secrets: https://dotenvx.com/ops

tests\auth\auth.controller.test.ts:
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

tests\prisma\schema-rename.migration.test.ts:
T1_INVARIANTS rowsBefore={"TB_ESTABLISHMENTS":1,"TB_USERS":4,"TB_PRODUCT_TYPES":1,"TB_PRODUCTS":2,"TB_ORDERS":4,"TB_SALES":2,"RL_ORDER_PRODUCT":2,"RL_SALE_PRODUCT":1,"TB_PRINTERS":1,"TB_DEVICES":1} rowsAfter={"TB_ESTABLISHMENTS":1,"TB_USERS":4,"TB_PRODUCT_TYPES":1,"TB_PRODUCTS":2,"TB_ORDERS":4,"TB_SALES":2,"RL_ORDER_PRODUCT":2,"RL_SALE_PRODUCT":1,"TB_PRINTERS":1,"TB_DEVICES":1}
T1_INVARIANTS isOpen=[{"id":"order-closed","isOpen":false},{"id":"order-open","isOpen":true}] itemStatus=[{"id":"order-item-1","status":"DELIVERED"},{"id":"order-item-2","status":"DELIVERED"}] categoryNull=1

tests\auth\auth.controller.test.ts:
[AUTH] Login attempt: pedro@test.com
[AUTH] Subscription expired for estab-1. Updating status...
[AUTH] Login attempt: ok@test.com

 201 pass
 0 fail
 521 expect() calls
Ran 201 tests across 26 files. [8.05s]
~~~

Exit code observado: 0.
