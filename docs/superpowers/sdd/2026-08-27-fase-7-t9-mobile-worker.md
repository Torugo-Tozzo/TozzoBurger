# Task 9 — Onboarding de categoria (mobile)

## Resultado

Implementado o onboarding de primeiro acesso no mobile para usuários `OWNER`:

1. O app busca o estabelecimento autenticado em `GET /estabelecimentos`.
2. Quando a resposta contém `category === null`, exibe a tela de onboarding.
3. A tela oferece exatamente as seis categorias do contrato, carrega seeds
   estáticos de tipos de produto, permite adicionar/remover descrições e confirma
   somente a lista editada.
4. A confirmação faz `PATCH /establishments/:id`, um `POST /tipos` por item não
   vazio e, somente depois, dispara
   `runWithLock(() => synchronizeWithServer(token, establishmentId))`.
5. Após a confirmação, o gate atualiza o estado em memória e desmonta o
   onboarding; em uma nova avaliação, uma categoria não nula também não dispara
   a tela.

Arquivos principais:

- `database/watermelon/categorySeeds.ts`: enum tipado, seis opções e quatro
  sugestões coerentes por categoria.
- `services/api.ts`: clientes dos três endpoints do contrato.
- `services/categoryOnboarding.ts`: orquestração PATCH → POSTs → sync protegido.
- `app/onboarding.tsx`: seleção e edição da lista de tipos.
- `components/CategoryOnboardingGate.tsx`: gate do fluxo pós-login.
- `app/_layout.tsx`: integração do gate no shell autenticado.
- `i18n/locales/*/common.json`: textos do onboarding nos seis locales, com teste
  de bundle.

## Decisões tomadas

- Segui o brief desta task como fonte de verdade. Portanto, o lookup usa
  `GET /estabelecimentos` (sem `:id`), enquanto a mutação usa exatamente
  `PATCH /establishments/:id` e a criação usa `POST /tipos`. Não consultei o
  repositório da API.
- O ruling de RBAC foi aplicado literalmente: somente `user.role === 'OWNER'`
  é elegível. `MANAGER`, `EMPLOYEE` e `CUSTOMER` não fazem sequer o GET de
  onboarding; em particular, um `MANAGER` com categoria nula não vê a tela nem
  tenta criar tipos que retornariam 403.
- O gate só interpreta `category === null` como pendência. Categoria ausente,
  já configurada ou erro/offline no GET deixa o shell normal disponível, sem
  transformar uma falha de rede em onboarding falso.
- Os seeds são configuração local e não vêm da API. O seed de `HAMBURGUERIA`
  é `Lanches`, `Bebidas`, `Porções`, `Sobremesas`; as outras cinco categorias
  também possuem listas não vazias e sem duplicatas.
- Os POSTs são sequenciais e recebem `{ description, color: '#9E9E9E' }`. A
  lista é normalizada para remover espaços externos e entradas vazias; a UI
  impede duplicatas adicionadas pelo usuário.
- Não foi criado cache local de onboarding: o gate não lê nem grava Watermelon
  para esse estado. O fluxo usa o estabelecimento autenticado e passa o mesmo
  `establishmentId` ao sync, preservando o isolamento exigido pelo plano.
- O módulo pesado de sync é carregado dentro do callback de `runWithLock`. Isso
  mantém o comportamento de runtime e evita instanciar o adapter JSI durante a
  importação do layout em ambientes de teste que mockam o provider de sync.

## TDD e testes

O ciclo TDD foi executado em etapas:

- RED inicial: os testes novos falharam pela ausência de `categorySeeds`, da
  orquestração/tela e das três funções de API; os quatro testes antigos de
  `services/__tests__/api.test.ts` permaneceram passando.
- GREEN incremental: seeds, API, orquestração, tela/gate e cópia i18n foram
  implementados e testados após cada etapa.

Comandos finais e resultados:

- `npx jest app/__tests__/onboarding.test.tsx services/__tests__/api.test.ts services/__tests__/categoryOnboarding.test.ts database/watermelon/__tests__/categorySeeds.test.ts i18n/__tests__/index.test.ts app/__tests__/i18nSurfaces.test.tsx --runInBand --watchAll=false --silent`
  — **6 suítes, 30 testes passando**.
- `npx jest --runInBand --watchAll=false --silent` — **37 suítes, 155 testes
  passando; 1 snapshot passando**. As mensagens `i18n check failed` exibidas
  durante essa execução são os diagnósticos esperados pelas fixtures inválidas
  cobertas em `scripts/__tests__/check-i18n.test.ts`; o processo terminou com
  código 0.
- `node scripts/check-i18n.mjs` — **passou** (`6 locales, 15 namespaces`).
- `npx tsc --noEmit` — **passou**, sem erros.
- `git diff --cached --check` — **passou**, sem erro de whitespace; os avisos
  de permissão/configuração do Git não alteraram o conteúdo staged.

Não foi executado `npx expo run:android` nem um fluxo contra API real: esta task
exigia a suíte focada e o typecheck, e o contrato foi coberto por mocks nos
testes de API/orquestração.

## Self-review

- O teste de fluxo escolhe `HAMBURGUERIA`, adiciona `Combos`, remove `Lanches` e
  confirma que somente `Bebidas`, `Porções`, `Sobremesas` e `Combos` geram POST;
  também verifica o sync após os POSTs.
- O gate foi coberto para `OWNER` pendente, categoria já configurada, usuário
  não-`OWNER` e remoção do onboarding após sucesso sem novo GET.
- A importação do layout foi revisada após a regressão de JSI encontrada na
  suíte completa; o carregamento lazy do sync corrigiu os dois testes de
  navegação afetados.
- O staging foi feito com caminhos explícitos. Artefatos `.md`, `.txt` e logs
  preexistentes no worktree foram preservados e não entraram no commit de
  implementação.
- Observação de atomicidade: o contrato fornecido não oferece transação nem
  endpoint de criação em lote para combinar o PATCH com os vários POSTs. Se o
  PATCH tiver sucesso e um POST posterior falhar, a categoria pode ficar salva
  sem todos os tipos; a tela mostra erro e permanece no fluxo atual, mas uma
  nova sessão não repete o onboarding porque a categoria já não é nula. Resolver
  atomicidade/idempotência exigiria uma mudança de contrato/API fora do escopo
  desta task e deve ser considerado pelo controller antes de uma evolução desse
  cenário.

## Commits

- `04f2172` — `feat: add category onboarding` (implementação e testes).
- O commit separado deste relatório será informado no handoff final.

## Fix round 1

Corrigido o bypass da rota direta `app/onboarding.tsx`: usuários cujo role não
é exatamente `OWNER` são redirecionados para `/(tabs)` sem GET nem mutações, e
um `OWNER` só vê a tela quando `GET /estabelecimentos` confirma
`category === null`. A decisão de elegibilidade e a consulta foram extraídas
para `useCategoryOnboardingAccess`, reutilizado pelo gate e pela rota; o gate
continua desmontando o onboarding após a confirmação.

Testes executados:

- `npx --no-install jest app/__tests__/onboarding.test.tsx --runInBand` — **7
  testes passando**.
- `npx --no-install jest --runInBand` — **37 suítes, 157 testes passando; 1
  snapshot passando**. Os diagnósticos do checker de i18n e avisos de módulos
  nativos são os esperados pelas fixtures/testes existentes.
- `npx tsc --noEmit` — **passou**, sem erros.
- `rtk git diff --cached --check` — **passou**, sem erro de whitespace.

Commit da correção: `6fd6bf6` — `fix: guard direct category onboarding route`.
