# Correção dos achados da Task 5 — hooks Watermelon

- Data: 2026-08-27
- Repositório: TozzoBurger
- Branch: `feat/fase-7-sync-status-categoria`
- Base: `49611d6` (`feat-mobile-migrate-simple-hooks-to-watermelon`)
- Review tratado: `2026-08-27-fase-7-t5-review.md`

## Important-01 — isolamento por estabelecimento e limpeza na troca

### Escopo das queries de produto

`useProductDatabase()` agora lê o estabelecimento atual por `useAuth().user.establishmentId`, normalizando IDs numéricos e textuais para string. O ID atual é aplicado nas queries de:

- `searchByName`;
- `filterByProductType` e o alias `filterByTipo`;
- `show` e `showAdd`;
- `searchBySourceProductId`.

As buscas internas usadas por `update` e `remove` também foram escopadas para impedir alteração de um produto de outro estabelecimento quando apenas o ID é conhecido. A criação de produto usa o estabelecimento autenticado; sem estabelecimento autenticado, a operação falha explicitamente em vez de gravar uma linha sem escopo.

A coluna `products.establishment_id` já existia no schema Watermelon v1 e no model `Product.ts`. Portanto, não foi necessária alteração de schema ou migration.

### Limpeza na troca

Foi adicionada `resetWatermelonLocalData()` em `database/watermelon/database.ts`. Ela executa uma escrita Watermelon e remove via batch todos os registros de `products`, `product_types` e `printers`, preservando as tabelas de pedidos, vendas e usuários que ainda pertencem às etapas posteriores da migração.

`AuthContext.login()` chama essa função depois do commit da limpeza/recriação SQLite legada quando detecta mudança de `establishmentId`.

### Decisão para impressora

A impressora não ganhou uma coluna nova. O ID do registro, antes fixo em `"1"`, passou a ser `String(establishmentId)` do usuário autenticado. Assim, a tabela suporta uma impressora por estabelecimento e `getPrinter`, `setPrinter` e `removePrinter` não cruzam tenants mesmo antes da limpeza. O reset na troca continua sendo a limpeza de estado local exigida para os registros antigos e para as demais tabelas dos hooks da Task 5.

### Sync fora do escopo

`useSyncDatabase.ts` continua apontando para o SQLite legado. Produtos criados pelos hooks Watermelon ainda não entram no sync atual; isso é uma limitação temporária consciente desta migração incremental e permanece reservado para a Task 8, não um bug pendente desta correção. O objetivo desta alteração foi impedir vazamento entre estabelecimentos no mesmo dispositivo.

## Medium-01 — default de role

`useUserDatabase.create()` voltou a gravar `role: 'EMPLOYEE'` quando `input.role` não é informado, mantendo o comportamento do schema/fluxo legado.

## TDD e testes adicionados

Os testes RED foram executados antes da implementação. As falhas observadas foram as esperadas: produto de A retornava nas consultas de B, impressora de A retornava no contexto B, `role` era `null` e a função de reset ainda não existia.

Os testes cobrem a troca de contexto A → B para todas as queries públicas de produto, o escopo da impressora, o reset seletivo e o default de role.

## Verificações executadas

### Focada — GREEN

```text
npx jest database/__tests__/useProductDatabase.test.tsx database/__tests__/useUserDatabase.test.ts database/__tests__/usePrinterDatabase.test.ts database/__tests__/watermelonReset.test.ts --watchAll=false --runInBand --silent

Test Suites: 4 passed, 4 total
Tests:       16 passed, 16 total
Snapshots:   0 total
Process exit: 0
```

### Suíte completa

```text
npx jest --watchAll=false --runInBand

Test Suites: 31 passed, 31 total
Tests:       125 passed, 125 total
Snapshots:   1 passed, 1 total
Process exit: 0
```

Os logs de i18n, BLE e fallback de JSI Watermelon são casos negativos/ambiente já esperados pela suíte; não houve falha.

### TypeScript

```text
npx tsc --noEmit

Process exit: 0
```

### Whitespace

```text
git diff --check

Process exit: 0
```

Este relatório é um artefato de trabalho e não deve ser incluído no commit da correção.
