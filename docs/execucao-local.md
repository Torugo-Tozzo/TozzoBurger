# Execução local do mobile

Este é o fluxo usado para testar o app Android contra a API local no emulador `Pixel_8_Pro`.

## Terminal 1 — API

```powershell
cd C:\RN\api\api-tozzo.uk
bun run dev
```

A API fica na porta `3001`.

## Configuração do mobile

Em `C:\RN\TozzoBurger\.env`:

```env
EXPO_PUBLIC_API_URL=http://10.0.2.2:3001
```

`10.0.2.2` é o endereço do host visto pelo Android Emulator. Não usar `localhost` no app.

## Terminal 2 — emulador e app

Com o SDK já configurado na sessão:

```powershell
cd C:\RN\TozzoBurger
& "$env:ANDROID_HOME\emulator\emulator.exe" -avd Pixel_8_Pro
```

Se `ANDROID_HOME` não estiver disponível, o caminho conhecido nesta máquina é:

```powershell
& "C:\Users\lipoi\AppData\Local\Android\Sdk\emulator\emulator.exe" -avd Pixel_8_Pro
```

Aguardar o boot e confirmar o dispositivo:

```powershell
adb devices
```

O resultado esperado contém `emulator-5554    device`. Depois, na pasta do app:

```powershell
npx expo run:android
```

Esse comando faz o build nativo, instala o APK e abre o app no emulador. `npx expo start` sozinho não substitui essa validação.

### Fallback pelo cmd

Ao definir as variáveis pelo `cmd`, usar a forma com aspas abaixo. Sem as aspas, o `set` pode deixar um espaço no final de `ANDROID_HOME` e o Gradle falha com `Trailing char` ao ler o caminho do SDK.

```cmd
set "ANDROID_HOME=C:\Users\lipoi\AppData\Local\Android\Sdk" && set "PATH=%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\emulator;%PATH%" && npx expo run:android
```

Para verificar a API enquanto ela estiver rodando:

```powershell
netstat -ano | Select-String ':3001'
```
