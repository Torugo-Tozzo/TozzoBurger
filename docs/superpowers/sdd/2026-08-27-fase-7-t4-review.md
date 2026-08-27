# Revisão independente — Fase 7, Task 4 (WatermelonDB: schema e models)

Data: 2026-08-27  
Repositório: `C:\RN\TozzoBurger`  
Branch: `feat/fase-7-sync-status-categoria`  
Commit revisado: `f5f5dbec100726052ca6cbf747491aa01719196b` (`feat-mobile-watermelondb-schema-models`)

## Veredito final

**APROVADO**

Não encontrei achado Critical ou Important. O commit atende o escopo da
Task 4: adiciona apenas a infraestrutura WatermelonDB, sem migrar hooks, e
os nomes/colunas dos seis conjuntos sincronizados coincidem com o controller
da Task 3. Há um risco LOW de integração futura, registrado abaixo, que deve
ser fechado na Task 8 antes de habilitar o sync do mobile, mas não bloqueia
esta task isolada.

## Resumo de severidade

| Severidade | Quantidade | Bloqueia a Task 4 |
|---|---:|---|
| Critical | 0 | — |
| Important | 0 | — |
| Medium | 0 | — |
| Low | 1 | Não |
| Informativo | 2 | Não |

Risco geral do commit: **LOW**. O código novo ainda não possui callers de
produção; o impacto operacional começa quando as Tasks 5–8 passarem a usar a
instância e o sync.

## O que mudou

`git show f5f5dbe --stat --oneline` reportou **15 arquivos e 675 linhas
adicionadas**:

- schema WatermelonDB v1 com `products`, `product_types`, `orders`,
  `order_items`, `sales`, `sale_items`, `users` e `printers`;
- oito models com decorators, relações e children;
- singleton `Database` com `SQLiteAdapter`, `jsi: true`, `dbName:
  'tozzoburger'` e migrations vazias para a versão inicial;
- dependência `@nozbe/watermelondb@0.28.0`, `better-sqlite3@13.0.3` para o
  teste Node e `experimentalDecorators`;
- teste de criação/leitura de um registro em cada tabela e de todas as
  relações declaradas.

O diff completo de `f5f5dbe` foi lido. Não há remoção de código de validação,
autorização ou segurança; os arquivos de domínio existentes não aparecem no
commit.

## Checklist da Task 4

### 1. Compatibilidade com o payload da Task 3

O controller da API declara exatamente as seis tabelas sincronizadas em
`C:\RN\api\api-tozzo.uk\modules\sync\sync.controller.ts:L36-L42`:

`products`, `product_types`, `orders`, `order_items`, `sales` e `sale_items`.

A comparação independente entre `rawProduct`, `rawProductType`, `rawOrder`,
`rawOrderItem`, `rawSale` e `rawSaleItem` do controller
(`sync.controller.ts:L208-L289`) e `database/watermelon/schema.ts` deu:

| Tabela | Campos raw do controller | Schema local |
|---|---|---|
| `products` | `id`, `name`, `price`, `ingredients`, `product_type_id`, `source_product_id`, `establishment_id`, `created_at`, `updated_at` | `schema.ts:L12-L20` + `id` implícito |
| `product_types` | `id`, `description`, `is_active`, `color`, `created_at`, `updated_at` | `schema.ts:L24-L29` + `id` implícito |
| `orders` | `id`, `is_open`, `customer_name`, `opened_at`, `created_at`, `updated_at`, `total`, `establishment_id`, `seller_id` | `schema.ts:L33-L41` + `id` implícito |
| `order_items` | `id`, `quantity`, `status`, `order_id`, `product_id`, `unit_price_at_order`, `created_at`, `updated_at` | `schema.ts:L45-L52` + `id` implícito |
| `sales` | `id`, `total`, `sold_at`, `customer_name`, `is_cancelled`, `created_at`, `updated_at`, `establishment_id`, `seller_id`, `order_id` | `schema.ts:L56-L65` + `id` implícito |
| `sale_items` | `id`, `quantity`, `sale_id`, `product_id`, `unit_price_at_sale`, `created_at`, `updated_at` | `schema.ts:L69-L75` + `id` implícito |

O controller usa `ChangeSet.deleted: string[]`
(`sync.controller.ts:L18`) e envia tombstones como arrays de IDs
(`sync.controller.ts:L879-L910`); não envia `deleted_at` nos registros raw.
Portanto a ausência de `deleted_at` no schema Watermelon é correta para o
protocolo da T3, e não uma divergência.

Não há código de `category` no diretório novo (`git grep -ni category
f5f5dbe -- database/watermelon` não retornou resultado). Isso está correto:
`Establishment.category` fica na API e não foi duplicado numa tabela de
estabelecimento local inexistente.

### 2. Status e tipos de domínio

- `Order.isOpen` está no model como `@field('is_open') isOpen!: boolean` em
  `database/watermelon/models/Order.ts:L17-L24`, e a coluna é boolean em
  `schema.ts:L38`.
- `OrderItem.status` está no model como enum-like string
  `REQUESTED | IN_PREPARATION | DELIVERED` em
  `database/watermelon/models/OrderItem.ts:L8-L26`, e a coluna é string em
  `schema.ts:L48`.
- `SaleItem.ts:L8-L23` não declara `status`; a busca
  `git grep -ni status f5f5dbe -- database/watermelon/models/SaleItem.ts ...`
  só encontrou o status de `OrderItem` e a coluna de `order_items`.

Não existe validação de transição nesta task, o que é adequado: a transição
livre será comportamento do hook/UI da Task 6.

### 3. ProductType.id numérico no servidor

O Prisma da API confirma `ProductType.id Int @default(autoincrement())` em
`C:\RN\api\api-tozzo.uk\prisma\schema.prisma:L63-L70`. O Watermelon model
não declara um `id` próprio — usa o `Model.id` herdado, que é `string`
(`node_modules/@nozbe/watermelondb/Model/index.d.ts:L12,L44`). Também não há
`server_id` em `schema.ts:L23-L30` ou `ProductType.ts:L7-L18`.

Isso não constitui bloqueio nesta task por dois motivos verificáveis:

1. O controller da T3 já normaliza o ID do servidor no pull com
   `id: String(row.id)` em `sync.controller.ts:L223-L231`; o Watermelon aceita
   a representação string decimal (`'7'`) como ID local.
2. A política de IDs e a conversão do wire foram explicitamente deixadas para
   a Task 8 no relatório do worker. A ausência de `server_id` não impede
   adicionar essa coluna numa migration futura caso a política escolhida
   precise dela.

### LOW-01 — Conversão de IDs numéricos não está codificada nem coberta no teste

**Arquivos:** `database/watermelon/schema.ts:L16-L17`,
`database/watermelon/models/Product.ts:L19-L25`,
`database/watermelon/models/ProductType.ts:L7-L18`  
**Impacto:** risco de perda silenciosa de vínculo de tipo/origem na primeira
implementação do sync mobile.  
**Bloqueia Task 4:** não.

O controller envia `product_type_id` e `source_product_id` sem conversão em
`sync.controller.ts:L215-L216`; esses valores são numéricos no Prisma
(`schema.prisma:L84-L86`), enquanto as colunas locais são strings
(`schema.ts:L16-L17`). A implementação instalada do Watermelon sanitiza um
valor numérico recebido para uma coluna string opcional como `null`. A prova
executada foi:

```text
node -e ...sanitizedRaw({id:'p1',product_type_id:7,source_product_id:42},schema)...
{"id":"p1","_status":"created","_changed":"","product_type_id":null,"source_product_id":null}
```

O mesmo comportamento confirma que um ID raw numérico também não pode ser
passado diretamente como `record.id`; a prova com `id:7` gerou um novo ID
aleatório, enquanto `id:'7'` preservou `"7"`. A API já envia o
`product_types.id` como string no pull, mas um `ProductType.create()` local
sem ID explícito gera UUID (o teste faz isso em
`watermelonDatabase.test.ts:L75-L81`). Se esse UUID for enviado como
`product_types.id`, o parser numérico da T3 (`productTypeNumberId` em
`sync.controller.ts:L174-L178`) não o aceitará.

**Ação recomendada para Task 8:** definir e testar um único contrato: no
pull, converter todos os IDs numéricos (`product_types.id`,
`products.product_type_id` e `products.source_product_id`) para strings antes
de aplicar no Watermelon; no push, garantir que ProductType local seja criado
com o ID decimal string retornado pelo servidor ou manter um campo auxiliar
`server_id` com migration e mapear as relações. O teste de sync deve incluir
uma resposta raw realista, não apenas o teste de Model API da Task 4.

## Hooks e blast radius

`git diff --name-status f5f5dbe~1 f5f5dbe` listou somente os oito models, schema,
database, migrations, teste, `package.json`, `package-lock.json` e
`tsconfig.json`. Não listou:

- `database/useProductDatabase.ts`;
- `database/useOrderDatabase.ts`;
- `database/useSaleDatabase.ts`;
- `database/useUserDatabase.ts`;
- `database/usePrinterDatabase.ts`;
- `database/salesQuery.ts`; ou
- `database/initializeDatabase.ts`.

Adicionalmente, `git diff --quiet f5f5dbe~1 f5f5dbe --` sobre esses sete
arquivos terminou com `exit_code=0`. O grep de `Watermelon` no commit mostra
apenas o teste e a infraestrutura nova; nenhum hook existente importa a
instância nova. Portanto o blast radius efetivo desta task é zero em runtime
atual, com dependência futura concentrada nas Tasks 5–8.

As tabelas `users` e `printers` são locais e não aparecem no `SYNC_TABLES` da
T3. Isso é compatível com o escopo desta task; a Task 8 deve mantê-las fora
do wire ou tratá-las explicitamente como local-only.

## Cobertura de testes

O teste novo em `database/__tests__/watermelonDatabase.test.ts:L60-L252`
instancia SQLite em memória, cria e lê um registro de cada uma das oito
tabelas e verifica as relações/children. Ele cobre schema, decorators,
associações, datas, boolean e status string.

Não cobre ainda:

- aplicação de uma resposta `pullChanges` raw;
- conversão de IDs numéricos;
- `deleted`/tombstones; ou
- build nativo Android/iOS com JSI real.

Essas lacunas são coerentes com a divisão de escopo — sync fica na Task 8 e
o build nativo está no QA integrado — mas a conversão deve ser uma condição
de aceite da Task 8.

## Evidência de comandos executados

### Diff e estado

```text
git show f5f5dbe --stat --oneline
f5f5dbe feat-mobile-watermelondb-schema-models
15 files changed, 675 insertions(+)
```

`git show --no-ext-diff --no-color --format=fuller f5f5dbe --` foi executado
e o diff completo foi lido. `git show --check --oneline f5f5dbe` não reportou
erros de whitespace.

O estado antes da criação deste relatório era:

```text
## feat/fase-7-sync-status-categoria
?? docs/superpowers/sdd/2026-08-27-fase-7-t4-last-message.txt
?? docs/superpowers/sdd/2026-08-27-fase-7-t4-mobile-worker.md
```

Os dois arquivos não rastreados já existiam e não foram alterados. Nenhum
código foi modificado e nenhum commit foi criado nesta revisão.

### Dependências

```text
npm ls @nozbe/watermelondb better-sqlite3 --depth=0
@nozbe/watermelondb@0.28.0
better-sqlite3@13.0.3
exit code: 0
```

### Suíte completa

Comando solicitado, executado independentemente:

```text
npx jest --watchAll=false --runInBand
Test Suites: 28 passed, 28 total
Tests:       117 passed, 117 total
Snapshots:   1 passed, 1 total
exit code: 0
```

Houve apenas logs esperados dos testes existentes e o warning do adapter
JSI no ambiente Node: `JSI SQLiteAdapter not available ... falling back to
asynchronous operation`. O teste Watermelon passou; isso não é validação de
JSI nativo.

### TypeScript

```text
npx tsc --noEmit
sem saída de erro (apenas warning do Node sobre NO_COLOR/FORCE_COLOR)
exit code: 0
```

## Histórico e metodologia

- Estratégia: revisão diferencial DEEP do commit pequeno, com leitura do
  diff completo e dos arquivos de contexto da spec/plano/worker.
- Histórico: `git log --all --oneline -S"@nozbe/watermelondb"` aponta a
  introdução no próprio `f5f5dbe`; não há código de segurança removido ou
  regressão histórica detectável neste commit.
- Contexto externo comparado: schema Prisma e
  `modules/sync/sync.controller.ts` da API presentes em
  `C:\RN\api\api-tozzo.uk`.
- Confiança: **ALTA** para o escopo da Task 4; **CONDICIONADA** para o futuro
  wire sync até LOW-01 ser coberto pela Task 8.

## Recomendação

### Antes de aceitar a Task 8

- [ ] Adicionar teste de pull com payload numérico do API e verificar que
  `product_type_id`, `source_product_id` e `product_types.id` não são
  perdidos.
- [ ] Definir a política para `ProductType` criado localmente: ID decimal
  string retornado pelo servidor ou `server_id` auxiliar com migration.
- [ ] Manter `users`/`printers` explicitamente local-only no sync novo.

### Decisão desta revisão

**APROVADO para a Task 4.** Não há alteração de código ou commit exigida
nesta revisão.
