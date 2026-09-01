# Fase 2 — Google Sign-In (Mobile) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to invoke this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Botão "Entrar com Google" em `login.tsx`, reaproveitando `POST /auth/google` e a sessão access+refresh já implementada.

**Architecture:** `@react-native-google-signin/google-signin` (nativo) — `GoogleSignin.configure({ webClientId })` no boot do app, `GoogleSignin.signIn()` devolve o ID token, mandado pro mesmo endpoint que o front usa. `AuthContext.tsx` ganha `completeGoogleLogin(idToken)`, espelhando `login()`/`completeTotpLogin()` já existentes (reaproveita `completeSession`).

**Tech Stack:** Expo Router (SDK 52) + React Native 0.76 + `@react-native-google-signin/google-signin` (novo, build nativo) + Jest/`jest-expo`.

**Spec:** `TozzoBurger/docs/superpowers/specs/2026-08-31-fase-2-google-signin-design.md`

**Depende de:** o plano de auth do mobile (`TozzoBurger/docs/superpowers/plans/2026-08-31-fase-2-auth-senha-2fa-email-mobile.md`) já executado — reaproveita `completeSession`/`LoginResult`/`ApiHttpError`.

## Global Constraints

- Pré-requisito externo: Client ID OAuth "Android" no Google Cloud Console (com o SHA-1 do keystore de assinatura usado pra build — debug **e** release, o Google exige um Client ID por SHA-1) **e** um Client ID "Web application" (o SDK do Google Sign-In no Android exige um `webClientId` mesmo rodando Android, é assim que ele pede o ID token verificável no backend). Valores em `GOOGLE_ANDROID_CLIENT_ID` (Cloud Console, não entra no app) e `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (`.env` do app, é o que `GoogleSignin.configure()` usa).
- Exige rebuild nativo (`npx expo run:android`) — `@react-native-google-signin/google-signin` não funciona em cima de um build antigo sem essa dependência, nem no Metro isolado.

---

## Task 1: `AuthContext.tsx` — `completeGoogleLogin`

**Files:**
- Modify: `services/api.ts` (`googleSignIn`), `context/AuthContext.tsx`
- Test: `services/__tests__/googleSignIn.test.ts`, estender `context/__tests__/AuthContext.test.tsx`

**Interfaces:**
- Produces: `api.googleSignIn(idToken: string): Promise<unknown>` (mesmo shape de resposta do `login()`, incluindo o branch `TOTP_REQUIRED`); `completeGoogleLogin(idToken: string): Promise<LoginResult>` no `AuthContext`.

- [ ] **Step 1: Escrever o teste de `services/api.ts`**

```ts
// services/__tests__/googleSignIn.test.ts
import { googleSignIn } from '../api';

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });

describe('googleSignIn', () => {
  it('posta o idToken e devolve accessToken/refreshToken', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify({ accessToken: 'a1', refreshToken: 'r1' }) }) as any;
    const result = await googleSignIn('google-id-token');
    expect(result.accessToken).toBe('a1');
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/auth/google'), expect.objectContaining({ body: JSON.stringify({ idToken: 'google-id-token' }) }));
  });

  it('resolve normal com code TOTP_REQUIRED', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => JSON.stringify({ code: 'TOTP_REQUIRED', challengeToken: 'c1' }) }) as any;
    const result = await googleSignIn('google-id-token');
    expect(result.code).toBe('TOTP_REQUIRED');
  });
});
```

- [ ] **Step 2: Rodar (deve falhar)**

Run: `npx jest --watchAll=false services/__tests__/googleSignIn.test.ts`
Expected: FAIL

- [ ] **Step 3: Implementar `googleSignIn` em `services/api.ts`**

```ts
export async function googleSignIn(idToken: string) {
  const url = `${BASE_URL}/auth/google`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...NGROK_HEADERS },
      body: JSON.stringify({ idToken }),
    });
    const body = await handleJsonResponse(res);
    if (!res.ok) {
      const error = new ApiHttpError(res.status, body);
      console.error('API googleSignIn error:', url, error.message);
      throw error;
    }
    return body && typeof body === 'object' ? { ...body, user: body.user ? fromLegacyUser(body.user) : body.user } : body;
  } catch (err: any) {
    if (err instanceof ApiHttpError) throw err;
    console.error('Network/googleSignIn request failed', url, err?.message ?? err);
    throw err;
  }
}
```

- [ ] **Step 4: Rodar o teste**

Run: `npx jest --watchAll=false services/__tests__/googleSignIn.test.ts`
Expected: PASS

- [ ] **Step 5: Estender `AuthContext.test.tsx`**

```tsx
it('completeGoogleLogin grava sessao apos sucesso', async () => {
  (api.googleSignIn as jest.Mock).mockResolvedValue({ accessToken: 'ga1', refreshToken: 'gr1' });
  (api.getMe as jest.Mock).mockResolvedValue({ id: 1, establishmentId: 'estab-1' });

  const { result } = renderHook(() => useAuth(), { wrapper });
  let outcome: any;
  await act(async () => { outcome = await result.current.completeGoogleLogin('id-token-1'); });

  expect(outcome).toEqual({ ok: true });
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith('tozzo_access_token_v1', 'ga1');
});

it('completeGoogleLogin com TOTP_REQUIRED retorna o challengeToken', async () => {
  (api.googleSignIn as jest.Mock).mockResolvedValue({ code: 'TOTP_REQUIRED', challengeToken: 'c1' });

  const { result } = renderHook(() => useAuth(), { wrapper });
  let outcome: any;
  await act(async () => { outcome = await result.current.completeGoogleLogin('id-token-1'); });

  expect(outcome).toEqual({ ok: false, code: 'TOTP_REQUIRED', challengeToken: 'c1' });
});
```

- [ ] **Step 6: Rodar (deve falhar), depois implementar**

Run: `npx jest --watchAll=false context/__tests__/AuthContext.test.tsx`
Expected: FAIL

Em `AuthContext.tsx`, adicionar (mesmo corpo de `login()`, só troca a chamada de API e não tem checagem de `EMAIL_NOT_VERIFIED` — Google já garante o email):

```ts
const completeGoogleLogin = async (idToken: string): Promise<LoginResult> => {
  setLoading(true);
  try {
    const body = await api.googleSignIn(idToken);

    if (body && typeof body === 'object' && (body as any).code === 'TOTP_REQUIRED') {
      return { ok: false, code: 'TOTP_REQUIRED', challengeToken: (body as any).challengeToken };
    }

    const accessToken = (body as any)?.accessToken;
    const refreshToken = (body as any)?.refreshToken;
    if (!accessToken || !refreshToken) return { ok: false };

    await completeSession(accessToken, refreshToken, setUser, setToken);
    return { ok: true };
  } catch (err: any) {
    console.warn('Google Sign-In failed', err);
    return { ok: false, code: err?.code };
  } finally {
    setLoading(false);
  }
};
```

Adicionar `completeGoogleLogin` em `AuthContextData` e no `value={{...}}` do Provider.

- [ ] **Step 7: Rodar o teste + a suíte inteira**

Run: `npx jest --watchAll=false`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add services/api.ts services/__tests__/googleSignIn.test.ts context/AuthContext.tsx context/__tests__/AuthContext.test.tsx
git commit -m "feat(auth): add completeGoogleLogin sharing the same session pipeline as password login"
```

---

## Task 2: Botão Google em `login.tsx`

**Files:**
- Modify: `app/login.tsx`, `app.json` (config), `.env.example`
- Test: `app/__tests__/login.test.tsx` (estender, criado pelo plano de auth)

**Interfaces:**
- Consumes: `@react-native-google-signin/google-signin` (novo), `completeGoogleLogin` (Task 1).

- [ ] **Step 1: Instalar a dependência**

Run: `npx expo install @react-native-google-signin/google-signin`

- [ ] **Step 2: Configurar o plugin em `app.json`**

```json
{
  "expo": {
    "plugins": [
      "@react-native-google-signin/google-signin"
    ]
  }
}
```

(adicionar ao array `plugins` já existente, sem remover os outros.)

- [ ] **Step 3: Adicionar `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` em `.env.example`**

```
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=
```

- [ ] **Step 4: Estender o teste de `login.tsx`**

```tsx
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: { configure: jest.fn(), hasPlayServices: jest.fn().mockResolvedValue(true), signIn: jest.fn() },
}));

it('Google Sign-In bem sucedido chama completeGoogleLogin com o idToken', async () => {
  const { GoogleSignin } = require('@react-native-google-signin/google-signin');
  GoogleSignin.signIn.mockResolvedValue({ data: { idToken: 'google-id-token-1' } });
  const completeGoogleLoginMock = jest.fn().mockResolvedValue({ ok: true });
  mockUseAuth.mockReturnValue({ login: jest.fn(), completeTotpLogin: jest.fn(), completeGoogleLogin: completeGoogleLoginMock });

  const { getByText } = render(<LoginScreen />);
  fireEvent.press(getByText(/entrar com google|continue with google/i));

  await waitFor(() => expect(completeGoogleLoginMock).toHaveBeenCalledWith('google-id-token-1'));
});
```

- [ ] **Step 5: Rodar (deve falhar)**

Run: `npx jest --watchAll=false "app/__tests__/login.test.tsx"`
Expected: FAIL

- [ ] **Step 6: Implementar em `login.tsx`**

Adicionar imports e configuração (fora do componente, roda 1x no import do módulo):

```tsx
import { GoogleSignin } from '@react-native-google-signin/google-signin';

GoogleSignin.configure({ webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID });
```

Dentro do componente, junto dos outros hooks: `const { login, completeTotpLogin, completeGoogleLogin } = useAuth();`

```ts
const handleGoogleSignIn = async () => {
  setLoading(true);
  try {
    await GoogleSignin.hasPlayServices();
    const result = await GoogleSignin.signIn();
    // A forma exata do retorno varia por versao do SDK (result.data.idToken nas versoes
    // recentes, result.idToken em versoes antigas) — conferir contra a versao instalada
    // pelo Step 1 antes de fechar esta task, e ajustar a extracao abaixo se necessario.
    const idToken = (result as any)?.data?.idToken ?? (result as any)?.idToken;
    if (!idToken) {
      Alert.alert(t('errors.generic'), t('auth.googleSignInFailed'));
      return;
    }

    const outcome = await completeGoogleLogin(idToken);
    if (outcome.ok) {
      console.log('Google Sign-In successful - initial sync running in background');
      return;
    }
    if (outcome.code === 'TOTP_REQUIRED' && outcome.challengeToken) {
      setChallengeToken(outcome.challengeToken);
      return;
    }
    Alert.alert(t('errors.generic'), t('auth.googleSignInFailed'));
  } catch (err) {
    console.warn('Google Sign-In error:', err);
    Alert.alert(t('errors.generic'), t('auth.googleSignInFailed'));
  } finally {
    setLoading(false);
  }
};
```

No JSX, abaixo do botão de login normal (dentro do bloco de formulário padrão, não nos blocos de `challengeToken`/`awaitingEmailVerification`):

```tsx
<Button
  title={t('auth.continueWithGoogle')}
  accessibilityLabel={t('auth.continueWithGoogle')}
  onPress={handleGoogleSignIn}
  loading={loading}
  disabled={loading}
  style={styles.linkButton}
/>
```

- [ ] **Step 7: Adicionar as chaves de i18n (`auth.continueWithGoogle`) — conferir o(s) arquivo(s) de locale do mobile e adicionar nos idiomas suportados**

Texto de referência (português): `"Continuar com Google"`.

- [ ] **Step 8: Rodar os testes**

Run: `npx jest --watchAll=false`
Expected: PASS

- [ ] **Step 9: Build Android real e QA manual**

Run: `npx expo run:android`
QA manual: login com Google numa conta FUNCIONARIO já criada por email pelo dono (deve linkar), login numa conta nova (deve virar DONO de estabelecimento novo — mas testar isso no mobile é incomum, o fluxo esperado de verdade é sempre criar pelo web; confirmar que pelo menos não quebra).

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json app.json app/login.tsx "app/__tests__/login.test.tsx" .env.example
git commit -m "feat(auth): add Google Sign-In button to mobile login screen"
```

---

## Task 3: Revisão final + `plano.md`

- [ ] **Step 1: Rodar a suíte completa + `tsc`**

Run: `npx jest --watchAll=false && npx tsc --noEmit`
Expected: tudo verde.

- [ ] **Step 2: Atualizar `C:\RN\plano.md`**

Marcar que o plano de implementação do mobile (Google Sign-In) está pronto/executado — fecha os 3 sub-itens da Fase 2 (tiers, auth, Google Sign-In), todos com spec + planos prontos, aguardando execução via Codex.
