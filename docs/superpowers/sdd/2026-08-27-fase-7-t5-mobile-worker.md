# Fase 7 — Task 5: migração dos hooks simples para WatermelonDB

Data: 2026-08-27  
Repositório: `C:\RN\TozzoBurger`  
Branch: `feat/fase-7-sync-status-categoria`  
Commit-base: `f5f5dbe` (`feat-mobile-watermelondb-schema-models`)

## Implementação

### `database/useProductDatabase.ts`

- Removeu `expo-sqlite`, `prepareAsync`, `runAsync`, `getAllAsync` e
  `getFirstAsync`.
- `create()` usa `database.get('products').create()` dentro de
  `database.write()` e mantém o retorno `{ id }`.
- `createFromSync()` usa `prepareCreateFromDirtyRaw()` + `database.batch()`
  para preservar o ID/timestamp recebido e marcar o registro como `synced`.
- `searchByName()`, `getProductTypes()`, `filterByProductType()` e
  `searchBySourceProductId()` usam Watermelon Query API, incluindo filtro de
  tipo de produto ativo, ordenação e paginação existentes.
- `show()`/`showAdd()` consultam a coleção Watermelon e convertem o model
  para o shape legado (`productTypeId` numérico, `updated_at` em epoch ms,
  `deleted_at`/`sync_status`).
- `update()` usa `Model.update()`; `remove()` usa `markAsDeleted()`, que é o
  tombstone equivalente no protocolo Watermelon. As escritas continuam
  chamando `markChanged('products')` para manter o comportamento das telas
  durante a transição para o sync nativo.

### `database/useUserDatabase.ts`

- Usa a coleção Watermelon `users` e `Q.where`/`Q.sortBy` para leitura e
  listagem.
- `create()` cria o registro pela Model API dentro de um writer serializado.
  Como o contrato antigo devolve um `insertedRowId` numérico, gera o próximo
  ID numérico como string no Watermelon e devolve o mesmo formato numérico.
- `show()` e `list()` convertem IDs/establishment IDs string do model para o
  shape numérico legado; o campo `email` continua preservado em runtime.
- `update()` usa `Model.update()` e mantém exatamente os campos que o hook
  antigo atualizava.

### `database/usePrinterDatabase.ts`

- Usa a coleção Watermelon `printers` sem SQL cru.
- Mantém a impressora padrão no ID lógico `"1"`; a criação usa a Model API
  preparada para preservar esse ID e atualizações usam `Model.update()`.
- `getPrinter()` mantém o retorno `{ uuid: null, name: null }` quando não há
  registro.
- `removePrinter()` usa `destroyPermanently()`, equivalente à remoção local
  definitiva que existia antes.

## Assinaturas públicas

Não foram alterados nomes exportados, parâmetros ou formatos de retorno:

- `useProductDatabase()`: `create`, `createFromSync`, `searchByName`,
  `update`, `remove`, `show`, `showAdd`, `getProductTypes`,
  `filterByProductType`, `searchBySourceProductId` e os três aliases legados.
- `useUserDatabase()`: `create`, `show`, `update`, `list`, incluindo o retorno
  `{ insertedRowId }`.
- `usePrinterDatabase()`: `setPrinter`, `getPrinter`, `removePrinter`,
  incluindo o retorno `{ uuid, name }`.

Nenhuma tela ou componente precisou ser alterado.

## Consumidores validados

- `app/(tabs)/produtos.tsx` continua usando `remove`; `useProductList` usa
  busca, filtro e paginação do mesmo hook.
- `app/(tabs)/index.tsx`, `historico.tsx` e os modais de produto, pedido,
  conta, histórico e relatório continuam usando os métodos de produto sem
  alteração de chamada.
- `app/(tabs)/configs.tsx` continua usando `setPrinter`, `getPrinter` e
  `removePrinter`.
- O fluxo de impressão em `historico.tsx` e
  `modais/contaHistoricoModal.tsx` continua usando `getPrinter`.
- `app/login.tsx` não usa `useUserDatabase`; autenticação permanece em
  `AuthContext` (que ainda está fora do escopo desta task). O hook de usuário
  foi coberto independentemente e preserva sua assinatura.

O typecheck compila todos esses consumidores e a suíte completa passou sem
  quebra causada pelos hooks.

## TDD e testes

- RED: após adaptar o teste existente de produtos e criar os testes de
  usuário/impressora, a execução contra os hooks antigos falhou em 3 suites
  antes dos testes rodarem, porque ainda importava `expo-sqlite` no ambiente
  Jest (`Cannot find native module 'ExponentConstants'`).
- GREEN: testes focados passaram com banco SQLite Watermelon em memória,
  populado exclusivamente por Model API (sem SQL cru): 3 suites, 12 testes.
- `database/__tests__/useProductDatabase.test.tsx` foi adaptado para cobrir
  criação, sync com ID/timestamp, atualização, tombstone, busca/filtros,
  paginação, tipos ativos e aliases de leitura.
- Foram criados `database/__tests__/useUserDatabase.test.ts` e
  `database/__tests__/usePrinterDatabase.test.ts` com os comportamentos
  legados equivalentes.

## Comandos finais

### Suíte completa

Comando executado exatamente:

```text
npx jest --watchAll=false --runInBand
```

Resultado real:

```text
Test Suites: 30 passed, 30 total
Tests:       121 passed, 121 total
Snapshots:   1 passed, 1 total
exit code: 0
```

O Jest exibiu apenas warnings esperados: fallback do adapter JSI para o
adapter assíncrono no ambiente Node e logs de testes existentes de i18n/BLE.

### TypeScript

Comando executado exatamente:

```text
npx tsc --noEmit
```

Resultado real: nenhum erro TypeScript, `exit code: 0`. Houve somente o
warning do Node sobre `NO_COLOR`/`FORCE_COLOR`.

Este relatório fica fora do commit conforme solicitado.
