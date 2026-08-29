# Task 8 — Review

Reviewer: controller (Claude), review manual direta — o reviewer Codex (gpt-5.6-luna,
reasoning max) foi disparado 1x e morto externamente antes de terminar (sem relatório
produzido), decisão do usuário 2026-08-28: revisar esta task diretamente em vez de
redisparar; T9 em diante volta a usar Codex.

Diff revisado: `03f8f8c..3296ac9` (2 commits: `a6623bb` implementação principal +
`3296ac9` fix do concern de retry em conflito).

## Spec compliance

✅ Objetivo — `useSyncDatabase.ts` substituído por `synchronize()` nativo do
Watermelon, contrato novo (`/sync/pull`/`/sync/push`) wireado via
`database/watermelon/sync.ts` + `services/api.ts`.

✅ Arquivos — `useSyncDatabase.ts` deletado por completo (confirmado: nenhuma
referência órfã a `useSyncDatabase`, `/sincronizacao/pull`, `/sincronizacao/push`,
`api.synchronize`, `api.getChanges`, `sincronizarComServidor` em código-fonte, via
grep próprio). `syncGuard.ts` não precisou de alteração (o lock já era genérico);
`database/watermelon/sync.ts` criado com o contrato exato do brief.

✅ `tableWatermark.ts` — decisão documentada (manter) é coerente: telas ainda fazem
carregamento imperativo, não `Query.observe()`; `markPulledTables` no `sync.ts:1602-1612`
continua marcando `products`/`orders`/`sales` corretamente a partir do pull novo, não
ficou órfão.

✅ Passo 1-2 — `pullChanges`/`pushChanges` (`sync.ts:1643-1676`) batem exatamente com
o contrato da api (`GET /sync/pull?schemaVersion&lastPulledAt`, `POST /sync/push` com
`{changes, lastPulledAt}`) — confirmado lendo `services/api.ts` (URLs, método, body) e
comparando com `modules/sync/sync.routes.ts`/`sync.controller.ts` da api.

✅ Passo 3 — `synchronizeWithServer` só é chamado dentro de `runWithLock` nos dois
pontos de entrada (`AuthContext.tsx:79`, `AutoSyncContext.tsx:157`).

✅ Passo 4 — teste de serialização de 2 chamadas concorrentes presente e correto
(`watermelonSync.test.ts`, "serializes concurrent native sync calls through the sync
guard" — prova `maxActivePulls === 1`).

✅ Passo 5 (regressão do bug original) — teste "applies remote is_open before pushing
a new local order item" (`watermelonSync.test.ts:594-668`) prova de fato que o
`is_open` remoto já está aplicado localmente (`isOpenAtPush === false`) no momento em
que o push do item novo acontece — não é só um teste de nome sugestivo, a asserção
confere o valor real lido do banco no instante do push.

✅ Passo 6 — suíte completa e `tsc --noEmit` rodados por mim diretamente (não só
confiando no relatório do worker): **142/142 testes passando, `tsc --noEmit` sem
erros**.

✅ Critério "nenhuma chamada de sync roda fora do syncGuard" — confirmado acima.

✅ Critério "teste de regressão presente e passando" — confirmado acima.

## Pontos de atenção específicos

1. **Ordem pull-antes-do-push**: confirmado real (não cosmético) — ver Passo 5 acima.
2. **Isolamento por `establishmentId`**: robusto. `ensureTenantScope`
   (`sync.ts:1544-1596`) checa roots (`products`/`orders`/`sales`) recebidos E
   colisão com registro local existente de outro tenant, mais referências cruzadas de
   `order_items`/`sale_items` pra pedido/venda/produto (local ou no mesmo lote).
   `product_types` fica de fora da checagem de root de propósito (não tem
   `establishment_id` no schema, a api já escopa via token) — consistente com o que o
   relatório do worker documentou, não é lacuna.
3. **Retry em 409/SYNC_CONFLICT**: correto. `isSyncConflictError` (`sync.ts:1628-1636`)
   confere `status===409` e `code`/`error==='SYNC_CONFLICT'` no nível certo — validei
   contra o shape real do erro da api (`sync.controller.ts:47-51`, helper `error()`
   retorna `{code, message, details}`, não `{error, message}` — o mobile checa ambas
   as chaves, então cobre o formato real). Retry é limitado a `MAX_SYNC_ATTEMPTS = 3`,
   erros não-conflito propagam na 1ª tentativa (teste dedicado confirma), e todo o
   loop de retry roda DENTRO de uma única invocação de `runWithLock` (o `while` fica
   dentro de `synchronizeWithServer`, que é o corpo passado pro lock) — não há
   múltiplas aquisições de lock por ciclo de retry.
4. **Decisão sobre `tableWatermark.ts`**: razoável e bem documentada, não deixa nada
   ambíguo nem quebrado (ver acima).
5. **Arquivos deletados/consumidores migrados**: confirmado sem órfãos.

## Achados

- **[Minor]** `pendingCount` perde granularidade real — `context/AutoSyncContext.tsx:140-141`
  — antes contava linhas pendentes de fato (`SELECT COUNT(*) ...`), agora vira
  `hasUnsyncedChanges(...) ? 1 : 0` (sempre 0 ou 1). O tipo (`pendingCount: number`)
  ainda sugere uma contagem real. Hoje é inofensivo: `pendingCount` não é consumido
  por nenhum componente da UI (confirmado via grep, só é lido dentro do próprio
  `AutoSyncContext.tsx`) — mas se algum componente futuro vier a exibir esse número
  esperando uma contagem de verdade, vai mostrar no máximo "1" mesmo com 50 pendências.
  Não bloqueante, fica registrado pra quando alguém for usar esse valor na UI.

## Ruling registrado durante esta task (achado de correctness, não veio da review formal)

Antes da review, resolvi um `DONE_WITH_CONCERNS` do worker: o brief (baseado no texto
do plano) assumia que `synchronize()` nativo do WatermelonDB faz retry automático em
409 — falso, confirmado por leitura direta de `node_modules/@nozbe/watermelondb/sync/index.js`
(sem nenhum retry/conflict handling ali). Ruling: implementar retry limitado no nível
do caller (`synchronizeWithServer`), não dentro do `synchronize()` da lib — é isso que
está implementado e validado no ponto 3 acima. Custo se a leitura da lib estiver
errada: retry duplicado/desnecessário em algum cenário não coberto pelos testes atuais
— baixo risco, os 3 testes de retry cobrem sucesso-após-1-retry, esgotamento em 3
tentativas e não-retry em erro não-conflito.

## Veredito

**Aprovado com ressalvas (minor).** Nenhum achado Critical/Important. 1 Minor
parqueado pra revisão final da branch triar.
