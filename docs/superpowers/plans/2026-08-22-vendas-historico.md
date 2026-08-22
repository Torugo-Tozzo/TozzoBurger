# Vendas e Histórico Paginados Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a Fase 3 do roadmap com histórico de vendas paginado, filtrado e carregado incrementalmente no SQLite e na API, sem alterar retenção de sincronização, design system ou release Android.

**Architecture:** A API normaliza e valida os parâmetros de `GET /vendas`, aplica o escopo do estabelecimento, os filtros e a paginação no Prisma, e devolve metadados explícitos. O mobile usa uma consulta SQLite construída somente com fragmentos SQL fixos e valores parametrizados, enquanto o cliente HTTP e `HistoricoScreen` mantêm páginas, totais, estados de carregamento e uma geração de requisição para descartar respostas antigas.

**Tech Stack:** Bun, Express, Prisma/Postgres, TypeScript, Expo Router, React Native, `expo-sqlite`, Jest/jest-expo.

**Spec:** `docs/superpowers/specs/2026-08-22-vendas-botoes-playstore-design.md`

## Global Constraints

- O escopo desta execução é somente o Objetivo 1 da especificação: vendas/histórico; botões, Play Store e dashboard permanecem para fases posteriores.
- Todas as implementações, commits e branches têm como destino de integração `dev`; `main` não será tocada.
- A API usa `DEFAULT_VENDAS_LIMIT = 50` e `MAX_VENDAS_LIMIT = 100`; `page` e `limit` são inteiros positivos e `limit` acima de 100 retorna HTTP 400.
- A resposta de `GET /vendas` preserva `vendas`, `fechamento` e `X-Total-Count`, acrescentando `pagination: { page, limit, total, totalPages, hasNextPage }`.
- `fechamento` representa a soma de todas as vendas que passam pelos filtros, não somente a página retornada.
- A seção local consulta somente o SQLite já existente; não deve buscar dados remotos nem alterar a retenção da sincronização. A remoção do limite implícito de três dias/500 itens da leitura é apenas para permitir paginação sobre todos os registros ainda presentes no SQLite.
- SQL e SQL bruto devem usar valores parametrizados. Fragmentos SQL dinâmicos só podem vir de uma lista fixa de cláusulas internas.
- Vendas canceladas/soft-deletadas continuam fora das listagens: API com `excluida = false`; SQLite com `deleted_at IS NULL` e `excluida` nula/zero.
- Nenhum `catch` pode engolir erro; falhas devem ser logadas, manter itens já carregados quando houver uma página anterior e permitir nova tentativa.
- Cada mudança de comportamento começa por teste que falha, passa pelo ciclo RED/GREEN/REFACTOR e termina com o teste focado e a suíte do pacote executados.
- Cada tarefa será executada por um subagente novo e revisada individualmente; todos os subagentes devem ser criados explicitamente com `model: "gpt-5.6-luna"` e `reasoning_effort: "max"`, sem exceção.

---

### Task 1: Fechar o contrato paginado de `GET /vendas` na API

**Files:**
- Modify: `C:/RN/api/api-tozzo.uk/modules/vendas/vendas.controller.ts`
- Test: `C:/RN/api/api-tozzo.uk/tests/vendas/vendas.controller.test.ts`

**Interfaces:**
- Consumes: `req.user.estabelecimentoId` e os query params `page`, `limit`, `dataInicial`, `dataFinal`, `horaInicial`, `horaFinal`, `cliente`, `totalMin`, `totalMax` e `criadoPor`.
- Produces: HTTP 200 com `{ vendas, fechamento, pagination }`, HTTP 400 para parâmetros inválidos e `X-Total-Count` com o total filtrado.

- [ ] **Step 1: Escrever os testes RED de contrato e validação**

Acrescente testes no bloco `describe('listarVendas')` que façam o fake Prisma respeitar `skip`, `take`, filtros de cliente, vendedor, faixa numérica e datas. Os testes devem provar, separadamente:

```ts
it('usa página 1 e limite 50 por padrão e devolve metadados', async () => {
  seedVenda({ id: 'venda-1', total: 10, horario: new Date('2026-08-20T10:00:00.000Z') });
  seedVenda({ id: 'venda-2', total: 20, horario: new Date('2026-08-21T10:00:00.000Z') });

  const res = makeRes();
  await listarVendas(makeReq({ id: 'u1', estabelecimentoId: 'estab-1' }), res);

  expect(res.jsonBody.pagination).toEqual({
    page: 1,
    limit: 50,
    total: 2,
    totalPages: 1,
    hasNextPage: false,
  });
  expect(res.jsonBody.fechamento).toBe(30);
});

it('aplica skip/take, filtros de cliente, total e vendedor', async () => {
  seedVenda({ id: 'v1', cliente: 'Ana Silva', total: 20, usuarioVendedorId: 'u1' });
  seedVenda({ id: 'v2', cliente: 'Bruno', total: 80, usuarioVendedorId: 'u2' });
  seedVenda({ id: 'v3', cliente: 'Ana Souza', total: 40, usuarioVendedorId: 'u1' });

  const res = makeRes();
  await listarVendas(makeReq({ id: 'u1', estabelecimentoId: 'estab-1' }, {
    query: { page: '2', limit: '1', cliente: 'ana', totalMin: '20', totalMax: '50', criadoPor: 'u1' },
  }), res);

  expect(res.jsonBody.vendas).toHaveLength(1);
  expect(res.jsonBody.pagination).toMatchObject({ page: 2, limit: 1, total: 2, totalPages: 2, hasNextPage: false });
  expect(res.jsonBody.fechamento).toBe(60);
});

it('aplica intervalo de data e horário e mantém os valores fora do intervalo fora da resposta', async () => {
  seedVenda({ id: 'dentro', horario: new Date('2026-08-20T10:30:00.000Z') });
  seedVenda({ id: 'cedo', horario: new Date('2026-08-20T07:00:00.000Z') });
  seedVenda({ id: 'tarde', horario: new Date('2026-08-21T23:00:00.000Z') });

  const res = makeRes();
  await listarVendas(makeReq({ id: 'u1', estabelecimentoId: 'estab-1' }, {
    query: { dataInicial: '2026-08-20T09:00:00.000Z', dataFinal: '2026-08-20T18:00:00.000Z', horaInicial: '09:00', horaFinal: '18:00' },
  }), res);

  expect(res.jsonBody.vendas.map((v: { id: string }) => v.id)).toEqual(['dentro']);
});

it.each([
  [{ page: '0' }, 'page'],
  [{ page: '1.5' }, 'page'],
  [{ limit: '0' }, 'limit'],
  [{ limit: '101' }, 'limit'],
  [{ totalMin: 'nao-numero' }, 'total'],
])('rejeita paginação/filtro inválido %j', async (query) => {
  const res = makeRes();
  await listarVendas(makeReq({ id: 'u1', estabelecimentoId: 'estab-1' }, { query }), res);
  expect(res.statusCode).toBe(400);
});
```

Também estenda o fake com `findMany` que aplique `skip`/`take`, os operadores usados no `where` e, se a implementação usar filtro horário via `$queryRaw`, um `$queryRaw` determinístico que devolva os IDs compatíveis com `horario`. Não faça os testes aceitarem qualquer chamada: verifique que o resultado e o `pagination` mudam quando os filtros mudam.

- [ ] **Step 2: Rodar somente os testes novos para confirmar RED**

Run from `C:/RN/api/api-tozzo.uk`:

```text
bun test --isolate tests/vendas/vendas.controller.test.ts
```

Expected: FAIL because `listarVendas` ainda não valida o limite, não constrói os filtros novos e não devolve `pagination`.

- [ ] **Step 3: Implementar o parser, filtros e paginação mínimos**

No controlador, introduza constantes e helpers privados equivalentes a:

```ts
const DEFAULT_VENDAS_LIMIT = 50;
const MAX_VENDAS_LIMIT = 100;

function parsePositiveInteger(value: unknown, fallback: number, field: string): number {
  if (value == null || String(value).trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${field} inválido`);
  return parsed;
}
```

Use tratamento de entrada que diferencie ausência de valor de valor inválido. Valide datas com `Date` finita, horas no formato `HH:mm` ou `HH:mm:ss`, números finitos para `totalMin`/`totalMax`, e rejeite uma faixa em que o mínimo seja maior que o máximo. Normalize `cliente` e `criadoPor` com `trim`; string vazia não entra no `where`.

Construa o `where` sempre com o tenant e `excluida: false`. Acrescente:

```ts
if (cliente) where.cliente = { contains: cliente, mode: 'insensitive' };
if (totalMin != null || totalMax != null) where.total = { ...(totalMin != null ? { gte: totalMin } : {}), ...(totalMax != null ? { lte: totalMax } : {}) };
if (criadoPor) where.vendedor = { id: criadoPor };
if (dataInicial || dataFinal) where.horario = { ...(dataInicial ? { gte: dataInicial } : {}), ...(dataFinal ? { lte: dataFinal } : {}) };
```

Para `horaInicial`/`horaFinal`, mantenha os valores parametrizados. Quando houver filtro de hora, use uma consulta SQL bruta parametrizada apenas para obter os IDs que satisfazem os minutos do dia e acrescente `id: { in: ids }` ao `where`; combine esse resultado com o intervalo de datas do Prisma. Não concatene query params no SQL. Se nenhum ID satisfizer a hora, a listagem, contagem e soma devem retornar vazias/zero.

Sempre aplique `take: limit` e `skip: (page - 1) * limit`, execute `findMany`, `count` e `aggregate` com o mesmo `where`, e calcule:

```ts
const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
const pagination = { page, limit, total, totalPages, hasNextPage: page < totalPages };
```

Retorne `fechamento._sum.total || 0`, `pagination` e preserve o cabeçalho `X-Total-Count`. Erros de entrada devem responder 400; erros inesperados continuam logados e respondem 500.

- [ ] **Step 4: Rodar os testes focados e a suíte da API**

Run:

```text
bun test --isolate tests/vendas/vendas.controller.test.ts
bunx prisma generate
bun test --isolate
bunx tsc --noEmit
```

Expected: todos os testes da API passam, incluindo os testes de segurança já existentes, e o TypeScript não apresenta erros.

- [ ] **Step 5: Commitar a tarefa da API**

Na branch de feature da API:

```text
git add modules/vendas/vendas.controller.ts tests/vendas/vendas.controller.test.ts
git commit -m feat-api-vendas-paginadas
```

### Task 2: Paginar e filtrar a leitura local do SQLite

**Files:**
- Create: `C:/RN/TozzoBurger/database/vendasQuery.ts`
- Modify: `C:/RN/TozzoBurger/database/useVendaDatabse.ts`
- Modify: `C:/RN/TozzoBurger/services/vendas.ts`
- Test: `C:/RN/TozzoBurger/database/__tests__/useVendaDatabse.test.tsx`
- Test: `C:/RN/TozzoBurger/services/__tests__/vendas.test.ts`

**Interfaces:**
- Consumes: `VendasFilters` e registros existentes de `TB_VENDAS`/`RL_VENDA_PRODUTO`.
- Produces: `listVendasRecentes(filters)` retornando `{ vendas, fechamento, pagination }`, com 50 itens por página, total/soma independentes da página e consultas parametrizadas.

- [ ] **Step 1: Escrever os testes RED do builder SQL e do hook**

Crie testes para uma função pura exportada de `database/vendasQuery.ts` (por exemplo `buildLocalVendasQuery`) que comprovem que página, `LIMIT`, `OFFSET`, cliente, datas, horas e totais entram como parâmetros, não como texto interpolado:

```ts
const query = buildLocalVendasQuery({
  page: 2,
  limit: 25,
  dataInicial: '2026-08-20',
  dataFinal: '2026-08-21',
  horaInicial: '08:30',
  horaFinal: '22:15',
  cliente: "Ana' OR 1=1 --",
  totalMin: '10,50',
  totalMax: 99.9,
});

expect(query.select).toContain('LIMIT ? OFFSET ?');
expect(query.select).not.toContain("Ana' OR 1=1 --");
expect(query.params).toContain("%Ana' OR 1=1 --%");
expect(query.params).toContain(25);
expect(query.params).toContain(25);
expect(query.count).toContain('COUNT(*)');
expect(query.sum).toContain('SUM(total)');
```

Estenda `useVendaDatabse.test.tsx` com um `getAllAsync`/`getFirstAsync` controlado e verifique que `listVendasRecentes({ page: 2, limit: 2, cliente: 'Ana' })` chama o SQL de página com os parâmetros esperados, consulta contagem/soma e devolve `pagination` sem agrupar a resposta por data. Mantenha os testes existentes de `markChanged`.

- [ ] **Step 2: Rodar os testes focados para confirmar RED**

Run from `C:/RN/TozzoBurger`:

```text
npx jest database/__tests__/useVendaDatabse.test.tsx services/__tests__/vendas.test.ts --runInBand
```

Expected: FAIL because `buildLocalVendasQuery` não existe e `listVendasRecentes` ainda devolve grupos com limite fixo.

- [ ] **Step 3: Implementar o builder SQL parametrizado**

Em `database/vendasQuery.ts`, mantenha uma lista fixa de cláusulas e parâmetros separados. A base deve ser:

```sql
deleted_at IS NULL
AND (excluida IS NULL OR excluida = 0)
```

Acrescente somente cláusulas fixas para `horario >= ?`, `horario <= ?`, `strftime('%H:%M', horario) >= ?`, `strftime('%H:%M', horario) <= ?`, `LOWER(COALESCE(cliente, '')) LIKE LOWER(?)`, `total >= ?` e `total <= ?`. Use `ORDER BY horario DESC, id DESC LIMIT ? OFFSET ?`. Gere consultas de `COUNT(*)` e `COALESCE(SUM(total), 0)` com o mesmo `WHERE`, mas sem `LIMIT`/`OFFSET`. Os valores de cliente devem ser envolvidos por `%` somente no array de parâmetros.

Normalize `page`/`limit` com os mesmos defaults 1/50 usados pelo mobile, rejeite valores não inteiros positivos e limite o máximo em 100. Datas/hora inválidas devem ser ignoradas apenas quando forem campos vazios; um campo não vazio malformado deve provocar erro explícito para a tela tratar.

- [ ] **Step 4: Adaptar o hook para retornar página, total e fechamento**

Substitua a leitura fixa dos últimos três dias e `LIMIT 500` por `buildLocalVendasQuery`. Não altere `createVenda`, `createFromSync`, `removeVenda`, `getVendaById` ou a retenção da sincronização. Execute a consulta de página, a contagem e a soma; carregue nomes dos produtos de cada item retornado com query parametrizada já existente; devolva:

```ts
{
  vendas: vendasComProdutos,
  fechamento,
  pagination: {
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    hasNextPage: page < totalPages,
  },
}
```

Mantenha `listVendasPorDia` com a assinatura atual para os consumidores que não fazem parte desta fase.

- [ ] **Step 5: Rodar GREEN, suíte mobile e TypeScript**

Run:

```text
npx jest database/__tests__/useVendaDatabse.test.tsx services/__tests__/vendas.test.ts --runInBand
npx jest --watchAll=false --runInBand
npx tsc --noEmit
```

Expected: testes focados e suíte completa passam, com zero falhas, e o hook retorna a página filtrada.

- [ ] **Step 6: Commitar a tarefa local**

```text
git add database/vendasQuery.ts database/useVendaDatabse.ts database/__tests__/useVendaDatabse.test.tsx services/vendas.ts services/__tests__/vendas.test.ts
git commit -m feat-mobile-vendas-locais-paginadas
```

### Task 3: Fechar cliente HTTP e helpers de paginação remota

**Files:**
- Modify: `C:/RN/TozzoBurger/services/vendas.ts`
- Modify: `C:/RN/TozzoBurger/services/api.ts`
- Modify: `C:/RN/TozzoBurger/services/__tests__/vendas.test.ts`
- Modify: `C:/RN/TozzoBurger/services/__tests__/api.test.ts`

**Interfaces:**
- Consumes: payload remoto da API e `VendasFilters`.
- Produces: `VendasPagination`, `VendasListResponse` com `pagination` sempre presente e helper de merge que não duplica IDs.

- [ ] **Step 1: Escrever os testes RED**

Atualize o teste HTTP para responder com:

```ts
const payload = {
  vendas: [{ id: 'venda-1', total: 25 }],
  fechamento: 50,
  pagination: { page: 2, limit: 50, total: 101, totalPages: 3, hasNextPage: true },
};
```

Verifique que `listVendas` preserva os metadados. Adicione um caso de resposta sem `pagination` com cabeçalho `X-Total-Count` para provar o fallback compatível. Em `vendas.test.ts`, teste que:

```ts
expect(mergeVendasPage([{ id: 'v1' } as VendaRenderizavel], [{ id: 'v1' } as VendaRenderizavel, { id: 'v2' } as VendaRenderizavel], 2).map((v) => v.id)).toEqual(['v1', 'v2']);
```

Também teste que uma página 1 substitui a lista anterior, que uma página posterior vazia não remove itens existentes e que `resetVendasPageState()` devolve um estado novo com `page: 0`, `hasNextPage: true`, ambos os carregamentos como `false` e `error: null`.

- [ ] **Step 2: Rodar os testes para confirmar RED**

Run:

```text
npx jest services/__tests__/api.test.ts services/__tests__/vendas.test.ts --runInBand
```

Expected: FAIL porque a resposta tipada não expõe `pagination` e `mergeVendasPage` ainda não existe.

- [ ] **Step 3: Implementar tipos, fallback e merge determinístico**

Em `services/vendas.ts`, defina:

```ts
export type VendasPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
};

export type VendasListResponse = {
  vendas: VendaApi[];
  fechamento: number;
  pagination: VendasPagination;
};
```

Implemente `mergeVendasPage(existing, incoming, page)` preservando a ordem da primeira ocorrência por `id`, substituindo o objeto quando a mesma venda chegar novamente e concatenando somente IDs novos para `page > 1`. Para `page === 1`, retorne uma lista deduplicada formada apenas pela resposta nova. Exporte também `resetVendasPageState()` com o tipo `VendasPageState`, para que a tela use a mesma transição testada ao trocar filtro, seção ou refresh:

```ts
export type VendasPageState = {
  page: number;
  hasNextPage: boolean;
  loadingInitial: boolean;
  loadingMore: boolean;
  error: string | null;
};

export function resetVendasPageState(): VendasPageState {
  return { page: 0, hasNextPage: true, loadingInitial: false, loadingMore: false, error: null };
}
```

Em `services/api.ts`, leia `body.pagination` quando válido. Se a API antiga não o enviar, derive `total` do header `X-Total-Count` ou do tamanho recebido, derive `page`/`limit` dos filtros com defaults 1/50 e calcule `totalPages`/`hasNextPage`. Não assuma que `Response.headers` existe nos mocks; use acesso defensivo. O retorno final nunca deve deixar `pagination` indefinido.

- [ ] **Step 4: Rodar GREEN e a suíte mobile**

Run:

```text
npx jest services/__tests__/api.test.ts services/__tests__/vendas.test.ts --runInBand
npx jest --watchAll=false --runInBand
npx tsc --noEmit
```

Expected: todos os testes passam e o serviço continua enviando todos os filtros existentes pelo `buildVendasQueryParams`.

- [ ] **Step 5: Commitar o contrato do cliente**

```text
git add services/vendas.ts services/api.ts services/__tests__/vendas.test.ts services/__tests__/api.test.ts
git commit -m feat-mobile-contrato-vendas-paginadas
```

### Task 4: Integrar estados e carregamento incremental em `HistoricoScreen`

**Files:**
- Modify: `C:/RN/TozzoBurger/app/(tabs)/historico.tsx`

**Interfaces:**
- Consumes: `useVendasDatabase().listVendasRecentes`, `api.listVendas`, `mergeVendasPage` e `VendasPagination`.
- Produces: as duas seções do histórico com primeira página de 50, `onEndReached`, reset por filtro/seção/refresh, prevenção de chamadas duplicadas e descarte de respostas obsoletas.

- [ ] **Step 1: Especificar e escrever os testes/helper checks antes do código da tela**

Use `mergeVendasPage` e `resetVendasPageState` da Task 3 como prova unitária de concatenação, duplicidade e reset. Antes de alterar a tela, confirme que os testes desses helpers falham sem a implementação e passam depois dela. A integração deve consumir esses helpers, não duplicar a lógica de merge/reset dentro do componente. Se a tela não puder ser renderizada com segurança no setup Expo por causa das dependências nativas, mantenha os checks nos helpers e registre essa limitação no relatório da tarefa, sem remover a cobertura do serviço HTTP/SQLite.

- [ ] **Step 2: Rodar o teste novo para confirmar RED**

Run:

```text
npx jest services/__tests__/vendas.test.ts --runInBand
```

Expected: FAIL somente no comportamento novo de reset/estado, não por erro de importação ou mock incompleto.

- [ ] **Step 3: Implementar a máquina de carregamento da tela**

Use `PAGE_SIZE = 50` e mantenha estados separados para cada fonte, incluindo itens, total/fechamento, `page`, `hasNextPage`, carregamento inicial, carregamento da próxima página e erro. A função de carga deve capturar uma geração numérica em `useRef`; após cada `await`, ignore o resultado se a geração capturada não for a atual.

O carregamento inicial de cada seção deve chamar página 1 e substituir os itens. `onEndReached` só pode chamar a próxima página quando `hasNextPage` for verdadeiro e nenhum carregamento daquela seção estiver ativo. A resposta deve passar por `mergeVendasPage`; a página e `hasNextPage` devem vir dos metadados, nunca do número de itens renderizados.

Ao aplicar/limpar filtros, trocar `device`/`establishment` ou atualizar, incremente a geração, limpe os itens e estados da consulta ativa, e inicie página 1. Os filtros enviados ao serviço devem remover `page`/`limit` antigos antes de acrescentar a página atual. O refresh deve substituir a página anterior, não concatenar.

Na seção local, use o resultado já filtrado de `listVendasRecentes` e o `fechamento` retornado pelo SQLite; remova o filtro em memória de `localSales`. Na seção remota, use `response.fechamento` como total financeiro filtrado. Falha na primeira página deve deixar a lista vazia com mensagem de erro/estado vazio; falha em página posterior deve preservar itens existentes, registrar/logar o erro e deixar a próxima tentativa possível pelo refresh. Não mostrar o fechamento de uma página como total do período.

Adicione `onEndReached`/`onEndReachedThreshold` ao `FlatList`, um indicador discreto de carregamento no fim quando `loadingMore` for verdadeiro e uma mensagem de erro apenas quando aplicável. Preserve as ações existentes de abrir, imprimir e excluir para a seção local e o modo somente leitura remoto.

- [ ] **Step 4: Rodar GREEN e validar a tela compilada**

Run:

```text
npx jest --watchAll=false --runInBand
npx tsc --noEmit
```

Expected: suíte Jest completa passa, `tsc` passa e a tela não produz chamadas duplicadas quando `onEndReached` é disparado durante um carregamento.

- [ ] **Step 5: Commitar a integração da tela**

```text
git add "app/(tabs)/historico.tsx"
git commit -m feat-mobile-historico-incremental
```

---

## Validação final da fase (coordenador)

- [ ] Conferir o ledger SDD e revisar cada diff de tarefa; nenhum Critical/Important pode ficar aberto.
- [ ] API: executar `bunx prisma generate`, `bun test --isolate` e `bunx tsc --noEmit` em `C:/RN/api/api-tozzo.uk`.
- [ ] Mobile: executar `npx jest --watchAll=false --runInBand` e `npx tsc --noEmit` em `C:/RN/TozzoBurger`.
- [ ] Tentar `npx expo run:android`; se o SDK/emulador continuar indisponível, registrar o erro exato sem declarar build nativo aprovado.
- [ ] Rodar a revisão final de branch com um subagente `gpt-5.6-luna`/`max`, gerar o pacote de diff a partir do merge-base de cada branch e registrar qualquer finding no ledger.
- [ ] Verificar que API e mobile estão em branches de feature limpas, com `dev` e `main` intactas; só então oferecer push/PR para `dev`, sem fazer merge/push compartilhado automaticamente.
