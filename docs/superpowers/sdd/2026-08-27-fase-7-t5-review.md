# Revisão independente — Fase 7, Task 5

- Data: 2026-08-27
- Repositório: TozzoBurger
- Branch: feat/fase-7-sync-status-categoria
- Commit revisado: 49611d6197fc19aeeac9047080db61b7fea4ba8c
- Base declarada: f5f5dbec100726052ca6cbf747491aa01719196b (Task 4)
- Revisor: subagente independente

## Veredito

**REPROVADO**.

Os critérios mecânicos da Task 5 passam: as assinaturas públicas permaneceram compatíveis, não há SQL cru nos três hooks, a suíte completa e o TypeScript passam, e nenhuma tela/componente foi alterado. Porém, há um achado **Important** bloqueante: os hooks agora gravam e leem um banco WatermelonDB persistente enquanto o fluxo de autenticação, sincronização e limpeza de dados da aplicação continua usando o SQLite legado. O commit deixa produtos e impressoras fora do sync/limpeza existentes e permite vazamento de dados entre estabelecimentos no mesmo dispositivo.

## Classificação

| Severidade | Quantidade | Bloqueia? |
|---|---:|---|
| Critical | 0 | — |
| Important | 1 | Sim |
| Medium | 1 | Não isoladamente |
| Low | 0 | — |
| Informativo | 1 | Não |

## Escopo e diff revisado

Comandos executados:

~~~text
git show 49611d6 --stat
git rev-parse 49611d6~1
git diff --name-only 49611d6~1 49611d6
git diff --check 49611d6~1 49611d6
~~~

git show 49611d6 --stat confirmou 6 arquivos alterados, 710 inserções e 376 remoções:

~~~text
database/__tests__/usePrinterDatabase.test.ts
database/__tests__/useProductDatabase.test.tsx
database/__tests__/useUserDatabase.test.ts
database/usePrinterDatabase.ts
database/useProductDatabase.ts
database/useUserDatabase.ts
~~~

Li o diff completo dos três hooks e dos três arquivos de teste. git diff --check não encontrou erro de whitespace.

## Checklist específico da Task 5

### 1. Assinaturas públicas

**Passou.** Os três nomes exportados continuam sendo hooks sem parâmetros:

~~~text
useProductDatabase()
useUserDatabase()
usePrinterDatabase()
~~~

Os métodos retornados mantêm os nomes, parâmetros e formatos de retorno observados na implementação anterior. Em particular, foram preservados os retornos { id } de produto, { insertedRowId } de usuário e { uuid, name }/null do printer, além dos aliases existentes no produto (getTipoProdutos, filterByTipo, searchOrigemProdutoId e showAdd).

Também procurei consumidores de produção. Os chamadores existentes em app/, hooks/ e modais não foram modificados pelo commit, portanto não há quebra de assinatura escondida nas telas.

### 2. Ausência de SQL cru nos três hooks

**Passou.** Para cada arquivo, executei git grep no commit revisado para:

~~~text
execAsync
runAsync
getAllAsync
prepareAsync
getFirstAsync
expo-sqlite
~~~

Todas as buscas retornaram “sem ocorrências” em:

~~~text
database/useProductDatabase.ts
database/useUserDatabase.ts
database/usePrinterDatabase.ts
~~~

Os hooks usam database.get(...).query(...), modelos Watermelon e database.write(...)/batch(...).

### 3. Conversão de ID de usuário e concorrência

**Não encontrei race condition óbvia na implementação atual.** useUserDatabase calcula o próximo ID dentro de database.write(...). A implementação de Database.write do Watermelon enfileira o trabalho na WorkQueue, e a fila aguarda a conclusão da operação anterior antes de iniciar a seguinte. Assim, dois create concorrentes não executam simultaneamente o trecho fetch -> max + 1 -> insert.

Além da leitura do código da fila (node_modules/@nozbe/watermelondb/Database/index.js e WorkQueue.js), executei uma prova independente com 20 chamadas concorrentes ao hook contra um banco Watermelon em memória. Saída relevante:

~~~json
{"ids":[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20],"count":20,"stored":[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]}
~~~

Também li database/__tests__/syncGuard.test.ts; o teste existente de serialização de chamadas concorrentes continua passando. Portanto, não há achado de concorrência bloqueante nesta revisão.

## Achado Important-01 — bancos divergentes deixam dados fora do sync e permitem vazamento entre estabelecimentos

**Severidade: Important — bloqueante.**

### Evidência

O commit troca os três hooks para o singleton Watermelon em database/watermelon/database.ts, com banco persistente (dbName: tozzoburger). Ao mesmo tempo:

- app/_layout.tsx continua montando somente o SQLiteProvider legado;
- context/AuthContext.tsx continua lendo e escrevendo TB_USERS e executando a limpeza de troca de estabelecimento somente no SQLite legado;
- context/AutoSyncContext.tsx continua lendo tabelas legadas;
- database/useSyncDatabase.ts continua sendo a implementação de sincronização baseada em expo-sqlite;
- não há filtro por establishment_id nas queries de produto do novo hook;
- create de produto converte a ausência de establishmentId para '', e não obtém automaticamente o estabelecimento autenticado;
- a limpeza legada de TB_PRODUCTS, TB_PRINTERS e TB_USERS não remove registros equivalentes do banco Watermelon.

### Cenário concreto

1. O usuário do estabelecimento A cria ou consulta produtos usando useProductDatabase; os registros vão para WatermelonDB.
2. O usuário troca para o estabelecimento B. O AuthContext limpa/recria as tabelas TB_* do SQLite legado, mas não limpa o singleton Watermelon.
3. searchByName, filterByTipo, show e showAdd do novo hook consultam Watermelon sem restringir pelo estabelecimento atual. Produtos de A continuam retornando para B.
4. O mesmo problema existe para usePrinterDatabase: a impressora fica armazenada no registro fixo id = '1' do Watermelon, enquanto a remoção de TB_PRINTERS no fluxo de troca de conta atua em outro banco.

Há ainda uma divergência funcional imediata: o produto criado pela UI nova não é observado pelo useSyncDatabase legado, porque o sync consulta SQLite; portanto ele não entra no fluxo de sincronização atual. O inverso também ocorre: produtos/types seed carregados apenas no SQLite legado não aparecem nas queries Watermelon.

### Impacto

Isso pode causar:

- exposição de catálogo e impressora do estabelecimento anterior para o estabelecimento atual;
- operações e relatórios usando dados de tenant incorreto;
- produtos criados localmente que não são enviados pelo sync existente;
- estado aparentemente vazio ou inconsistente após login/troca de estabelecimento.

Os testes novos cobrem CRUD e filtragem de produto ativo, CRUD de usuário e CRUD de impressora, mas não cobrem troca de estabelecimento, persistência entre sessões, integração com AuthContext/sync nem isolamento por establishment_id. O fato de o sync completo estar planejado para uma task posterior explica a ordem da migração, mas não elimina o estado quebrado introduzido por este commit se ele for aceito/entregue isoladamente.

### Correção recomendada

Antes de aprovar, alinhar a fronteira de migração: ou migrar/rotear também sync, autenticação e limpeza para o mesmo banco Watermelon nesta etapa, ou manter uma camada de compatibilidade que replique/consuma os dados no SQLite até a conclusão do sync. Em qualquer caso, o acesso a produtos deve ser particionado pelo estabelecimento atual e a troca de estabelecimento deve limpar ou isolar os registros Watermelon; a impressora também precisa participar dessa política.

## Achado Medium-01 — default de role mudou de EMPLOYEE para null

**Severidade: Medium — não bloqueia isoladamente.**

No fluxo anterior, o INSERT de usuário não informava role, e o schema legado tinha role TEXT NULL DEFAULT 'EMPLOYEE'. O novo useUserDatabase.create prepara explicitamente role: input.role ?? null. Assim, chamadas que não informam role — inclusive o teste novo — passam a armazenar null, não EMPLOYEE.

Não encontrei consumidor de produção de useUserDatabase no commit/contexto atual, então o impacto imediato parece limitado. Ainda assim, é uma alteração de comportamento incompatível com o default legado e deve ser decidida/documentada ou coberta por teste antes da migração completa.

## Informativo — cobertura adicional ausente

Os testes alterados passam, mas não testam a paginação/tie-breaker completa do produto, a conversão de estabelecimento entre string/number, a persistência cruzada entre autenticação e hooks, nem a troca de estabelecimento. A prova concorrente independente desta revisão passou, mas deveria ser incorporada como teste do hook se a conversão de ID for mantida.

## Verificações executadas

### Suites focadas

~~~text
npx jest database/__tests__/useProductDatabase.test.tsx database/__tests__/useUserDatabase.test.ts database/__tests__/usePrinterDatabase.test.ts --watchAll=false --runInBand --silent

Test Suites: 3 passed, 3 total
Tests:       12 passed, 12 total
Snapshots:   0 total
~~~

### Suíte completa

~~~text
npx jest --watchAll=false --runInBand

Test Suites: 30 passed, 30 total
Tests:       121 passed, 121 total
Snapshots:   1 passed, 1 total
Time:        5.42 s
Process exit: 0
~~~

Houve apenas logs esperados de casos negativos/i18n, erro simulado de BLE e fallback quando JSI do Watermelon não está disponível; não houve falha de teste.

### TypeScript

~~~text
npx tsc --noEmit

Process exit: 0
~~~

### Telas e componentes

~~~text
git diff --name-only 49611d6~1 49611d6
git diff --name-only 49611d6~1 49611d6 -- app components
~~~

A segunda busca não retornou arquivos. A primeira retornou somente os seis arquivos em database/ listados acima; nenhuma tela ou componente consumidor foi alterado.

## Conclusão

A implementação atende ao checklist local de API e substituição de SQL, e as verificações automatizadas reproduzem o relatório do worker (30 suites, 121 testes e TypeScript limpo). Mesmo assim, o comportamento integrado não é seguro: a migração para um banco persistente separado não foi acompanhada por isolamento de estabelecimento nem pela migração/ponte do fluxo existente de sync e limpeza. Por esse motivo, o veredito final é **REPROVADO** até o achado Important-01 ser resolvido ou explicitamente tratado por uma alteração de arquitetura que torne o estado intermediário seguro.

Não foram alterados arquivos de código nem criado commit durante a revisão; este arquivo é o único artefato produzido pela revisão.

