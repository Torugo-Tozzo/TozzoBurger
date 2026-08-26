# Task 7 — Fundação de i18n do app mobile

Data: 2026-08-25  
Branch: feat/fase-6-i18n-english-base  
Base protegida: nenhuma alteração em dev ou main, sem push e sem PR.

## Baseline confirmado

Antes de qualquer alteração, foram executados git log --oneline dev..HEAD e
git status. A saída do log era:

~~~text
0beb3f4 refactor(mobile): migrate SQLite domain to English
cf2fbbd docs: add fase 6 t0 mobile inventory
~~~

O status confirmou a branch feat/fase-6-i18n-english-base e apenas os dois
arquivos de planejamento/spec já fornecidos pelo usuário como não rastreados:

~~~text
?? docs/superpowers/plans/2026-08-24-fase-6-i18n.md
?? docs/superpowers/specs/2026-08-24-fase-6-i18n-design.md
~~~

## Implementação

- Dependências instaladas sem atualizar o Expo:
  i18next, react-i18next, expo-localization e
  @react-native-async-storage/async-storage.
  O projeto permanece em Expo SDK 52 (~52.0.47), com package-lock.json
  preservado e sem bun.lock.
- Criada a fundação em i18n/, com recursos locais, normalização de locale,
  locale do dispositivo, preferência persistida em
  @tozzoburger/locale, fallbackLng "en" e supportedLngs fechado em:
  en, pt-BR, es, fr, zh, hi, ar.
- Recursos completos nos 15 namespaces:
  common, auth, navigation, orders, sales, products, employees, charts,
  settings, sync, printer, offline, status, errors, catalog.
- O inventário real cobriu app/, components/, context/, hooks/ e services/,
  incluindo shell, login, tabs, telas, modais, estados vazios, labels de
  acessibilidade, Alerts, títulos nativos, sync, BLE e impressão.
- Status e categorias padrão recebem labels traduzidos; nomes de produto,
  ingredientes e demais dados de negócio persistidos permanecem intactos.
- Configurações ganhou seletor dos sete idiomas, persistência da escolha e
  aviso explícito de que uma troca entre LTR e RTL só passa a valer após o
  próximo reinício do app. O runtime não finge aplicar RTL completo sem
  reinício.
- scripts/check-i18n.mjs valida exatamente os sete locales, namespaces,
  completude, placeholders, strings vazias e texto TODO/TBD. Há teste de
  completude cobrindo exatamente esses sete locales.

## Commits da Task 7

~~~text
e03bf7a feat(mobile): add i18n foundation and locale checker
97d2b84 fix(mobile): close i18n locale and checker validation
b62dfc8 feat(mobile): translate app shell and main screens
4c22ef8 fix(mobile): address main screen i18n review
52563c0 feat(mobile): translate shared mobile surfaces
6956ddf fix(mobile): address shared surface i18n review
599e034 fix(mobile): address shared surface i18n review
8224f43 fix(mobile): align dotted i18n namespace test
5f3f989 feat(mobile): translate mobile modals
da32c75 fix(mobile): address modal i18n review
69474c5 feat(mobile): translate BLE and receipt printing
535784d fix(mobile): close BLE printing review
08d8254 feat(mobile): add language selector to settings
b4e7775 fix(mobile): complete settings accessibility
ef88b84 fix(mobile): translate not-found screen
92b11da fix(mobile): complete accessibility labels
472662a fix(mobile): address final i18n review
~~~

Cada subtarefa teve worker/reviewer dedicado; findings Critical/Important
foram corrigidos antes do avanço. O reviewer do último commit deu PASS sem
findings.

## Verificações finais

Executadas nesta ordem, como solicitado:

1. node scripts/check-i18n.mjs

   Exit code: 0

   ~~~text
   i18n check passed: 7 locales, 15 namespaces
   ~~~

2. npx jest --watchAll=false --runInBand

   Exit code: 0

   Saída final real:

   ~~~text
   Test Suites: 25 passed, 25 total
   Tests:       108 passed, 108 total
   Snapshots:   1 passed, 1 total
   Time:        5.597 s, estimated 6 s
   Ran all test suites.
   ~~~

   O output também conteve mensagens i18n check failed durante
   scripts/__tests__/check-i18n.test.ts; elas são os fixtures inválidos
   usados para provar que o checker rejeita bundles incompletos, extras,
   placeholders divergentes, TODO/TBD e locales/arquivos indevidos. A suíte
   passou e o processo terminou com exit code 0.

3. npx tsc --noEmit

   Exit code: 0; nenhuma saída.

Checagens focadas adicionais passaram antes do fechamento:

~~~text
node scripts/check-i18n.mjs
i18n check passed: 7 locales, 15 namespaces

Test Suites: 3 passed, 3 total
Tests:       10 passed, 10 total
Snapshots:   0 total

npx tsc --noEmit
exit 0
~~~

## QA Android

O ambiente não possui adb nem emulator no PATH:

~~~text
where adb       -> exit 1 (arquivo não localizado)
where emulator  -> exit 1 (arquivo não localizado)
~~~

Por isso, npx expo run:android não foi executado. Fica pendente para QA
com emulador ou dispositivo Android disponível; não há resultado de build
nativo a declarar nesta task.

## Observações residuais de QA

O reviewer final não encontrou Critical/Important. Permanecem apenas pontos
menores para eventual QA visual/native: o componente de calendário de
terceiro ainda pode depender da configuração própria de locale para os nomes
de mês/dia, e o agrupamento histórico usa toLocaleDateString() sem locale
explícito. Nenhum desses pontos bloqueia a fundação, o checker ou os gates
automatizados desta task.
