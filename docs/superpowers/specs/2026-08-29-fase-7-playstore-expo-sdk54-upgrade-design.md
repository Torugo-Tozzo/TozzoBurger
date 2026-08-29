# Fase 7 — Sub-parte Play Store — Upgrade Expo SDK 52→54 (target API 36 + 16KB) — Design

Data: 2026-08-29
Status: aprovado pelo usuário via brainstorm (spike técnico feito antes), pronto para plano de implementação.

## Objetivo

Colocar o app mobile em condição técnica de ser submetido à Play Store:
`targetSdkVersion`/`compileSdkVersion` 36 (Android 16, obrigatório pra
qualquer app novo/atualizado a partir de 31/08/2026) e suporte a native
libraries alinhadas em 16KB page size (exigência já vigente desde
31/05/2026, sem app publicado ainda pra violar, mas bloqueia qualquer
submissão nova).

Este é o único item de engenharia real da sub-parte Play Store da Fase 7
(ver `plano.md`) — o resto do checklist (12 testers, Data Safety,
classificação de conteúdo, ficha da loja) é trabalho manual do usuário no
Play Console, fora do escopo deste spec/plano.

## Contexto confirmado (spike técnico já executado, 2026-08-29)

- App atual: Expo SDK 52.0.47 (React Native 0.76.9), `newArchEnabled: true`
  já ligado, `minSdkVersion` 24.
- Módulos nativos reais no app: `@nozbe/watermelondb@^0.28.0` (plugin JSI
  custom, `plugins/withWatermelonJsi.js`, gera `libwatermelondb-jsi.so`) e
  `react-native-ble-plx@^3.2.1` (Bluetooth — **confirmado no spike**: não
  gera nenhum `.so`, é Java/Kotlin puro, zero risco de alinhamento).
- **Spike 1** (bump isolado de target/compile SDK via `expo-build-properties`,
  sem tocar Expo SDK): build local (`./gradlew assembleDebug`) passou de
  primeira, `BUILD SUCCESSFUL`. Confirma que o bump de target/compile
  sozinho não quebra nada — mas não resolve 16KB (ver spike 2).
- **Spike 2** (inspeção real do APK com `llvm-readelf` da NDK, todos os
  `.so` extraídos): `libwatermelondb-jsi.so`, `libreactnative.so`,
  `libhermes.so` e `libappmodules.so` — todos os `LOAD` segments alinhados
  em `0x1000` (4KB), nenhum em `0x4000` (16KB). NDK instalada era 26.1
  (suporte automático a 16KB só vem a partir de NDK r28+).
- **Spike 3** (troca isolada de NDK 26→29, sem tocar Expo SDK): **build
  quebrou**. `react-native-reanimated@3.16.3` (pinado por este Expo SDK,
  puxado transitivamente por `expo-router`, sem uso direto no código do
  app) não compila com o Clang mais novo da NDK 29 — erro fatal de
  `-Werror -Wdeprecated-this-capture` (captura implícita de `this` em
  lambda `[=]`, código-fonte do próprio pacote `reanimated`, fora do nosso
  controle). Confirma: não dá pra resolver 16KB isolado, trocando só a NDK
  — precisa de versão mais nova de `reanimated` (e possivelmente outras
  deps nativas) compatível com toolchain mais novo.
- Pesquisa confirma **Expo SDK 54** (React Native 0.81, estável desde
  10/09/2025) é a versão que resolve os dois problemas juntos: target/
  compile SDK 36 por padrão, e `reanimated` pode subir pra v4.1.1
  (compatível com NDK novo/16KB). SDK 54 também **força edge-to-edge**
  (sem opt-out) e liga **predictive back gesture** por padrão em projeto
  novo — mudanças de comportamento que podem quebrar layout visualmente.
- NDK r29 (`29.0.14206865`) já foi baixada e instalada nesta máquina
  (`C:\Users\lipoi\AppData\Local\Android\Sdk\ndk\29.0.14206865`) durante o
  spike — fica disponível pra reuso no upgrade real, não precisa baixar de
  novo.
- Nenhum arquivo do app importa `react-native-reanimated` diretamente
  (confirmado via grep) — só chega via `expo-router` (tab bar). Reduz risco
  de quebra de lógica própria com a mudança de major version (v3→v4).

## Decisões do brainstorm

1. **Caminho do upgrade**: direto de SDK 52 para SDK 54 (pula o 53) — é a
   versão que resolve os dois problemas juntos, Expo documenta upgrade
   multi-versão como suportado.
2. **Mecanismo**: `npx expo install expo@^54` seguido de
   `npx expo install --fix` — deixa o Expo resolver as versões compatíveis
   de todas as dependências (incluindo `reanimated` 3→4, `expo-router`,
   `expo-sqlite`, `expo-secure-store`, `expo-localization`), em vez de
   fixar versões manualmente uma por uma.
3. **Sem `expo-build-properties`**: SDK 54 já traz target/compile SDK 36 e
   toolchain (NDK/AGP) compatível com 16KB por padrão — não precisa mais do
   override manual usado nos spikes.
4. **Escopo de QA pós-upgrade**: smoke test focado, não auditoria completa
   — build real no emulador Android 16 (`Pixel_8_Pro` já existe), passar
   pelas 4 telas principais (pedidos/produtos/histórico/configurações) +
   tab bar + 1 modal + fluxo de Bluetooth (conectar impressora). Corrigir
   só quebra visível de layout (header/tab bar colidindo com barra de
   status/gesto do sistema), não uma revisão tela-por-tela completa.
5. **Verificação de 16KB não é opcional**: depois do upgrade, repetir a
   inspeção real do APK com `llvm-readelf` (mesmo procedimento do spike 2)
   pra confirmar que os `.so` agora estão alinhados em `0x4000` — não
   assumir pelo changelog do Expo, confirmar de verdade no artefato
   gerado por este projeto específico.

## Escopo técnico

### Mobile (`TozzoBurger`)

- `npx expo install expo@^54` + `npx expo install --fix`.
- Confirmar `app.json`: `newArchEnabled: true` mantido (já é o padrão,
  SDK 54 exige nova arquitetura de qualquer forma — se o campo virar
  redundante/removido pelo Expo, tudo bem, só não pode regredir pra
  `false`).
- Checar uso de `expo-file-system/next` no código (import path mudou pra
  `expo-file-system` estável no SDK 54) — ajustar se encontrado.
- Rebuild nativo real (`npx expo prebuild --platform android --clean` +
  `npx expo run:android` ou `./gradlew assembleDebug`), corrigindo
  qualquer erro de compilação que aparecer (esperado: pode haver mais
  breaking changes além do que os 3 spikes já mapearam — este é um
  upgrade real, não só os pontos já conhecidos).
- Smoke test no emulador Android 16, conforme decisão 4 do brainstorm.
- Inspeção de 16KB alignment nos `.so` do APK gerado, conforme decisão 5.
- Suíte Jest completa + `tsc --noEmit` limpos.

### Fora de escopo

- `expo-build-properties` — não é mais necessário com SDK 54 (motivo:
  decisão 3).
- Qualquer mudança em `WatermelonDB`/`react-native-ble-plx` além de
  confirmar que continuam buildando — não são geridos pelo Expo, não fazem
  parte do `expo install --fix`, mas não são o alvo desta fase (só
  precisam continuar funcionando).
- Auditoria completa de UI/edge-to-edge tela-por-tela (decisão 4 —
  smoke test focado, não auditoria completa).
- iOS — projeto não tem build iOS ativo nesta fase, fora de escopo.
- Restante do checklist Play Store (testers, Data Safety, classificação de
  conteúdo, ficha da loja) — trabalho manual do usuário, sem relação com
  este spec.

## Testes

- Suíte Jest completa (`npx jest --watchAll=false --runInBand`) — mesmo
  padrão já usado no projeto, sem novos testes automatizados específicos
  pra este upgrade (é infraestrutura/build, não lógica de produto nova).
- `npx tsc --noEmit` limpo.
- Build Android real (`npx expo run:android` ou `./gradlew assembleDebug`)
  com evidência de sucesso.
- Inspeção real de 16KB alignment via `llvm-readelf -l` nos `.so`
  extraídos do APK gerado (mesmo procedimento dos spikes) — critério de
  aceite explícito: todos os `LOAD` segments com alinhamento `0x4000`.
- Smoke test manual no emulador Android 16 (`Pixel_8_Pro`), roteiro da
  decisão 4.

## Riscos conhecidos, não resolvidos por este spec (registrar, não bloquear)

- Podem existir breaking changes do RN 0.76→0.81 além dos já mapeados nos
  3 spikes (que só testaram target-SDK e NDK isolados, não o upgrade real
  de Expo SDK) — o plano de implementação deve prever espaço real pra
  corrigir erro de compilação/runtime não previsto aqui, não assumir que a
  lista de riscos deste spec é exaustiva.
- Edge-to-edge forçado pode exigir mais ajuste visual do que o smoke test
  focado descobre — se sobrar quebra visual não capturada no smoke test,
  vira achado pra fase de QA combinada (T12 do bloco técnico + LGPD +
  Play Store) que já está registrada como pendente no `plano.md`.
