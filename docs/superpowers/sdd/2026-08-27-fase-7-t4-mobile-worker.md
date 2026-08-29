# Fase 7 — Task 4: WatermelonDB: schema e models (mobile)

Data: 2026-08-27  
Repositório: `C:\RN\TozzoBurger`  
Branch: `feat/fase-7-sync-status-categoria`

## Pacotes instalados

- `@nozbe/watermelondb@0.28.0` — dependência de produção, declarada como
  `^0.28.0` em `package.json` e registrada no `package-lock.json`.
- `better-sqlite3@13.0.3` — `devDependency` usada somente pelo teste Jest
  com o adapter SQLite Node, conforme a seção NodeJS (SQLite) da
  [documentação oficial de instalação do WatermelonDB](https://watermelondb.dev/docs/Installation).
- `@nozbe/with-observables` não foi instalado. A documentação oficial atual
  usa `withObservables` exportado por `@nozbe/watermelondb/react`, portanto não
  há pacote separado necessário para a Task 8.

O `SQLiteAdapter` instalado aceita `jsi: true`; a instância da aplicação usa
  essa opção com `dbName: 'tozzoburger'` e `onSetUpError`.

## Estrutura criada

- `database/watermelon/schema.ts`
  - `appSchema({ version: 1, tables: [...] })` com `products`,
    `product_types`, `orders`, `order_items`, `sales`, `sale_items`, `users`
    e `printers`.
  - Colunas em `snake_case`; `_status`/`_changed` não são declaradas porque
    são campos internos do WatermelonDB. `created_at`/`updated_at` são usados
    como colunas especiais numéricas para os decorators `@date`.
  - Foreign keys `_id` são strings, conforme a convenção de relações do
    WatermelonDB; a adaptação dos IDs numéricos de `ProductType` vindos do
    wire fica para a Task 8.
- `database/watermelon/models/Product.ts`
- `database/watermelon/models/ProductType.ts`
- `database/watermelon/models/Order.ts`
- `database/watermelon/models/OrderItem.ts`
- `database/watermelon/models/Sale.ts`
- `database/watermelon/models/SaleItem.ts`
- `database/watermelon/models/User.ts`
- `database/watermelon/models/Printer.ts`
  - Decorators `@field`, `@date`, `@relation` e `@children` correspondentes
    às tabelas; `Order.isOpen` e `OrderItem.status` estão no modelo novo.
- `database/watermelon/database.ts`
  - Instância compartilhada de `Database`, `SQLiteAdapter` com `jsi: true`,
    `migrations`, `schema`, `dbName: 'tozzoburger'` e `onSetUpError`.
- `database/watermelon/migrations.ts`
  - `schemaMigrations({ migrations: [] })`.
- `database/__tests__/watermelonDatabase.test.ts`
  - Teste isolado com SQLite real em memória; cria e lê um registro de cada
    uma das oito tabelas e verifica as relações/children.

Também foi habilitado `experimentalDecorators` em `tsconfig.json`, exigido
para os decorators legados usados pelos models.

Nenhum hook existente foi migrado ou alterado.

## Verificações

Teste focado:

```text
npx jest database/__tests__/watermelonDatabase.test.ts --watchAll=false --runInBand --silent
1 passed, 1 total
1 test passed, 1 total
exit code: 0
```

Suíte completa, comando solicitado:

```text
npx jest --watchAll=false --runInBand
28 passed, 28 total test suites
117 passed, 117 total tests
1 passed, 1 total snapshot
exit code: 0
```

TypeScript, comando solicitado:

```text
npx tsc --noEmit
sem saída de erro
exit code: 0
```

A suíte exibiu apenas os logs/erros esperados já cobertos pelos testes de
i18n/BLE e o warning do Jest de fallback para o adapter assíncrono no Node,
pois JSI nativo não está disponível no ambiente de teste.

O relatório é deliberadamente mantido fora do commit desta task.
