# Fase 7 — Task 3: protocolo de sync novo da API

Data: 2026-08-27  
Repositório: `C:\RN\api\api-tozzo.uk`  
Branch: `feat/fase-7-sync-status-categoria`  
Base: `d5f00a0`

## Arquivos

### Criados

- `tests/sync/sync.protocol.test.ts`

### Removidos

- `modules/sync/sync.adapter.ts`
- `tests/sync/sync.adapter.test.ts`
- `tests/sync/sync.controller.test.ts`
- `tests/sync/sync.regression.test.ts`

### Alterados

- `modules/sync/sync.controller.ts` — implementação nova de `pullChanges` e `pushChanges`.
- `modules/sync/sync.routes.ts` — prefixo `/sync`, schemas e documentação da extensão de resposta.
- `tests/api-surface.known-endpoints.ts` — troca das entradas legadas pelos endpoints novos.

## Payload implementado

O pull exige `schemaVersion` e aceita `lastPulledAt` em milissegundos ou omitido:

```http
GET /sync/pull?schemaVersion=1&lastPulledAt=1787824800000
Authorization: Bearer <token>
```

Exemplo real do formato de resposta produzido pelo controller:

```json
{
  "changes": {
    "products": {
      "created": [
        {
          "id": "product-client-id",
          "name": "Produto offline",
          "price": 12.5,
          "ingredients": null,
          "product_type_id": 1,
          "source_product_id": null,
          "establishment_id": "establishment-a",
          "created_at": 1787824801000,
          "updated_at": 1787824801000
        }
      ],
      "updated": [],
      "deleted": ["product-deleted-id"]
    },
    "product_types": {
      "created": [
        {
          "id": "1",
          "description": "Lanches",
          "is_active": true,
          "color": "#9E9E9E",
          "created_at": 1787824740000,
          "updated_at": 1787824740000
        }
      ],
      "updated": [],
      "deleted": []
    },
    "orders": {
      "created": [
        {
          "id": "order-open-id",
          "is_open": true,
          "customer_name": "Mesa 7",
          "opened_at": 1787824801000,
          "created_at": 1787824801000,
          "updated_at": 1787824801000,
          "total": 12.5,
          "establishment_id": "establishment-a",
          "seller_id": "user-a"
        }
      ],
      "updated": [],
      "deleted": ["order-closed-id"]
    },
    "order_items": {
      "created": [
        {
          "id": "order-item-id",
          "quantity": 1,
          "status": "REQUESTED",
          "order_id": "order-open-id",
          "product_id": "product-client-id",
          "unit_price_at_order": 12.5,
          "created_at": 1787824801000,
          "updated_at": 1787824801000
        }
      ],
      "updated": [],
      "deleted": []
    },
    "sales": {
      "created": [],
      "updated": [],
      "deleted": []
    },
    "sale_items": {
      "created": [],
      "updated": [],
      "deleted": []
    }
  },
  "timestamp": 1787824802000
}
```

Todos os registros usam nomes de coluna `snake_case`; `created_at`, `updated_at` e o timestamp do envelope são inteiros em milissegundos. Pedido com `isOpen=false` nunca aparece em `orders.updated`: seu ID aparece em `orders.deleted`.

O push recebe o mesmo mapa de seis tabelas, com `created`, `updated` e `deleted`, além de `lastPulledAt`:

```json
{
  "changes": {
    "products": {
      "created": [
        {
          "id": "product-client-id",
          "name": "Produto offline",
          "price": 12.5,
          "ingredients": null,
          "product_type_id": 1,
          "created_at": 1787824801000,
          "updated_at": 1787824801000
        }
      ],
      "updated": [],
      "deleted": []
    },
    "product_types": { "created": [], "updated": [], "deleted": [] },
    "orders": { "created": [], "updated": [], "deleted": [] },
    "order_items": { "created": [], "updated": [], "deleted": [] },
    "sales": { "created": [], "updated": [], "deleted": [] },
    "sale_items": { "created": [], "updated": [], "deleted": [] }
  },
  "lastPulledAt": 1787824800000
}
```

Resposta de sucesso:

```json
{
  "ignored": [],
  "ignored_order_deletes": []
}
```

`ignored` e `ignored_order_deletes` são extensões não-padrão documentadas no Swagger. Item/produto inválido é ignorado individualmente e reportado em `ignored`; delete de pedido ainda aberto é ignorado sem fechar o pedido e reportado em `ignored_order_deletes`. Não existe `idMap`/`product_id_map`.

Quando qualquer registro existente do lote (`created`/`updated`) tem `updatedAt` no servidor maior que `lastPulledAt`, a transação inteira é abortada e a resposta é HTTP 409:

```json
{
  "code": "SYNC_CONFLICT",
  "message": "Sync push rejected because the server has newer changes",
  "details": [{ "table": "products", "id": "product-conflict" }]
}
```

## Cobertura

A suíte nova cobre primeira sincronização, pull incremental, push sem conflito, rejeição em bloco sem escrita parcial, item inválido, delete de pedido aberto, pedido fechado como `deleted`, isolamento de tenant e remoção do prefixo `/sincronizacao`.

## Verificações finais

Comandos executados separadamente na branch:

```text
$ bun test --isolate --parallel
196 pass
0 fail
513 expect() calls
Ran 196 tests across 24 files
exit code: 0
```

```text
$ bunx tsc --noEmit
sem saída de erro
exit code: 0
```

O relatório é deliberadamente mantido fora do repositório `api-tozzo.uk` e não será incluído no commit.
