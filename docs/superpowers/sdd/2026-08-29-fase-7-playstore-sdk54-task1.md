# Fase 7 — Expo SDK 54 — Task 1

Data: 2026-08-29  
Branch: `feat/fase-7-playstore-expo-sdk54`

## Resultado

Task 1 concluída. O projeto foi atualizado de Expo SDK 52 para SDK 54,
regenerado para Android e compilado com sucesso. O APK gerado foi:

`android/app/build/outputs/apk/debug/app-debug.apk`

O `app-debug.apk` existe e tem 201.708.746 bytes.

## Bumps de dependências

`npx expo install expo@^54` atualizou o Expo para `54.0.37`. O primeiro
`npx expo install --fix` listou e aplicou os seguintes alinhamentos SDK 54
(versões declaradas no `package.json`; os patches instalados podem ser mais
novos dentro das faixas):

- `@expo/config-plugins` `9.0.17` → `~54.0.4`
- `@expo/metro-config` `0.19.12` → `~54.0.14`
- `@expo/prebuild-config` `8.0.23` → `~54.0.8`
- `@expo/vector-icons` `14.0.4` → `^15.0.3`
- `@react-native-async-storage/async-storage` `1.23.1` → `2.2.0`
- `@react-native-picker/picker` `2.9.0` → `2.11.1`
- `expo-asset` `11.0.5` → `~12.0.13`
- `expo-crypto` `14.0.2` → `~15.0.9`
- `expo-file-system` `18.0.12` → `~19.0.24`
- `expo-font` `13.0.4` → `~14.0.12`
- `expo-linking` `7.0.5` → `~8.0.12`
- `expo-localization` `16.0.1` → `~17.0.9`
- `expo-modules-autolinking` `2.0.8` → `~3.0.22`
- `expo-router` `4.0.21` → `~6.0.24`
- `expo-secure-store` `14.0.1` → `~15.0.8`
- `expo-sharing` `13.0.1` → `~14.0.8`
- `expo-splash-screen` `0.29.24` → `~31.0.13`
- `expo-sqlite` `15.1.4` → `~16.0.10`
- `expo-status-bar` `2.0.1` → `~3.0.9`
- `expo-system-ui` `4.0.9` → `~6.0.9`
- `expo-web-browser` `14.0.2` → `~15.0.11`
- `react` `18.3.1` → `19.1.0`
- `react-dom` `18.3.1` → `19.1.0`
- `react-native` `0.76.9` → `0.81.5`
- `react-native-reanimated` `3.16.3` → `~4.1.1` (instalado `4.1.7`)
- `react-native-safe-area-context` `4.12.0` → `~5.6.0`
- `react-native-screens` `4.4.0` → `~4.16.0`
- `react-native-svg` `15.8.0` → `15.12.1`
- `react-native-web` `0.19.13` → `^0.21.0`
- `@types/jest` `30.0.0` → `29.5.14`
- `@types/react` `18.3.14` → `~19.1.10`
- `jest-expo` `52.0.6` → `~54.0.18`
- `typescript` `5.3.3` → `~5.9.2`

Além da lista do `--fix`, o build exigiu:

- `react-test-renderer` `18.3.1` → `^19.1.0`, para acompanhar React 19.
- `react-native-worklets` adicionado em `~0.8.0` (instalado `0.8.3`), peer
  obrigatório do Reanimated 4.

## Erros reais e correções

### Resolução npm durante o upgrade

O `--fix` inicialmente deixou `package.json` com versões SDK 54, mas o bloco
raiz do `package-lock.json` ainda listava versões SDK 52 e `node_modules`
continha `expo-router@4`, React 18 e RN 0.76. O npm reportou `ERESOLVE`.

Foi confirmada a causa comparando manifesto, lockfile e `npm ls`; a árvore
regenerável `node_modules` foi removida, o lockfile foi reconciliado com
`npm install --package-lock-only --ignore-scripts --legacy-peer-deps`, e a
árvore foi reinstalada. O `expo install --fix` então terminou com
`Dependencies are up to date`.

O npm revelou em seguida dois peers incompatíveis reais: `@types/react~18`
com RN 0.81, e `react-test-renderer@18` com React 19. O `--fix` atualizou o
primeiro; `react-test-renderer@19.1.0` foi alinhado para eliminar o segundo.

### Prebuild — hook WatermelonDB

Erro: `plugins/withWatermelonJsi.js:61` não encontrou o padrão antigo
`val packages = PackageList(this).packages` no novo
`MainApplication.kt` gerado pelo RN 0.81. O template agora usa
`PackageList(this).packages.apply {}`.

Correção em `plugins/withWatermelonJsi.js:61-69`: o ramo Kotlin passou a
inserir `add(WatermelonDBJSIPackage())`, ancorado em
`PackageList(this).packages.apply {`. O ramo Java e o linking Gradle foram
mantidos. O `npx expo prebuild --platform android --clean` passou depois da
correção.

### Gradle — peer nativo do Reanimated

O primeiro build falhou ao avaliar
`node_modules/react-native-reanimated/android/build.gradle:53`, com processo
Node terminando em código 1. A investigação executou os validadores usados
por esse script: `validate-react-native-version.js` passou, enquanto
`validate-worklets-build.js` reportou que `react-native-worklets` não estava
instalado.

Correção: adicionar `react-native-worklets@~0.8.0` via `expo install`. O
validador passou, o Android foi regenerado e o build seguinte compilou
WatermelonDB, BLE-PLX, Worklets e Reanimated.

### Jest — React 19 / react-test-renderer 19

Após o build, Jest começou com 141 testes passando e 10 falhando em 6
suites. A mensagem comum era `Can't access .root on unmounted test renderer`
ou `toJSON()` retornando `null`; a reprodução mostrou que os testes chamavam
`create()` fora de `act`, comportamento incompatível com o renderer React 19.

Correção: montar os renderers dentro de `act` nos testes afetados:

- `app/modais/__tests__/i18nModals.test.tsx:39`
- `app/(tabs)/__tests__/configsI18n.test.tsx:84,101,125`
- `app/__tests__/i18nResources.test.tsx:83`
- `app/__tests__/i18nSurfaces.test.tsx:132,152,171`
- `components/__tests__/task7cI18n.test.tsx:90,117`
- `components/__tests__/StyledText-test.js:8`

Nenhuma lógica de produção ou snapshot foi alterada.

## Evidência de build

Durante o Gradle, o Expo reportou os defaults do SDK 54:

```text
[ExpoRootProject] Using the following versions:
  - buildTools: 36.0.0
  - minSdk: 24
  - compileSdk: 36
  - targetSdk: 36
  - ndk: 27.1.12297006

BUILD SUCCESSFUL in 11m 6s
598 actionable tasks: 574 executed, 24 up-to-date
```

O projeto gerado confirma `newArchEnabled=true` em `app.json` e
`android/gradle.properties`. Não há referência a `expo-build-properties`, e
não há import de `expo-file-system/next`.

## Testes e typecheck

```text
Test Suites: 34 passed, 34 total
Tests:       151 passed, 151 total
Snapshots:   1 passed, 1 total
Time:        8.15 s
Ran all test suites.
```

`npx tsc --noEmit` terminou com exit code 0 e sem saída.

## Desvios

- O primeiro acesso do registry falhou com `fetch failed`; a execução foi
  repetida com a rede autorizada, sem mudança de código por causa disso.
- A inconsistência intermediária do lockfile exigiu regeneração do lock e
  reinstalação limpa de `node_modules`; isso foi necessário para concluir o
  comando prescrito, não alterou versões fora do conjunto compatível.
- Foi necessário adicionar `react-native-worklets` porque o Reanimated 4 o
  exige para compilar; e alinhar `react-test-renderer` com React 19.
- Os testes existentes que usavam `react-test-renderer` fora de `act` foram
  atualizados para o contrato do React 19. Task 2 (alinhamento 16KB,
  emulador e smoke test) não foi executada, conforme o escopo desta worker
  task.
