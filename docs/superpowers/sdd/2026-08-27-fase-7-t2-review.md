# Fase 7 — Task 2: revisão independente da API

Data: 2026-08-27  
Repositório: `api-tozzo.uk`  
Branch: `feat/fase-7-sync-status-categoria`  
Commit revisado: `9ebebf2`

## Veredito final

**REPROVADO**.

Os critérios funcionais verificados passam, mas há achado **Important** de
consistência: a task introduziu nomes novos em português no domínio/contrato
novo, embora a Fase 6 reserve português para a borda legada. O worker deve
corrigir os nomes antes da aprovação.

## Achados

### Important

- **I-01 — Identificadores novos em português sem compatibilidade legada.**
  Em `modules/orders/orders.routes.ts:36`, a rota nova é
  `PATCH /pedidos/:id/itens/:itemId`; o segmento novo deveria ser
  `items`, resultando em `PATCH /pedidos/:id/items/:itemId`. O handler novo
  também se chama `atualizarStatusItemPedido` em
  `modules/orders/orders.controller.ts:246`, em vez de um nome interno em
  inglês como `updateOrderItemStatus`. O prefixo já existente `/pedidos` é
  uma borda legada; `itens` e o handler foram criados nesta task e não têm
  cliente legado para justificar a exceção.

  A busca diferencial encontrou ainda a mesma violação no endpoint novo de
  categoria: `atualizarEstabelecimentoPorId` em
  `modules/establishments/establishments.controller.ts:65`, importado e
  usado em `modules/establishments/establishments.routes.ts:2,25`. Esse
  handler deveria ter nome interno em inglês, por exemplo
  `updateEstablishmentById`.

  O padrão foi classificado como Important, não Minor: deixar esses nomes
  novos consolida a mistura no contrato interno e torna a correção mais cara
  quando os consumidores da Fase 7 forem adicionados.

### Critical

Nenhum achado Critical.

### Minor

Nenhum achado Minor separado. As mensagens humanas e os aliases/fixtures
portugueses mantidos em `legacyWire`/`sync.adapter` foram tratados como
compatibilidade de borda, não como identificadores novos do domínio.

## Checklist funcional da Task 2

- **Enum/status antigo nos testes:** aprovado para o domínio da task. Os
  testes de `orders`/`sales` usam `isOpen`; os matches restantes de
  `status: 'OPEN'`/`'FECHADO'` estão confinados a fixtures de migration,
  `legacyWire` e `sync.adapter`, onde a compatibilidade legada ainda é
  intencional.
- **RBAC de category:** aprovado. O handler normaliza o role, permite apenas
  `OWNER`/`MANAGER` e exige `params.id === user.establishmentId`, em
  `modules/establishments/establishments.controller.ts:72-91`. Os testes
  cobrem OWNER, GERENTE, funcionário e outro tenant em
  `tests/establishments/establishments.controller.test.ts:133-168`.
- **Fechamento com status de item variados:** aprovado. O teste em
  `tests/orders/orders.controller.test.ts:334-353` fecha um pedido contendo
  itens `REQUESTED` e `IN_PREPARATION`, confirma criação da venda e
  `isOpen=false`; portanto o status do item não bloqueia o fechamento.
- **`ORDER_STATUS`:** aprovado. `git grep -n ORDER_STATUS 9ebebf2` não
  retornou nenhuma ocorrência. A única normalização restante é
  `normalizeOrderStatus`, importada pelo adapter legado em
  `modules/sync/sync.adapter.ts:1,223`; não há import morto do enum removido.

## Evidência dos comandos

Todos os comandos abaixo foram executados por este reviewer, na branch
revisada. A saída foi resumida sem alterar arquivos de código.

```text
git show --stat --oneline --decorate 9ebebf2
9ebebf2 (HEAD -> feat/fase-7-sync-status-categoria) feat-api-migrate-order-state-item-status
17 files changed, 483 insertions(+), 196 deletions(-)

git show --no-ext-diff --no-color 9ebebf2 -- modules/orders/orders.routes.ts modules/orders/orders.controller.ts
=> confirmou PATCH '/:id/itens/:itemId' e export
   atualizarStatusItemPedido.

git grep -n atualizarStatusItemPedido 9ebebf2
=> orders.controller.ts:246; orders.routes.ts:2,36; orders.controller.test.ts:356

git grep -n atualizarEstabelecimentoPorId 9ebebf2
=> establishments.controller.ts:65; establishments.routes.ts:2,25

git grep -n ORDER_STATUS 9ebebf2
=> sem saída

git diff --check 9ebebf2~1 9ebebf2
=> sem saída

bun test --isolate --parallel
=> exit code 0
   209 pass
   0 fail
   542 expect() calls
   Ran 209 tests across 26 files [6.04s]

bunx tsc --noEmit
=> exit code 0; nenhuma saída

git status --short --branch
=> ## feat/fase-7-sync-status-categoria
   (sem alterações locais)
```

A primeira execução da suíte, dentro do sandbox, terminou em 208 pass / 1
fail porque `tests/prisma/schema-rename.migration.test.ts` não conseguiu
acessar o Docker Engine. A mesma suíte foi repetida com acesso ao Docker;
essa execução bem-sucedida é a contagem registrada acima e bate com o
relatório do worker.

Não foram alterados arquivos de código e não foi criado commit.
