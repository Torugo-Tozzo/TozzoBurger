# Fase 7 — Task 8: novo sync mobile com WatermelonDB

Data: 2026-08-28  
Repositório: `C:\RN\TozzoBurger`  
Branch: `feat/fase-7-sync-status-categoria`  
Commit: `a6623bb` (`feat: replace mobile sync with WatermelonDB`)

## Resultado

O motor antigo baseado em `database/useSyncDatabase.ts` foi substituído pelo
`synchronize()` nativo do WatermelonDB 0.28, usando o contrato novo da API:

- `GET /sync/pull`, com `schemaVersion`, cursor `lastPulledAt` e Bearer token;
- `POST /sync/push`, com o envelope Watermelon e `lastPulledAt`;
- conjunto de seis tabelas fixas: `products`, `product_types`, `orders`,
  `order_items`, `sales` e `sale_items`;
- registros enviados sem `_status`/`_changed`;
- resposta `ignored`/`ignored_order_deletes` reportada com `console.warn`;
- erros HTTP tipados por `ApiHttpError`, preservando `status`, `code`/`error`,
  `details` e corpo original.

O callback de pull normaliza o envelope e valida o timestamp. O callback de
push normaliza novamente o conjunto recebido pelo Watermelon, filtra tabelas
locais (`users` e `printers`) e deixa erros, inclusive 409, propagarem sem
retry manual. O ciclo completo fica em `database/watermelon/sync.ts`.

Os pontos de entrada de login e auto-sync foram migrados para:

```ts
runWithLock(() => synchronizeWithServer(token, user.establishmentId))
```

O `syncGuard.ts` já continha o lock serializado/coalescente correto e não
precisou de alteração: a troca necessária ocorreu no corpo passado pelos
consumidores. O `SyncIndicator` também foi ajustado para considerar `void` do
Watermelon como sucesso.

## Testes escritos primeiro

Antes da implementação, os novos testes foram executados em RED e falharam por
ausência de `database/watermelon/sync.ts` e das funções novas da API. Depois da
implementação, foram adicionados/validados testes para:

- query string, autenticação e envelope de `/sync/pull`;
- primeira sincronização sem cursor e sincronização incremental;
- body exato de `/sync/push`;
- preservação de 409 `SYNC_CONFLICT`;
- filtro das seis tabelas e remoção dos internals Watermelon;
- logging de itens ignorados pelo servidor;
- duas sincronizações nativas concorrentes serializadas por `runWithLock`;
- defesa contra registros/relacionamentos de outro estabelecimento;
- regressão: um `is_open` remoto é aplicado antes de o item local novo ser
  lido no push.

## Decisão sobre `tableWatermark.ts`

`database/tableWatermark.ts` foi mantido.

A avaliação mostrou que as telas atuais ainda fazem carregamento imperativo e
paginação (`pedidos`, `produtos` e o hook de produtos), enquanto `historico`
possui carregamento local/remoto, filtros e paginação próprios. Migrar essas
telas para `Query.observe()`/`withObservables` nesta mesma troca de motor não
teria cobertura equivalente e poderia alterar comportamento de UI fora do
escopo do protocolo de sync.

O novo adapter marca `products`, `orders` ou `sales` no `onDidPullChanges`,
depois da aplicação atômica do pull. Assim o gate já existente em
`useShouldReload` continua funcionando; `historico` continua reagindo ao
`lastSync` do `AutoSyncContext`. Remover o watermark fica reservado para uma
task de migração reativa das telas.

## Isolamento por estabelecimento

O `establishmentId` do usuário autenticado é passado pelos contextos para o
adapter. Como defesa em profundidade antes de o Watermelon aplicar o pull ou
enviar o push, o adapter:

- rejeita roots (`products`, `orders`, `sales`) com escopo incompatível;
- verifica colisões com registros locais de outro estabelecimento, inclusive
  quando o payload não traz `establishment_id`;
- verifica referências de `order_items`/`sale_items` para pedidos, vendas e
  produtos locais ou recebidos no mesmo lote;
- rejeita referências desconhecidas que poderiam deixar uma escrita sem escopo.

`product_types` permanece global no schema atual e não possui
`establishment_id`. Sem um ID de estabelecimento disponível, a API continua
sendo a fonte de escopo pelo Bearer token, conforme o contrato aprovado.

## Self-review

Foram revisados o diff staged, os novos arquivos, os consumidores e as
referências restantes. Os achados/resoluções foram:

1. Não restaram imports ou chamadas ativas do motor antigo, nem referências aos
   endpoints `/sincronizacao/pull`/`/sincronizacao/push` no código-fonte.
2. Todas as chamadas de ciclo completo encontradas em `AuthContext` e
   `AutoSyncContext` passam por `runWithLock`.
3. O callback de push não captura nem transforma conflitos em sucesso; a
   resposta de itens ignorados é somente reportada, como exigido pelo contrato.
4. O teste de regressão usa a ordem real do `synchronize()` nativo: pull,
   apply atômico, coleta de mudanças locais e push.
5. O adapter instalado em `@nozbe/watermelondb` 0.28 não contém, no código
   local verificado, um loop automático de retry para erro HTTP 409; ele
   propaga a exceção da callback. A implementação preserva o erro tipado e não
   adiciona retry manual, obedecendo ao brief. Isso é uma observação para o
   controller confirmar com a versão/contrato da lib antes de depender do
   retry automático descrito no brief.
6. O teste de regressão representa a alteração de campo `is_open` pedida no
   brief. O relatório da Task 3 registra adicionalmente que o controller pode
   representar fechamento como `orders.deleted`; essa variante não altera a
   prova da ordem pull-before-push, mas merece um teste de integração futuro.

## Verificações executadas

Todos os comandos abaixo foram executados localmente, sem conexão a banco real:

```text
npx jest database/__tests__/watermelonSync.test.ts database/__tests__/syncGuard.test.ts services/__tests__/syncApi.test.ts --runInBand --watchAll=false
3 suites passed, 16 tests passed

npx tsc --noEmit
exit code 0

npx jest --runInBand --watchAll=false
33 suites passed, 139 tests passed, 1 snapshot passed

git diff --check
sem erros de whitespace; apenas avisos de conversão LF/CRLF do Git

git grep -n -E 'useSyncDatabase|/sincronizacao/(push|pull)|api\\.synchronize|api\\.getChanges|sincronizarComServidor' -- ':!docs/**' ':!graphify-out/**'
sem resultados no código-fonte
```

O commit contém somente os nove arquivos de código/teste explicitamente
adicionados, alterados ou removidos. Este relatório foi escrito fora do
commit, junto dos demais relatórios SDD existentes, para respeitar a instrução
de não incluir documentação no commit desta task. Não houve push nem abertura
de PR.

## Correção do concern (retry em conflito)

Foi corrigida a premissa sobre o retry nativo do WatermelonDB 0.28: o caller
`synchronizeWithServer` agora repete o ciclo completo de
`watermelonSynchronize(...)` somente para conflitos de sync (`status === 409`
ou marcador `SYNC_CONFLICT` em `code`/`error` do erro ou do corpo). São no
máximo três chamadas totais; conflitos persistentes propagam o erro da última
tentativa e erros de rede/400/500 propagam na primeira tentativa. O teste de
regressão cobre sucesso após conflito na primeira tentativa, esgotamento do
limite e ausência de retry para erro não conflitante.

Comandos executados e resultados:

```text
npx jest database/__tests__/watermelonSync.test.ts database/__tests__/watermelonSyncRetry.test.ts database/__tests__/syncGuard.test.ts services/__tests__/syncApi.test.ts --runInBand --watchAll=false
4 suites passed, 19 tests passed

npx jest --runInBand --watchAll=false
34 suites passed, 142 tests passed, 1 snapshot passed

npx tsc --noEmit
exit code 0
```

Novo commit: `3296ac9572810d97ffb05b3b3288ab7a608c2cfb`.
