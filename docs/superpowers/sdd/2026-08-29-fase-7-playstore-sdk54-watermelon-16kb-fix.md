# Fase 7 — Expo SDK 54: correção do alinhamento 16KB do WatermelonDB

Data: 2026-08-29  
Branch: `feat/fase-7-playstore-expo-sdk54`  
WatermelonDB instalado: `@nozbe/watermelondb@0.28.0`

## Veredito

O blocker foi fechado. O APK final tem 22 bibliotecas `arm64-v8a` e todos os
segmentos ELF `LOAD` estão alinhados em `0x4000` (16KB), incluindo
`libwatermelondb-jsi.so`.

## Investigação da causa raiz

### Hipótese 1 — propriedades Gradle incorretas

Refutada com tarefas Gradle reais:

```text
:watermelondb-jsi:properties
compileSdkVersion: 36
targetSdkVersion: 36
minSdkVersion: 24
buildToolsVersion: 36.0.0
ndkVersion: 27.1.12297006

:app:properties
compileSdkVersion: 36
targetSdkVersion: 36
minSdkVersion: 24
buildToolsVersion: 36.0.0
ndkVersion: 27.1.12297006
```

O `assembleDebug --info` do módulo também confirmou:

```text
android.ndkVersion from module build.gradle is [27.1.12297006]
Platform version: 24
```

Logo, as propriedades condicionais do módulo estavam resolvendo os mesmos
valores do app. O `Platform version: 24` é o `ANDROID_PLATFORM` derivado do
`minSdk`, não um compile/target SDK incorreto.

### Hipótese 2 — flag de página ausente no CMake isolado

Confirmada. Antes da correção, o build limpo do módulo usou a NDK correta, mas
o `CMakeCache.txt` não continha `ANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES` e o
`CMAKE_SHARED_LINKER_FLAGS` estava vazio. O `llvm-readelf` reproduziu o
blocker:

```text
libwatermelondb-jsi.so
LOAD ... R E 0x1000
LOAD ... RW  0x1000
LOAD ... RW  0x1000
```

A NDK 27.1.12297006 implementa a opção em
`build/cmake/flags.cmake`: quando `ANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES` está
ativo para `arm64-v8a`/`x86_64`, ela adiciona
`-Wl,-z,max-page-size=16384` aos flags do linker. A mesma lógica aparece em
`android-legacy.toolchain.cmake`.

A comparação com os módulos que já passavam confirmou o mecanismo: tanto
`react-native-reanimated/android/build.gradle` quanto
`react-native-worklets/android/build.gradle` passam explicitamente:

```text
-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON
```

Embora seus `CMakeLists.txt` não contenham a flag de linker, o argumento chega
ao toolchain da NDK. O WatermelonDB era o único módulo CMake isolado sem esse
argumento.

## Correção aplicada

Foi adicionado o argumento no `externalNativeBuild` do módulo WatermelonDB.
O patch versionado contém exatamente este diff:

```diff
diff --git a/node_modules/@nozbe/watermelondb/native/android-jsi/build.gradle b/node_modules/@nozbe/watermelondb/native/android-jsi/build.gradle
@@
             cmake {
+                arguments "-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON"
                 // Not sure if this is necessary...
```

Persistência adicionada ao projeto:

- `patch-package@8.0.1` em `devDependencies`;
- `"postinstall": "patch-package"` em `package.json`;
- `patches/@nozbe+watermelondb+0.28.0.patch`.

`npm install` foi executado novamente e aplicou o patch via script real:

```text
> tozzoburger@1.0.0 postinstall
> patch-package
Applying patches...
@nozbe/watermelondb@0.28.0 ✔
```

## Teste causal mínimo

Com somente a linha acima aplicada, o novo CMake registrou:

```text
ANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES:UNINITIALIZED=ON
LINK_FLAGS = -static-libstdc++ -Wl,-z,max-page-size=16384 ...
```

E o `llvm-readelf` do `.so` reconstruído mostrou:

```text
LOAD ... R E 0x4000
LOAD ... RW  0x4000
LOAD ... RW  0x4000
```

Isso confirma que a correção atua na causa — a configuração do toolchain — e
não é pós-processamento ou mascaramento do ELF.

## Validação do APK final

Com o patch aplicado, foi executado exatamente:

```text
cd android
./gradlew.bat assembleDebug --console=plain
```

Resultado: `BUILD SUCCESSFUL in 51s`, usando buildTools `36.0.0`, compile/target
SDK `36` e NDK `27.1.12297006`.

O APK `android/app/build/outputs/apk/debug/app-debug.apk` foi extraído e
inspecionado com:

```text
C:\Users\lipoi\AppData\Local\Android\Sdk\ndk\27.1.12297006\toolchains\llvm\prebuilt\windows-x86_64\bin\llvm-readelf.exe -l
```

Resultado real: `library_count=22`; todos os segmentos `LOAD` das 22
bibliotecas abaixo terminaram em `0x4000`:

| Biblioteca | Segmentos `LOAD` |
|---|---|
| `libappmodules.so` | `0x4000`, `0x4000`, `0x4000` |
| `libc++_shared.so` | `0x4000` × 4 |
| `libexpo-modules-core.so` | `0x4000` × 3 |
| `libexpo-sqlite.so` | `0x4000` × 3 |
| `libfbjni.so` | `0x4000` × 3 |
| `libgifimage.so` | `0x4000` × 3 |
| `libhermes.so` | `0x4000` × 3 |
| `libhermestooling.so` | `0x4000` × 3 |
| `libimagepipeline.so` | `0x4000` × 3 |
| `libjsi.so` | `0x4000` × 3 |
| `libnative-filters.so` | `0x4000` × 3 |
| `libnative-imagetranscoder.so` | `0x4000` × 3 |
| `libreact_codegen_rnpicker.so` | `0x4000` × 3 |
| `libreact_codegen_rnscreens.so` | `0x4000` × 3 |
| `libreact_codegen_rnsvg.so` | `0x4000` × 3 |
| `libreact_codegen_safeareacontext.so` | `0x4000` × 3 |
| `libreactnative.so` | `0x4000` × 3 |
| `libreanimated.so` | `0x4000` × 3 |
| `librnscreens.so` | `0x4000` × 3 |
| `libstatic-webp.so` | `0x4000` × 3 |
| `libwatermelondb-jsi.so` | `0x4000`, `0x4000`, `0x4000` |
| `libworklets.so` | `0x4000` × 3 |

## Jest e TypeScript

Comando obrigatório:

```text
npx jest --watchAll=false --runInBand
```

A execução concluiu todos os testes como passados:

```text
Test Suites: 34 passed, 34 total
Tests:       151 passed, 151 total
Snapshots:   1 passed, 1 total
```

O processo literal retornou código 1 por mensagens assíncronas de console
após o encerramento dos testes (`VirtualizedList`/mocks BLE), sem suíte ou
teste falho. A repetição da mesma suíte com `--silent` retornou código 0 e
confirmou novamente `34 passed`, `151 passed` e `1 passed` snapshot.

TypeScript:

```text
npx tsc --noEmit
exit 0, sem saída
```

Nenhum arquivo de spec/plano existente foi alterado. O único artefato novo de
documentação desta fix wave é este relatório.
