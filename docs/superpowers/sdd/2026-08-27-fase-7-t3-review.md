# Revisão independente — Fase 7, Task 3 (protocolo de sync da API)

Data da revisão: 2026-08-27  
Repositório: `C:\RN\api\api-tozzo.uk`  
Branch: `feat/fase-7-sync-status-categoria`  
Commit revisado: `5312014` (`531201464163e0e8c3b36103d72b91558d6373eb`)  
Base: `5312014~1`

## Veredito

# REPROVADO

A Task 3 não deve avançar enquanto houver um achado `Critical` e três
achados `Important`. A suíte está verde, mas não cobre os cenários que
causam os bloqueios abaixo.

Resumo:

| Severidade | Quantidade | Situação |
|---|---:|---|
| Critical | 1 | Bloqueia |
| Important | 3 | Bloqueiam |
| Medium/Low | 0 | — |

## Escopo e método

Li a seção “Protocolo de sync (API)” da spec, a Task 3 e seus critérios
específicos no plano, e o relatório do worker. Também li o diff completo do
commit para controller, routes, testes novos e arquivos removidos, além dos
trechos relevantes do schema Prisma, controllers REST e implementação SSE.

Inventário do commit:

```text
git show 5312014 --stat

 modules/sync/sync.adapter.ts         |  318 ----------
 modules/sync/sync.controller.ts      | 1094 +++++++++++++++++++++++-----------
 modules/sync/sync.routes.ts           |   32 +-
 tests/api-surface.known-endpoints.ts |    4 +-
 tests/sync/sync.adapter.test.ts      |  157 -----
 tests/sync/sync.controller.test.ts   |  257 --------
 tests/sync/sync.protocol.test.ts     |  556 +++++++++++++++++
 tests/sync/sync.regression.test.ts   |  493 ---------------
 8 files changed, 1323 insertions(+), 1588 deletions(-)
```

`git diff --check 5312014~1 5312014` não produziu saída. Ao final da
revisão, `git diff --stat` ficou vazio e `git status --short` não mostrou
arquivos alterados pelo reviewer.

## Checklist solicitado

| Critério | Resultado | Evidência |
|---|---|---|
| `sync.adapter.ts` deletado e sem referência morta | PASS | `git ls-tree` no commit só lista `sync.controller.ts` e `sync.routes.ts` em `modules/sync`; `git grep` por `sync.adapter` não retornou linhas. |
| Conflito pré-existente rejeita o lote inteiro | PASS parcial | O teste determinístico passa e o código verifica todos os conflitos antes dos loops de aplicação; a atomicidade sob concorrência real falha (C1). |
| Pull/push isolados por tenant | PASS parcial | O teste A/B passa para produtos, pedidos e vendas e a implementação filtra os itens pelas relações do pedido/venda; não há vazamento observado. A mutação global de `product_types` sem RBAC é um bloqueio separado (I2). |
| Pedido `isOpen=false` em `orders.deleted` | PASS | Implementação em `sync.controller.ts:710-713` e teste do protocolo. |
| Delete de pedido ainda aberto ignorado | PASS | `sync.controller.ts:623-631`; o teste passa e o retorno traz `ignored_order_deletes`, sem fechamento nem erro fatal. |
| Prefixos e known endpoints | PASS | Routes usam `/sync/pull` e `/sync/push`; `tests/api-surface.known-endpoints.ts` foi atualizado. `/sincronizacao/pull?since=0` retorna 404 no teste. |
| Identificadores novos em português | PASS | Não há `produtos`, `pedidos` ou `vendas` como identificadores no controller novo. As ocorrências encontradas são as asserções negativas do teste e o teste do prefixo legado; as descrições Swagger em português são texto, não identificadores. |
| Suíte completa | PASS | Verificação fora do sandbox: `196 pass`, `0 fail`, exit code 0. |
| Typecheck | PASS | `bunx tsc --noEmit`, exit code 0 e nenhuma saída. |

## Achados bloqueantes

### C1 — `Critical`: check de conflito não é atômico com as escritas

Arquivos: `modules/sync/sync.controller.ts:346-365, 762-774`;
`lib/prisma.ts:8-12`.

O caso determinístico coberto pelo teste está correto: `findConflicts` roda
antes de qualquer `applyRecord`/`applyDeleted`, e uma exceção dentro do
`prisma.$transaction` desfaz a transação. Porém, o protocolo exige que um
registro que mudou depois de `lastPulledAt` seja rejeitado; o código não
garante isso quando a mudança acontece entre a leitura de conflito e a
escrita.

O fluxo atual é, em essência:

```text
findConflicts(tx, changes, ..., lastPulledAt)
if (conflicts.length > 0) throw 409
applyRecord(...)
applyDeleted(...)
```

Não há lock de linha, `Serializable`, retry de erro de serialização, nem
`UPDATE`/`upsert` condicional que revalide `updatedAt` no momento da escrita.
O cliente Prisma é criado sem opção de isolamento, e o datasource é
PostgreSQL; portanto, a transação usa o isolamento padrão do banco.

Interleaving concreto:

1. O push T1 chega com cursor `C`; o registro R ainda tem
   `updatedAt <= C`.
2. T1 executa `findConflicts` e não encontra conflito.
3. Outro request T2 altera R e confirma a transação com `updatedAt > C`.
4. T1 continua os loops de `applyRecord`; os `update` por ID não revalidam
   o timestamp e podem sobrescrever a mudança de T2 com o snapshot antigo.

Assim, o lote não é rejeitado embora R tenha mudado no servidor depois do
cursor informado. É perda de atualização no coração do motor de sync e
viola diretamente a regra de concorrência otimista da spec. O teste atual
usa um fake de Prisma que clona o estado no início da transação e não possui
interleaving concorrente; por isso ele prova apenas o caso em que o conflito
já existia antes da transação.

Correção necessária: tornar a verificação e a aplicação uma operação com
garantia de serialização/lock apropriado, ou fazer todas as escritas
condicionais ao cursor/timestamp e abortar o lote quando qualquer condição
falhar, incluindo retry controlado para serialização. Adicionar teste de
concorrência contra PostgreSQL real, não apenas o fake transacional.

### I1 — `Important`: remoção de itens não gera tombstone no pull

Arquivos: `prisma/schema.prisma:163-175`;
`modules/orders/orders.controller.ts:328-346`;
`modules/sync/sync.controller.ts:678-718, 725-728`.

`OrderItem` e `SaleItem` não têm `updatedAt`/`deletedAt`. A atualização REST
de pedido apaga fisicamente os itens anteriores (`deleteMany`) e recria a
lista. No sync, o pull consulta somente os itens que ainda existem. Para
`order_items`, o array `deleted` só é derivado de itens ainda encontrados
cujo pedido pai foi fechado ou apagado; para `sale_items`, o array é
literalmente `deleted: []`.

Cenário reproduzível:

1. O dispositivo A possui o item I localmente.
2. O dispositivo B remove I de um pedido ainda aberto e o push/aplicação
   física remove I no servidor.
3. O pull incremental de A recebe os itens atuais do pedido, mas nunca
   recebe `I` em `order_items.deleted`; I permanece localmente.

O mesmo problema ocorre se um `sale_item` for aceito em
`applyDeleted` (`sync.controller.ts:650-655`): ele é apagado no servidor,
mas nunca é anunciado aos outros clientes. Isso deixa os bancos locais
divergentes e pode fazer um item excluído reaparecer ou ser reenviado.

O teste novo cobre fechamento do pedido e delete de pedido aberto, mas não
cobre remoção de `order_items` de pedido aberto nem remoção de
`sale_items`. É necessário persistir tombstones (ou histórico de IDs
apagados com timestamp) e incluí-los nos respectivos arrays `deleted`, além
de testes incrementais para os dois tipos de item.

### I2 — `Important`: o sync bypassa RBAC de `product_types` e pode apagar tipo do sistema

Arquivos: `modules/sync/sync.routes.ts:15-17`;
`modules/sync/sync.controller.ts:417-427, 609-614`;
`modules/product-types/product-types.controller.ts:17, 114-125, 176-180`;
`prisma/schema.prisma:63-73`.

As rotas novas usam apenas `authContext`. Ao aplicar `product_types`, o
controller de sync não verifica `OWNER`, nem bloqueia os IDs de
`INITIAL_PRODUCT_TYPES`. O caminho de delete faz `findUnique` global e
marca o registro como apagado/inativo sem qualquer autorização adicional.

Isso diverge do controller REST existente, que exige `OWNER` para editar,
ativar/inativar e deletar tipos, e bloqueia tipos padrão do sistema.
`ProductType` também é uma tabela global, sem `establishmentId`; portanto,
um employee autenticado de qualquer estabelecimento pode alterar ou
desativar um tipo compartilhado por todos os estabelecimentos, inclusive
um tipo inicial. O teste de tenant usa somente usuários OWNER e não cobre
esse caminho.

O sync precisa aplicar o mesmo controle de autorização do domínio, ou
retirar `product_types` de operações de escrita offline e manter a alteração
no endpoint owner-only existente. Também deve haver teste com employee e
com ID de tipo de sistema.

### I3 — `Important`: regressão do evento SSE após push do sync

Arquivos: baseline `5312014~1:modules/sync/sync.controller.ts:3,325-326`;
commit revisado `modules/sync/sync.controller.ts:754-796`;
`lib/sse.ts` e `modules/events/events.routes.ts`.

Antes do commit, o controller de sync importava `sendEvent` e, depois de
uma escrita bem-sucedida, notificava `pedidos` e `vendas` conforme o lote.
No controller novo não há import nem chamada a `sendEvent`; o handler termina
depois de aplicar e retornar `ignored`/`ignored_order_deletes`.

O endpoint `GET /events` continua existindo, e os controllers REST de pedidos
e vendas continuam emitindo eventos. Logo, uma alteração feita por um
dispositivo via `/sync/push` atualiza o banco, mas não sinaliza as abas do
dashboard inscritas no estabelecimento. A tela pode ficar stale até um
reload ou outro ciclo de pull. Os testes antigos de sync que cobriam o
evento foram removidos junto com a suíte antiga; `sync.protocol.test.ts` não
tem asserção de emissão SSE.

Não há indicação na spec da Task 3 de que o contrato SSE deveria ser
removido; ao contrário, o endpoint e a infraestrutura continuam no código.
O comportamento de notificação pós-commit deve ser preservado e testado,
sem deixar a falha de um cliente SSE abortar o push.

## Evidência dos testes focados solicitados

### Conflito: rejeição em bloco

Comando executado:

```text
bun test --isolate --parallel tests/sync/sync.protocol.test.ts --test-name-pattern=rejects
```

Saída real:

```text
bun test v1.4.0 (34cbb9a40) 16× PARALLEL

tests\sync\sync.protocol.test.ts:
[dotenv@17.2.3] injecting env (0) from .env -- tip: 👥 sync secrets across teammates & machines: https://dotenvx.com/ops

1 pass
8 filtered out
0 fail
5 expect() calls
Ran 1 test across 1 file. [685ms]
```

O teste semeia um registro conflitante, uma criação que deveria ser
rejeitada junto com o lote e outra atualização; depois do `409`, confirma
que as criações não existem e que o registro conflitante não mudou. Isso
passa. A limitação é que o fake transacional não testa a corrida T1/T2 de
C1.

### Tenant isolation

Comando executado:

```text
bun test --isolate --parallel tests/sync/sync.protocol.test.ts --test-name-pattern=never
```

Saída real:

```text
bun test v1.4.0 (34cbb9a40) 16× PARALLEL

tests\sync\sync.protocol.test.ts:
[dotenv@17.2.3] injecting env (0) from .env -- tip: 👥 sync secrets across teammates & machines: https://dotenvx.com/ops

1 pass
8 filtered out
0 fail
9 expect() calls
Ran 1 test across 1 file. [723ms]
```

Esse teste confirma que o pull do estabelecimento A não contém IDs de
produtos/pedidos/vendas de B e que um push de IDs de B autenticado como A
não altera os registros de B. A leitura da implementação também confirma
filtros por estabelecimento nas entidades e nas relações de itens. O
resultado não elimina I2, pois `product_types` é global e sofre de falha de
autorização, não de uma relação tenant-scoped.

### Requisitos de pedido fechado e delete de pedido aberto

O arquivo `tests/sync/sync.protocol.test.ts` contém os dois cenários e a
execução completa da suíte focada foi:

```text
9 pass
0 fail
56 expect() calls
Ran 9 tests across 1 file. [4.07s]
```

Durante essa execução apareceu o log esperado:

```text
[sync] ignored delete for open order order-still-open
```

O código coloca pedidos existentes com `isOpen=false` em
`orders.deleted`, não em `orders.updated`, e deixa pedido aberto intacto
quando recebe um delete.

## Suíte completa e typecheck

Primeira execução dentro do sandbox foi limitada pelo acesso ao Docker no
teste de migration (`permission denied ... docker_engine`), resultando em
`195 pass / 1 fail` sem falha de asserção do sync. Repeti o comando fora do
sandbox para validar o resultado real.

Comando:

```text
bun test --isolate --parallel
```

Trecho final da execução válida:

```text
T1_INVARIANTS rowsBefore={"TB_ESTABLISHMENTS":1,"TB_USERS":4,"TB_PRODUCT_TYPES":1,"TB_PRODUCTS":2,"TB_ORDERS":4,"TB_SALES":2,"RL_ORDER_PRODUCT":2,"RL_SALE_PRODUCT":1,"TB_PRINTERS":1,"TB_DEVICES":1} rowsAfter={"TB_ESTABLISHMENTS":1,"TB_USERS":4,"TB_PRODUCT_TYPES":1,"TB_PRODUCTS":2,"TB_ORDERS":4,"TB_SALES":2,"RL_ORDER_PRODUCT":2,"RL_SALE_PRODUCT":1,"TB_PRINTERS":1,"TB_DEVICES":1}
T1_INVARIANTS isOpen=[{"id":"order-closed","isOpen":false},{"id":"order-open","isOpen":true}] itemStatus=[{"id":"order-item-1","status":"DELIVERED"},{"id":"order-item-2","status":"DELIVERED"}] categoryNull=1

196 pass
0 fail
513 expect() calls
Ran 196 tests across 24 files. [6.13s]
exit code=0
```

Typecheck:

```text
bunx tsc --noEmit
exit code=0
```

Os números de casos (`196 pass / 0 fail`) e o typecheck limpo foram
confirmados. Eles não mitigam os quatro problemas acima porque os testes
atuais não exercitam corrida de conflito, tombstones de itens, RBAC de
`product_types` nem o evento SSE do novo endpoint.

## Verificações de remoção, rotas e nomenclatura

`git ls-tree -r --name-only 5312014 modules/sync` produziu somente:

```text
modules/sync/sync.controller.ts
modules/sync/sync.routes.ts
```

`git grep -n "sync.adapter" 5312014 -- .` não retornou linhas. Não encontrei
import ou referência morta ao adapter. As referências a `legacyWire` que
restam estão em outros controllers REST e não são usadas pelo sync novo.

`tests/api-surface.known-endpoints.ts` contém:

```text
GET /sync/pull
POST /sync/push
```

As entradas antigas `/sincronizacao/pull` e `/sincronizacao/push` foram
removidas, e o teste do protocolo confirma 404 para o prefixo legado.

A busca por `produtos`, `pedidos` e `vendas` em `modules/sync` não encontrou
identificadores novos no código de produção. As ocorrências do commit estão
nas asserções que garantem a ausência de campos legados e no caso de teste
do prefixo antigo; não são campos do payload nem nomes de variáveis do
controller.

## Conclusão

O commit entrega a forma básica do protocolo, rotas novas, isolamento
tenant-scoped observado, comportamento correto para pedidos fechados e
delete de pedido aberto, e passa a validação automatizada solicitada.

Ainda assim, a Task 3 deve ser considerada **REPROVADA** até que a
atomicidade de conflito seja garantida sob concorrência real, os tombstones
de itens sejam preservados, o RBAC global de `product_types` seja restaurado
e as notificações SSE do caminho de sync sejam mantidas ou uma decisão
explícita de produto substitua esse contrato.
