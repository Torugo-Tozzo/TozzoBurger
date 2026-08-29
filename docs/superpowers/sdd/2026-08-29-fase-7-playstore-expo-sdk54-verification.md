# Fase 7 — Expo SDK 54 — Task 2: verificação

Data: 2026-08-29
Branch: `feat/fase-7-playstore-expo-sdk54`
Commit consumido: `7938179`

## 1. Artefato e build

O branch confirmado foi `feat/fase-7-playstore-expo-sdk54`. O APK usado foi:

`android/app/build/outputs/apk/debug/app-debug.apk`

Tamanho: 201.708.746 bytes.

O build foi reexecutado antes da inspeção e novamente na validação final:

```text
BUILD SUCCESSFUL in 19s
compileSdk: 36
targetSdk: 36
ndk: 27.1.12297006
```

A NDK confirmada e usada pelo `llvm-readelf` foi:

`C:\Users\lipoi\AppData\Local\Android\Sdk\ndk\27.1.12297006`

## 2. Alinhamento ELF 16KB

Foram extraídas as bibliotecas `lib/arm64-v8a/*.so` do APK e inspecionados
todos os segmentos `LOAD` com:

`C:\Users\lipoi\AppData\Local\Android\Sdk\ndk\27.1.12297006\toolchains\llvm\prebuilt\windows-x86_64\bin\llvm-readelf.exe -l`

| Biblioteca | Alinhamento dos segmentos `LOAD` | Resultado |
|---|---:|---|
| `libappmodules.so` | `0x4000`, `0x4000`, `0x4000` | OK |
| `libc++_shared.so` | `0x4000`, `0x4000`, `0x4000`, `0x4000` | OK |
| `libexpo-modules-core.so` | `0x4000`, `0x4000`, `0x4000` | OK |
| `libexpo-sqlite.so` | `0x4000`, `0x4000`, `0x4000` | OK |
| `libfbjni.so` | `0x4000`, `0x4000`, `0x4000` | OK |
| `libgifimage.so` | `0x4000`, `0x4000`, `0x4000` | OK |
| `libhermes.so` | `0x4000`, `0x4000`, `0x4000` | OK |
| `libhermestooling.so` | `0x4000`, `0x4000`, `0x4000` | OK |
| `libimagepipeline.so` | `0x4000`, `0x4000`, `0x4000` | OK |
| `libjsi.so` | `0x4000`, `0x4000`, `0x4000` | OK |
| `libnative-filters.so` | `0x4000`, `0x4000`, `0x4000` | OK |
| `libnative-imagetranscoder.so` | `0x4000`, `0x4000`, `0x4000` | OK |
| `libreact_codegen_rnpicker.so` | `0x4000`, `0x4000`, `0x4000` | OK |
| `libreact_codegen_rnscreens.so` | `0x4000`, `0x4000`, `0x4000` | OK |
| `libreact_codegen_rnsvg.so` | `0x4000`, `0x4000`, `0x4000` | OK |
| `libreact_codegen_safeareacontext.so` | `0x4000`, `0x4000`, `0x4000` | OK |
| `libreactnative.so` | `0x4000`, `0x4000`, `0x4000` | OK |
| `libreanimated.so` | `0x4000`, `0x4000`, `0x4000` | OK |
| `librnscreens.so` | `0x4000`, `0x4000`, `0x4000` | OK |
| `libstatic-webp.so` | `0x4000`, `0x4000`, `0x4000` | OK |
| `libwatermelondb-jsi.so` | `0x1000`, `0x1000`, `0x1000` | **BLOCKER** |
| `libworklets.so` | `0x4000`, `0x4000`, `0x4000` | OK |

Resultado: 21 de 22 bibliotecas estão alinhadas em 16KB. A biblioteca
`libwatermelondb-jsi.so`, módulo nativo próprio usado pelo app, permanece
alinhada em 4KB em todos os três segmentos `LOAD`. Isso viola o critério do
plano; não foi aplicado nenhum patch ou pós-processamento para mascarar o
resultado.

## 3. Emulador e instalação

O AVD `Pixel_8_Pro` foi iniciado e o boot foi aguardado por polling de
`sys.boot_completed` até retornar `1`.

```text
ro.build.version.release = 16
ro.build.version.sdk = 36
```

O APK foi instalado com `adb install -r` e a atividade confirmada em
foreground:

`com.torugotozzo.TozzoUk/.MainActivity`

Para o APK debug, o Metro foi iniciado em `localhost:8081` e foi configurado
`adb reverse tcp:8081 tcp:8081`. A primeira captura sem Metro exibiu o erro
esperado de debug “Unable to load script”; após a disponibilidade do Metro o
bundle carregou normalmente. O servidor API local definido no `.env`
(`10.0.2.2:3001`) não estava ativo, então foi usado um mock temporário,
apenas para autenticação/sync do smoke test, retornando usuário OWNER e dados
vazios. Nenhum arquivo de produção foi alterado.

## 4. Smoke test visual

Sem display ao vivo disponível, cada estado foi capturado com
`adb exec-out screencap -p` e inspecionado. As capturas estão em
[`evidence/sdk54-smoke`](evidence/sdk54-smoke).

1. **Orders:** passou. Header “Orders” abaixo da barra de status, estado vazio
   renderizado e sem clipping. [Screenshot](evidence/sdk54-smoke/02-orders.png)
2. **Products/Catalog:** passou. Busca, filtros, botão `+` e estado vazio
   renderizados; conteúdo não invade barras do sistema.
   [Screenshot](evidence/sdk54-smoke/03-products.png)
3. **History/Sales:** passou. Seções “On this device”/“Establishment”, filtro,
   total e estado vazio renderizados sem clipping.
   [Screenshot](evidence/sdk54-smoke/04-history.png)
4. **Settings:** passou. Account, Language, Printer e versão visíveis; header
   e conteúdo respeitam as áreas seguras.
   [Screenshot](evidence/sdk54-smoke/05-settings.png)
5. **Tab bar:** passou nas quatro telas capturadas e na tela inicial. Os cinco
   ícones/labels estão separados, e a barra termina acima do gesto inferior;
   não há sobreposição com o gesture handle.
   [Screenshot](evidence/sdk54-smoke/02-orders.png)
6. **Modal:** passou. O modal de cadastro de produto abriu com back button,
   título, campos e `Save`; nenhum elemento foi cortado no topo ou rodapé.
   [Screenshot](evidence/sdk54-smoke/06-product-modal.png)
7. **Bluetooth:** passou o vínculo funcional disponível no emulador. O scan
   exibiu o prompt real do Android 16 para dispositivos próximos; após
   `Allow`, `BluetoothLeScanner` registrou o scanner e o app mostrou o estado
   esperado “No printers found / Is Bluetooth turned on?”. Não havia impressora
   BLE emulada para testar conexão efetiva.
   [Prompt](evidence/sdk54-smoke/07-bluetooth-flow.png) ·
   [resultado do scan](evidence/sdk54-smoke/08-bluetooth-device-list.png)

Não foi encontrada quebra visual de safe area e nenhum arquivo de tela foi
alterado nesta Task 2.

## 5. Validação final

Executados novamente após o smoke test:

```text
Test Suites: 34 passed, 34 total
Tests:       151 passed, 151 total
Snapshots:   1 passed, 1 total
Ran all test suites.

npx tsc --noEmit: exit 0, sem saída
```

## Veredito

**BLOQUEADO — não está pronto para o controller considerar merge.**

O blocker específico é `libwatermelondb-jsi.so`, que ainda possui segmentos
ELF `LOAD` alinhados em `0x1000` (4KB), enquanto o requisito é `0x4000`
(16KB). As demais 21 bibliotecas arm64-v8a passaram, o emulador está em
Android 16/API 36, o smoke test visual/funcional passou nos estados
disponíveis e a validação Jest/TypeScript está verde; porém o critério de
alinhamento do plano não está satisfeito.
