# Play Store — Expo SDK 52→54 Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade TozzoBurger from Expo SDK 52 to SDK 54 so the app builds against Android API 36 (target/compile) with 16KB-page-aligned native libraries, both required before any Play Store submission.

**Architecture:** This is an infrastructure/build upgrade, not new product code — there is no fixed diff to prescribe up front, because the real compile/runtime errors only surface once the upgrade actually runs. The plan gives exact commands and exact acceptance criteria for two gates: (1) the app builds successfully on SDK 54, (2) the built artifact is verified 16KB-compliant and passes a real smoke test. Fixing whatever breaks along the way is the expected content of Task 1 — investigate the real error, fix it in the real file, keep going, exactly like `systematic-debugging` would apply to a build failure.

**Tech Stack:** Expo SDK, React Native, Gradle/AGP/NDK (Android native build toolchain), Jest, TypeScript.

**Spec:** `C:/RN/TozzoBurger/docs/superpowers/specs/2026-08-29-fase-7-playstore-expo-sdk54-upgrade-design.md`

## Global Constraints

- Target Expo SDK version: **54** (not 53, not later than 54) — the version confirmed by research to default to target/compile SDK 36 and support `react-native-reanimated` 4.1.1 (16KB-compatible).
- No `expo-build-properties` — SDK 54's own defaults already provide target/compile 36 and a 16KB-compatible toolchain; do not reintroduce the plugin from the spike.
- `newArchEnabled: true` in `app.json` must remain `true` (or be removed only if SDK 54 makes it the unconditional default — never regress it to `false`).
- iOS is out of scope — do not touch `ios/` or iOS-specific config.
- Never push, open a PR, or merge to `dev`/`main` from inside a task.
- Android SDK tooling already confirmed working on this machine this session: `ANDROID_HOME=C:\Users\lipoi\AppData\Local\Android\Sdk`, `platform-tools`/`emulator` present but not on `PATH` by default — add them to `PATH` for the session (`export PATH="$PATH:/c/Users/lipoi/AppData/Local/Android/Sdk/platform-tools:/c/Users/lipoi/AppData/Local/Android/Sdk/emulator"` in Git Bash). NDK r29 (`29.0.14206865`) is already downloaded and installed at `C:\Users\lipoi\AppData\Local\Android\Sdk\ndk\29.0.14206865` from an earlier spike — reuse it, don't re-download. AVD `Pixel_8_Pro` already exists.

---

## Task 1: Run the upgrade and get a real Android build passing

**Files:**
- Modify: `package.json`, `package-lock.json` (via `npx expo install`)
- Modify: `app.json` (only if SDK 54's upgrade tooling itself changes it — do not hand-edit unless a real build error requires it)
- Modify: any application source file that a real compile/type error points to (cannot be enumerated in advance — see Step 4)

**Interfaces:**
- Produces: a working `android/` native project generated against Expo SDK 54, and a successful `app-debug.apk` build. Task 2 consumes this APK and the upgraded `node_modules` tree — do not skip ahead to Task 2 until this task's final build genuinely succeeds.
- Consumes: nothing from another task in this plan (first task).

### Step-by-step

- [ ] **Step 1: Confirm starting state**

Run: `git branch --show-current` and `git status --short` in `C:/RN/TozzoBurger`.
Expected: on `dev` (or whatever branch the controller told you to use), clean except pre-existing untracked `docs/superpowers/sdd/*.md` files. If dirty with anything else, stop and report — do not proceed on unexpected uncommitted state.

Create a working branch: `git checkout -b feat/fase-7-playstore-expo-sdk54`.

- [ ] **Step 2: Run the upgrade**

Run:
```bash
npx expo install expo@^54
npx expo install --fix
```

Expected: both commands exit 0. Read their output — `expo install --fix` will list every package it bumped (expect `react-native`, `react-native-reanimated`, `expo-router`, `expo-sqlite`, `expo-secure-store`, `expo-localization`, and others). This is expected and correct; do not manually revert any of these version bumps.

- [ ] **Step 3: Regenerate the native Android project**

Run: `npx expo prebuild --platform android --clean`
Expected: exits 0, regenerates `android/`.

Check `android/gradle.properties` for `android.compileSdkVersion`/`android.targetSdkVersion` (or `android/build.gradle` if SDK 54 changed where these live):
Run: `grep -n "compileSdkVersion\|targetSdkVersion\|ndkVersion" android/build.gradle android/gradle.properties`
Expected: `compileSdkVersion`/`targetSdkVersion` resolve to `36` (whether hardcoded or via a default that you confirm resolves to 36 — if it does not, this is a real finding to report, not something to force via `expo-build-properties`, which is explicitly out of scope per Global Constraints).

- [ ] **Step 4: Build, and fix whatever breaks**

Add the Android tooling to `PATH` first (see Global Constraints for the exact command), then:

Run: `cd android && ./gradlew.bat assembleDebug --console=plain`

If it fails, read the actual error (Gradle/CMake/Kotlin/TypeScript compiler output — the real message, not a guess). Common categories to expect, based on this project's spike findings and SDK 54's known changes, but treat this as a starting hypothesis list, not an exhaustive one:
- A native module (`@nozbe/watermelondb`'s JSI plugin in `plugins/withWatermelonJsi.js`, or `react-native-ble-plx`) failing to compile against the new NDK/AGP — read the compiler error, it will name the exact file and line.
- `expo-file-system/next` import paths, if any exist in this codebase — check with `grep -rn "expo-file-system/next" app components database services hooks` and update to the stable `expo-file-system` import if found.
- TypeScript type errors from bumped `@types/*` or Expo/RN API surface changes — run `npx tsc --noEmit` separately if the Gradle error is TS-related, to get a clearer error list.

Fix the real file the error points to, re-run `./gradlew.bat assembleDebug --console=plain`, repeat until it succeeds. This is expected to take multiple iterations — that is the actual content of this task, not a sign something is wrong with the plan.

Expected final state: `BUILD SUCCESSFUL` from Gradle, with `android/app/build/outputs/apk/debug/app-debug.apk` present on disk.

- [ ] **Step 5: Run the full test suite and typecheck**

Run:
```bash
npx jest --watchAll=false --runInBand
npx tsc --noEmit
```
Expected: same pass count as before the upgrade (150+ tests, see the repo's own last-known-good count by running this on the branch you started from if unsure) or higher — never lower. Fix any regression the same way as Step 4: read the real failure, fix the real cause.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: upgrade Expo SDK 52 to 54 (target API 36 + 16KB alignment prerequisite)"
```

(`git add -A` is appropriate here specifically because this task's changes are inherently broad — dependency bumps across `package.json`/`package-lock.json` plus whatever source files needed fixing — but first run `git status` and eyeball the file list to make sure nothing unexpected/unrelated got swept in, per the project's own safety conventions.)

---

## Task 2: Verify 16KB alignment, smoke test, close the loop

**Files:**
- Create: `TozzoBurger/docs/superpowers/sdd/2026-08-29-fase-7-playstore-expo-sdk54-verification.md`
- No source file changes expected in this task unless the smoke test finds a real visual break (see Step 4) — if it does, modify whatever screen/component file the break is actually in.

**Interfaces:**
- Consumes: the `app-debug.apk` and passing build/test state produced by Task 1. Do not start this task until Task 1's build and suite are genuinely green.
- Produces: the verification report used by the controller to update `plano.md` and decide on merge.

### Step-by-step

- [ ] **Step 1: Confirm the branch and build artifact**

Run: `git branch --show-current` — expect `feat/fase-7-playstore-expo-sdk54` (from Task 1). If the APK from Task 1 is stale (older than the last commit), rebuild it first: `cd android && ./gradlew.bat assembleDebug --console=plain`.

- [ ] **Step 2: Extract and inspect the native libraries for 16KB alignment**

```bash
APK="android/app/build/outputs/apk/debug/app-debug.apk"
mkdir -p /tmp/sdk54-apk-check
unzip -o "$APK" "lib/arm64-v8a/*" -d /tmp/sdk54-apk-check
```

Find the NDK actually referenced by this build (it may not be the r29 already installed — confirm):
```bash
grep -n "ndkVersion" android/build.gradle android/gradle.properties
```

Use `llvm-readelf` from whichever NDK version that resolves to (if it's the r29 already on this machine, it's at
`C:\Users\lipoi\AppData\Local\Android\Sdk\ndk\29.0.14206865\toolchains\llvm\prebuilt\windows-x86_64\bin\llvm-readelf.exe` — if it's a different version, find the equivalent path under `C:\Users\lipoi\AppData\Local\Android\Sdk\ndk\<that-version>\toolchains\llvm\prebuilt\windows-x86_64\bin\llvm-readelf.exe`):

```bash
READELF="<path to llvm-readelf.exe resolved above>"
for so in /tmp/sdk54-apk-check/lib/arm64-v8a/*.so; do
  echo "=== $(basename "$so") ==="
  "$READELF" -l "$so" | grep "LOAD"
done
```

Expected: every `LOAD` line's last column (alignment) reads `0x4000`, not `0x1000`. Pay specific attention to `libwatermelondb-jsi.so` (this app's own native module) and `libreactnative.so`/`libhermes.so`/`libappmodules.so` (the ones the spike found non-compliant on SDK 52). If any `.so` is still `0x1000`-aligned, this is a real finding — do not mark this task done; report it as a blocker (name the specific library) rather than silently accepting it.

- [ ] **Step 3: Boot the emulator and install the build**

```bash
export PATH="$PATH:/c/Users/lipoi/AppData/Local/Android/Sdk/platform-tools:/c/Users/lipoi/AppData/Local/Android/Sdk/emulator"
emulator -avd Pixel_8_Pro -no-snapshot-load &
```
Wait for boot (`adb wait-for-device`, then poll `adb shell getprop sys.boot_completed` until it returns `1` — don't just sleep a fixed guess).

Confirm it's actually running Android 16 (API 36), since that's the whole point of this check:
```bash
adb shell getprop ro.build.version.release
adb shell getprop ro.build.version.sdk
```
Expected: SDK level `36`. If the existing `Pixel_8_Pro` AVD is on an older system image, this is a real finding — report it (the emulator itself may need a system-image update to actually validate against Android 16, separate from the app's own target-SDK bump).

Install and launch:
```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.torugotozzo.TozzoUk/.MainActivity
```

- [ ] **Step 4: Smoke test — 4 main screens + tab bar + 1 modal + Bluetooth flow**

Manually exercise, using `adb shell input` taps/screenshots or (preferably) actual visual inspection if a display is available in this environment:
1. Orders screen (`pedidos` tab) — loads without crash, list renders, status colors/layout not clipped by the status bar or gesture nav bar.
2. Products screen (`produtos` tab) — same checks.
3. History screen (`historico` tab) — same checks.
4. Settings screen (`configs` tab) — same checks.
5. Tab bar itself — icons/labels not overlapped by the system gesture handle at the bottom (this is the exact edge-to-edge risk called out in the spec).
6. Open at least one modal (e.g. the order detail modal) — confirm it doesn't render behind the status bar or get clipped by the notch/safe area.
7. Bluetooth printer flow — open the printer connection screen, confirm the permission prompt and device list still work (BLE-PLX has no native `.so`, so this is really testing that the Kotlin/Java module still links correctly post-upgrade, not alignment).

For each item, if something is visibly broken (header tucked under the status bar, tab bar overlapping the gesture handle, modal content clipped), fix it in the real component file (likely a `SafeAreaView`/`useSafeAreaInsets` padding adjustment given SDK 54's forced edge-to-edge) and re-test that specific screen. Do not attempt a full design pass — only fix what's actually visibly broken, per the spec's "smoke test focado" decision.

- [ ] **Step 5: Final validation and report**

Run once more, fresh, after any Step 4 fixes:
```bash
npx jest --watchAll=false --runInBand
npx tsc --noEmit
```
Expected: same pass count as Task 1's Step 5 (or higher).

Write `TozzoBurger/docs/superpowers/sdd/2026-08-29-fase-7-playstore-expo-sdk54-verification.md` covering: the 16KB alignment result per `.so` file (Step 2), the emulator's actual Android version (Step 3), the smoke test results item-by-item (Step 4, including anything found broken and fixed), and the final test/typecheck evidence (this step). End with an explicit verdict: ready for the controller to consider merge, or blocked (name the specific blocker).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "docs: verify 16KB alignment and smoke test for Expo SDK 54 upgrade"
```

---

## Self-Review Notes (for the controller, not a task)

- Spec coverage: SDK 52→54 upgrade via `expo install`/`--fix` (Task 1) ✅; no `expo-build-properties` (Global Constraints, explicit) ✅; `newArchEnabled` regression guard (Global Constraints) ✅; `expo-file-system/next` check (Task 1 Step 4) ✅; 16KB verification via real `llvm-readelf` inspection, not assumption (Task 2 Step 2) ✅; smoke test scope matching the "focado, não completo" decision (Task 2 Step 4) ✅; suite/tsc validation (both tasks) ✅. iOS, `expo-build-properties`, WatermelonDB/BLE-PLX code changes, and full tela-por-tela audit are explicitly out of scope per the spec and this plan's Global Constraints.
- This plan intentionally does not prescribe exact source-code diffs for Task 1's fix work or Task 2's potential layout fixes, because the spec itself documents that the real errors are unknown until the upgrade actually runs (3 spikes only tested isolated pieces, not the real SDK 54 upgrade path). This is a deliberate deviation from the usual "exact code in every step" plan style, matching the spec's own "Riscos conhecidos, não resolvidos por este spec" section.
- Known follow-up, not part of this plan: the rest of the Play Store checklist (12 testers, Data Safety, content rating, store listing assets) is manual Play Console work for the user, tracked separately in `plano.md`/`distribuicao-mobile.md`, not a task here.
