# Fase 2 — Auth: senha + 2FA + verificação de email (Mobile) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App móvel troca de token único pra access+refresh, `login.tsx` trata email não-verificado e prompt de 2FA (login em 2 passos), esqueci-senha abre o fluxo do dashboard web (sem tela nativa de reset).

**Architecture:** `AuthContext.tsx` ganha `completeSession()` (helper compartilhado entre login normal e login pós-2FA) e `login()` passa a devolver um resultado discriminado (`{ok:true}` / `{ok:false, code, challengeToken?}`) em vez de `boolean` puro, pra `login.tsx` conseguir mostrar a tela certa por caso. Sem setup de 2FA no mobile nesta leva (decisão da spec) — só o desafio no login, caso um DONO/GERENTE com 2FA ativo (configurado pelo web) logue no app.

**Tech Stack:** Expo Router (SDK 52) + React Native 0.76 + `expo-secure-store` + `expo-web-browser` + Jest/`jest-expo`.

**Spec:** `TozzoBurger/docs/superpowers/specs/2026-08-31-fase-2-auth-senha-2fa-email-design.md`

**Depende de:** o plano da API (`api/api-tozzo.uk/docs/superpowers/plans/2026-08-31-fase-2-auth-senha-2fa-email-api.md`) — contrato `login`/`register` muda de `{ token }` pra `{ accessToken, refreshToken }` / `{ code: 'AUTH_EMAIL_VERIFICATION_REQUIRED' }` / `{ code: 'TOTP_REQUIRED', challengeToken }` / erro `403 EMAIL_NOT_VERIFIED`.

## Global Constraints

- `expo-secure-store` guarda 2 chaves de token agora: `tozzo_access_token_v1` (renomeada de `tozzo_token_v1`) e `tozzo_refresh_token_v1` — sessões antigas persistidas antes desta mudança ficam automaticamente invalidadas na próxima abertura do app (token antigo sob a chave antiga não é mais lido), obrigando novo login — aceitável, não é um fluxo de dado sensível pra migrar com cuidado extra.
- Sem tela nativa de "esqueci senha"/"reset senha" — o link do email de reset abre o front web (`tozzo.uk/reset-password`) via `WebBrowser.openBrowserAsync`, mesmo padrão já usado pra `/privacidade`/`/termos`.
- Sem tela de setup de 2FA no mobile — só o prompt de código no login, quando a API responder `TOTP_REQUIRED` (decisão já registrada na spec, reforçada aqui pra quem for executar o plano sem ler a spec inteira de novo).

---

## Task 1: `services/api.ts` — `ApiHttpError` no `login`, tokens de sessão, `verifyTotpLogin`

**Files:**
- Modify: `services/api.ts` (`login`, linhas 130-152)
- Test: `services/__tests__/login.test.ts` (criar se não existir teste de `login` ainda)

**Interfaces:**
- Produces: `login(email, password)` lança `ApiHttpError` em vez de `Error` genérico; `verifyTotpLogin(challengeToken: string, code: string): Promise<{accessToken: string; refreshToken: string; user?: unknown}>`; `refreshSession(refreshToken: string): Promise<{accessToken: string; refreshToken: string}>`.

- [ ] **Step 1: Escrever o teste**

```ts
// services/__tests__/login.test.ts
import { login, verifyTotpLogin, refreshSession, ApiHttpError } from '../api';

const originalFetch = global.fetch;
afterEach(() => { global.fetch = originalFetch; });

describe('login', () => {
  it('lanca ApiHttpError com o code EMAIL_NOT_VERIFIED em 403', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, status: 403,
      text: async () => JSON.stringify({ code: 'EMAIL_NOT_VERIFIED', message: 'Confirm your email.' }),
    }) as any;

    await expect(login('user@example.com', 'senha123')).rejects.toMatchObject({ code: 'EMAIL_NOT_VERIFIED', status: 403 });
  });

  it('resolve normal com code TOTP_REQUIRED (nao e erro)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200,
      text: async () => JSON.stringify({ code: 'TOTP_REQUIRED', challengeToken: 'challenge-1' }),
    }) as any;

    const result = await login('user@example.com', 'senha123');
    expect(result.code).toBe('TOTP_REQUIRED');
    expect(result.challengeToken).toBe('challenge-1');
  });

  it('resolve com accessToken/refreshToken em sucesso normal', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200,
      text: async () => JSON.stringify({ accessToken: 'a1', refreshToken: 'r1', user: { id: 1 } }),
    }) as any;

    const result = await login('user@example.com', 'senha123');
    expect(result.accessToken).toBe('a1');
    expect(result.refreshToken).toBe('r1');
  });
});

describe('verifyTotpLogin', () => {
  it('posta challengeToken+code e devolve os tokens', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200,
      text: async () => JSON.stringify({ accessToken: 'a2', refreshToken: 'r2' }),
    }) as any;

    const result = await verifyTotpLogin('challenge-1', '123456');
    expect(result.accessToken).toBe('a2');
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/2fa/verify-login'),
      expect.objectContaining({ body: JSON.stringify({ challengeToken: 'challenge-1', code: '123456' }) }),
    );
  });
});

describe('refreshSession', () => {
  it('posta refreshToken e devolve o par novo', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200,
      text: async () => JSON.stringify({ accessToken: 'a3', refreshToken: 'r3' }),
    }) as any;

    const result = await refreshSession('old-refresh');
    expect(result.accessToken).toBe('a3');
  });
});
```

- [ ] **Step 2: Rodar (deve falhar)**

Run: `npx jest --watchAll=false services/__tests__/login.test.ts`
Expected: FAIL

- [ ] **Step 3: Reescrever `login()` e adicionar `verifyTotpLogin`/`refreshSession`**

```ts
export async function login(email: string, password: string) {
  const url = `${BASE_URL}/auth/login`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...NGROK_HEADERS },
      body: JSON.stringify({ email, senha: password }),
    });

    const body = await handleJsonResponse(res);

    if (!res.ok) {
      const error = new ApiHttpError(res.status, body);
      console.error('API login error:', url, error.message);
      throw error;
    }

    return body && typeof body === 'object' ? { ...body, user: body.user ? fromLegacyUser(body.user) : body.user } : body;
  } catch (err: any) {
    if (err instanceof ApiHttpError) throw err;
    console.error('Network/login request failed', url, err?.message ?? err);
    throw err;
  }
}

export async function verifyTotpLogin(challengeToken: string, code: string) {
  const url = `${BASE_URL}/auth/2fa/verify-login`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...NGROK_HEADERS },
      body: JSON.stringify({ challengeToken, code }),
    });
    const body = await handleJsonResponse(res);
    if (!res.ok) {
      const error = new ApiHttpError(res.status, body);
      console.error('API verifyTotpLogin error:', url, error.message);
      throw error;
    }
    return body && typeof body === 'object' ? { ...body, user: body.user ? fromLegacyUser(body.user) : body.user } : body;
  } catch (err: any) {
    if (err instanceof ApiHttpError) throw err;
    console.error('Network/verifyTotpLogin request failed', url, err?.message ?? err);
    throw err;
  }
}

export async function refreshSession(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  const url = `${BASE_URL}/auth/refresh`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...NGROK_HEADERS },
    body: JSON.stringify({ refreshToken }),
  });
  const body = await handleJsonResponse(res);
  if (!res.ok) throw new ApiHttpError(res.status, body);
  return body as { accessToken: string; refreshToken: string };
}
```

- [ ] **Step 4: Rodar o teste**

Run: `npx jest --watchAll=false services/__tests__/login.test.ts`
Expected: PASS

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npx jest --watchAll=false`
Expected: PASS — checar qualquer teste existente que dependa do `login()` antigo lançando `Error` genérico em vez de `ApiHttpError` (o `.message` continua populado do mesmo jeito, só o tipo/`.code` mudou).

- [ ] **Step 6: Commit**

```bash
git add services/api.ts services/__tests__/login.test.ts
git commit -m "feat(auth): login throws ApiHttpError, add TOTP challenge and refresh endpoints"
```

---

## Task 2: `AuthContext.tsx` — sessão de 2 tokens + resultado discriminado do `login`

**Files:**
- Modify: `context/AuthContext.tsx` (inteiro)
- Test: `context/__tests__/AuthContext.test.tsx` (criar se não existir; conferir antes se já existe algum teste de auth context no projeto pra não duplicar harness)

**Interfaces:**
- Consumes: `login`/`verifyTotpLogin`/`refreshSession` (Task 1).
- Produces: `login(email, senha): Promise<LoginResult>` onde `type LoginResult = { ok: true } | { ok: false; code?: string; challengeToken?: string }` (**muda de `Promise<boolean>`** — consumido pela Task 3); `completeTotpLogin(challengeToken, code): Promise<LoginResult>` novo.

- [ ] **Step 1: Escrever o teste**

```tsx
// context/__tests__/AuthContext.test.tsx
jest.mock('expo-secure-store');
jest.mock('@/services/api');
jest.mock('@/database/watermelon/sync', () => ({ synchronizeWithServer: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/database/syncGuard', () => ({ runWithLock: (fn: any) => fn() }));
jest.mock('@/database/watermelon/database', () => ({ resetWatermelonLocalData: jest.fn() }));

import * as SecureStore from 'expo-secure-store';
import * as api from '@/services/api';
import { renderHook, act } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '../AuthContext';

function wrapper({ children }: any) { return <AuthProvider>{children}</AuthProvider>; }

describe('AuthContext.login', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sucesso normal grava os 2 tokens e retorna ok:true', async () => {
    (api.login as jest.Mock).mockResolvedValue({ accessToken: 'a1', refreshToken: 'r1', user: undefined });
    (api.getMe as jest.Mock).mockResolvedValue({ id: 1, establishmentId: 'estab-1' });

    const { result } = renderHook(() => useAuth(), { wrapper });
    let outcome: any;
    await act(async () => { outcome = await result.current.login('user@example.com', 'senha123'); });

    expect(outcome).toEqual({ ok: true });
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('tozzo_access_token_v1', 'a1');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('tozzo_refresh_token_v1', 'r1');
  });

  it('EMAIL_NOT_VERIFIED retorna ok:false com o code, sem gravar token', async () => {
    const err: any = new Error('not verified'); err.code = 'EMAIL_NOT_VERIFIED';
    (api.login as jest.Mock).mockRejectedValue(err);

    const { result } = renderHook(() => useAuth(), { wrapper });
    let outcome: any;
    await act(async () => { outcome = await result.current.login('user@example.com', 'senha123'); });

    expect(outcome).toEqual({ ok: false, code: 'EMAIL_NOT_VERIFIED' });
    expect(SecureStore.setItemAsync).not.toHaveBeenCalledWith('tozzo_access_token_v1', expect.anything());
  });

  it('TOTP_REQUIRED retorna ok:false com o challengeToken', async () => {
    (api.login as jest.Mock).mockResolvedValue({ code: 'TOTP_REQUIRED', challengeToken: 'challenge-1' });

    const { result } = renderHook(() => useAuth(), { wrapper });
    let outcome: any;
    await act(async () => { outcome = await result.current.login('user@example.com', 'senha123'); });

    expect(outcome).toEqual({ ok: false, code: 'TOTP_REQUIRED', challengeToken: 'challenge-1' });
  });

  it('completeTotpLogin grava os tokens apos codigo valido', async () => {
    (api.verifyTotpLogin as jest.Mock).mockResolvedValue({ accessToken: 'a2', refreshToken: 'r2' });
    (api.getMe as jest.Mock).mockResolvedValue({ id: 1, establishmentId: 'estab-1' });

    const { result } = renderHook(() => useAuth(), { wrapper });
    let outcome: any;
    await act(async () => { outcome = await result.current.completeTotpLogin('challenge-1', '123456'); });

    expect(outcome).toEqual({ ok: true });
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('tozzo_access_token_v1', 'a2');
  });
});
```

Ajustar os mocks acima pro padrão real de teste de hook já usado no repo (ex.: se `@testing-library/react-native` não estiver instalado, usar o mesmo harness que `hooks/__tests__/useSyncRefresh.test.tsx` já usa pra testar contexto/hook — `TestRenderer` manual).

- [ ] **Step 2: Rodar (deve falhar)**

Run: `npx jest --watchAll=false context/__tests__/AuthContext.test.tsx`
Expected: FAIL

- [ ] **Step 3: Reescrever `AuthContext.tsx`**

Trocar as chaves de storage (linha 26-27):

```ts
const ACCESS_TOKEN_KEY = 'tozzo_access_token_v1';
const REFRESH_TOKEN_KEY = 'tozzo_refresh_token_v1';
const USER_CACHE_KEY = 'tozzo_user_cache_v1';
```

Adicionar o tipo de resultado e extrair `completeSession` (lógica hoje inline em `login()`, linhas 113-137, reaproveitada por login normal e pós-2FA):

```ts
export type LoginResult = { ok: true } | { ok: false; code?: string; challengeToken?: string };

async function completeSession(
  accessToken: string,
  refreshToken: string,
  setUser: (u: User) => void,
  setToken: (t: string) => void,
): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);

  const me = await api.getMe(accessToken);
  if (!me) throw new Error('Failed to fetch profile after login');
  setUser(me);

  const prev = await readCachedUser();
  const meEstab = (me as any)?.establishmentId ?? null;
  if (prev && String(prev.establishmentId) !== String(meEstab)) {
    await resetWatermelonLocalData().catch((e) => console.warn('[auth] Watermelon local data reset failed', e));
  }
  await cacheUser(me);
  setToken(accessToken);

  void runWithLock(() => synchronizeWithServer(accessToken, (me as any)?.establishmentId))
    .then((res) => { if (res === null) console.log('[sync] skipped login-triggered sync; another sync is in progress'); })
    .catch((err) => console.warn('sync after login failed', err));
}
```

Trocar `login` (linhas 99-150):

```ts
const login = async (email: string, senha: string): Promise<LoginResult> => {
  setLoading(true);
  try {
    const body = await api.login(email, senha);

    if (body && typeof body === 'object' && (body as any).code === 'TOTP_REQUIRED') {
      return { ok: false, code: 'TOTP_REQUIRED', challengeToken: (body as any).challengeToken };
    }

    const accessToken = (body as any)?.accessToken;
    const refreshToken = (body as any)?.refreshToken;
    if (!accessToken || !refreshToken) return { ok: false };

    await completeSession(accessToken, refreshToken, setUser, setToken);
    return { ok: true };
  } catch (err: any) {
    if (err?.code === 'EMAIL_NOT_VERIFIED') return { ok: false, code: 'EMAIL_NOT_VERIFIED' };
    console.warn('Login failed', err);
    return { ok: false };
  } finally {
    setLoading(false);
  }
};

const completeTotpLogin = async (challengeToken: string, code: string): Promise<LoginResult> => {
  setLoading(true);
  try {
    const body = await api.verifyTotpLogin(challengeToken, code);
    const accessToken = (body as any)?.accessToken;
    const refreshToken = (body as any)?.refreshToken;
    if (!accessToken || !refreshToken) return { ok: false };

    await completeSession(accessToken, refreshToken, setUser, setToken);
    return { ok: true };
  } catch (err: any) {
    console.warn('TOTP login failed', err);
    return { ok: false, code: err?.code };
  } finally {
    setLoading(false);
  }
};
```

Trocar `logout` (linha 152-157) — revogar o refresh token no servidor antes de limpar local:

```ts
const logout = () => {
  SecureStore.getItemAsync(REFRESH_TOKEN_KEY).then((refreshToken) => {
    if (refreshToken) api.logout(refreshToken).catch((err) => console.warn('Failed to revoke refresh token', err));
  });
  setToken(null);
  setUser(null);
  SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY).catch((err) => console.warn('Failed to delete access token', err));
  SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY).catch((err) => console.warn('Failed to delete refresh token', err));
  SecureStore.deleteItemAsync(USER_CACHE_KEY).catch((err) => console.warn('Failed to delete user cache', err));
};
```

Trocar a rehidratação (linha 53-97) — `SecureStore.getItemAsync(TOKEN_KEY)` (linha 57) vira `SecureStore.getItemAsync(ACCESS_TOKEN_KEY)`; sem mudança de lógica além do nome da chave (o refresh token não precisa ser lido na rehidratação — só é usado no logout e, futuramente/fora de escopo desta leva, num retry automático de 401 em chamadas autenticadas do app, que **não é parte deste plano** — ver Fora de escopo abaixo).

Atualizar `AuthContextData` (linha 16-22) com `login: (email: string, senha: string) => Promise<LoginResult>` e `completeTotpLogin: (challengeToken: string, code: string) => Promise<LoginResult>`, e o `AuthContext.Provider value={{...}}` (linha 159-163) incluindo `completeTotpLogin`.

Adicionar `import { LoginResult } from` — na verdade `LoginResult` é exportado do próprio arquivo, sem import externo necessário.

Adicionar `import * as api from '@/services/api'` já existe (linha 2); só confirmar que `api.logout` (novo, Task 1 já cobre `login`/`verifyTotpLogin`/`refreshSession` mas não `logout` — adicionar esse também na Task 1 se ainda não fez, seguindo o mesmo padrão de `POST /auth/logout` com `{ refreshToken }` no corpo, sem exigir token de autorização).

- [ ] **Step 4: Adicionar `api.logout` faltante em `services/api.ts` (retroagindo à Task 1, caso tenha ficado de fora)**

```ts
export async function logout(refreshToken: string): Promise<void> {
  const url = `${BASE_URL}/auth/logout`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...NGROK_HEADERS },
      body: JSON.stringify({ refreshToken }),
    });
  } catch (err) {
    console.warn('Network/logout request failed', url, err);
  }
}
```

- [ ] **Step 5: Rodar o teste + a suíte inteira**

Run: `npx jest --watchAll=false context/__tests__/AuthContext.test.tsx && npx jest --watchAll=false`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add context/AuthContext.tsx context/__tests__/AuthContext.test.tsx services/api.ts
git commit -m "feat(auth): AuthContext handles access+refresh tokens and TOTP challenge result"
```

---

## Task 3: `login.tsx` — email não-verificado + prompt de 2FA + link "esqueci senha"

**Files:**
- Modify: `app/login.tsx` (inteiro)
- Test: `app/__tests__/login.test.tsx` (criar se não existir teste de tela de login ainda — conferir primeiro)

**Interfaces:**
- Consumes: `login`/`completeTotpLogin` (Task 2, retorno `LoginResult`).

- [ ] **Step 1: Escrever o teste**

```tsx
// app/__tests__/login.test.tsx
jest.mock('@/context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { useAuth } from '@/context/AuthContext';
import LoginScreen from '../login';

const mockUseAuth = useAuth as jest.Mock;

describe('LoginScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('mostra prompt de codigo TOTP quando login retorna TOTP_REQUIRED', async () => {
    const loginMock = jest.fn().mockResolvedValue({ ok: false, code: 'TOTP_REQUIRED', challengeToken: 'challenge-1' });
    mockUseAuth.mockReturnValue({ login: loginMock, completeTotpLogin: jest.fn() });

    const { getByLabelText, getByText, queryByText } = render(<LoginScreen />);
    fireEvent.changeText(getByLabelText(/email/i), 'user@example.com');
    fireEvent.changeText(getByLabelText(/senha|password/i), 'senha123');
    fireEvent.press(getByText(/entrar|login/i));

    await waitFor(() => expect(queryByText(/codigo|code/i)).toBeTruthy());
  });

  it('mostra alerta especifico quando login retorna EMAIL_NOT_VERIFIED', async () => {
    const loginMock = jest.fn().mockResolvedValue({ ok: false, code: 'EMAIL_NOT_VERIFIED' });
    mockUseAuth.mockReturnValue({ login: loginMock, completeTotpLogin: jest.fn() });

    const { getByLabelText, getByText, queryByText } = render(<LoginScreen />);
    fireEvent.changeText(getByLabelText(/email/i), 'user@example.com');
    fireEvent.changeText(getByLabelText(/senha|password/i), 'senha123');
    fireEvent.press(getByText(/entrar|login/i));

    await waitFor(() => expect(queryByText(/confirme seu email|confirm your email/i)).toBeTruthy());
  });
});
```

Ajustar ao padrão real de teste de tela já usado no projeto (verificar se `@testing-library/react-native` está instalado; se o projeto usa outro padrão pra testar telas Expo Router, seguir esse).

- [ ] **Step 2: Rodar (deve falhar)**

Run: `npx jest --watchAll=false app/__tests__/login.test.tsx`
Expected: FAIL

- [ ] **Step 3: Reescrever `login.tsx`**

```tsx
import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Alert } from 'react-native';
import { Image } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import Colors from '@/constants/Colors';
import { useTranslation } from 'react-i18next';

export default function LoginScreen() {
  const { login, completeTotpLogin } = useAuth();
  const { t } = useTranslation();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [awaitingEmailVerification, setAwaitingEmailVerification] = useState(false);

  const handleLogin = async () => {
    if (!email || !senha) {
      Alert.alert(t('auth.credentialsRequired'));
      return;
    }
    setLoading(true);
    try {
      const result = await login(email, senha);
      if (result.ok) {
        console.log('Login successful - initial sync running in background');
        return;
      }
      if (result.code === 'TOTP_REQUIRED' && result.challengeToken) {
        setChallengeToken(result.challengeToken);
        return;
      }
      if (result.code === 'EMAIL_NOT_VERIFIED') {
        setAwaitingEmailVerification(true);
        return;
      }
      Alert.alert(t('auth.loginFailedTitle'), t('auth.invalidCredentials'));
    } catch (err) {
      console.warn('Login error:', err);
      Alert.alert(t('errors.generic'), t('auth.loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleTotpSubmit = async () => {
    if (!challengeToken || !totpCode) return;
    setLoading(true);
    try {
      const result = await completeTotpLogin(challengeToken, totpCode);
      if (!result.ok) {
        Alert.alert(t('auth.totpInvalidCodeTitle'), t('auth.totpInvalidCode'));
        return;
      }
      console.log('TOTP login successful - initial sync running in background');
    } finally {
      setLoading(false);
    }
  };

  if (awaitingEmailVerification) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.text }]}>{t('auth.checkEmailTitle')}</Text>
        <Text style={{ color: colors.text, textAlign: 'center', marginTop: 12 }}>{t('auth.checkEmailDescription')}</Text>
        <Button title={t('common.back')} onPress={() => setAwaitingEmailVerification(false)} style={styles.button} />
      </View>
    );
  }

  if (challengeToken) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={[styles.title, { color: colors.text }]}>{t('auth.totpTitle')}</Text>
        <View style={styles.form}>
          <TextInput
            placeholder={t('auth.totpCodePlaceholder')}
            accessibilityLabel={t('auth.totpCodeLabel')}
            value={totpCode}
            onChangeText={setTotpCode}
            keyboardType="number-pad"
            style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
            placeholderTextColor={colors.textMuted}
          />
          <Button title={t('common.confirm')} onPress={handleTotpSubmit} loading={loading} disabled={loading} style={styles.button} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Image source={require('../assets/images/logo-login.png')} style={styles.logo} resizeMode="contain" fadeDuration={0} />
      <Text style={[styles.title, { color: colors.text }]}>Tozzo.uk</Text>
      <View style={styles.form}>
        <TextInput
          placeholder={t('auth.emailPlaceholder')}
          accessibilityLabel={t('auth.email')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
          placeholderTextColor={colors.textMuted}
        />
        <TextInput
          placeholder={t('auth.passwordPlaceholder')}
          accessibilityLabel={t('auth.password')}
          value={senha}
          onChangeText={setSenha}
          secureTextEntry
          style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
          placeholderTextColor={colors.textMuted}
        />
        <Button title={t('auth.login')} accessibilityLabel={t('auth.login')} onPress={handleLogin} loading={loading} disabled={loading} style={styles.button} />
        <Button
          title={t('auth.forgotPasswordLink')}
          accessibilityLabel={t('auth.forgotPasswordLink')}
          onPress={() => WebBrowser.openBrowserAsync('https://tozzo.uk/forgot-password')}
          style={styles.linkButton}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, borderColor: 'black', borderWidth: 1 },
  title: { fontSize: 24, fontWeight: '700', marginTop: 12, marginBottom: 24 },
  logo: { width: 140, height: 140, marginBottom: 12 },
  form: { width: '100%' },
  input: { height: 48, borderColor: '#ddd', borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, marginBottom: 12, textAlign: 'left', writingDirection: 'ltr' },
  button: { marginTop: 8 },
  linkButton: { marginTop: 4, backgroundColor: 'transparent' },
});
```

Nota: `Button` com `backgroundColor: 'transparent'` pro link "esqueci senha" — conferir se o componente `@/components/ui/Button` aceita `style` sobrescrevendo o fundo (já é usado com `style={styles.button}` no botão principal, então deve aceitar); se o componente força uma variante própria sem permitir transparência, trocar por um `Text` clicável simples (`onPress` + `TouchableOpacity`) em vez de forçar o componente `Button` a um visual que ele não suporta.

- [ ] **Step 4: Adicionar as chaves de i18n novas (`auth.*`, `common.back`/`common.confirm` se ainda não existirem) — conferir o(s) arquivo(s) de locale do mobile e adicionar nos idiomas suportados pelo app**

Texto de referência (português): `totpTitle: "Código de dois fatores"`, `totpCodeLabel`/`totpCodePlaceholder: "Código"`, `totpInvalidCodeTitle: "Código inválido"`, `totpInvalidCode: "Tente novamente."`, `checkEmailTitle: "Confirme seu email"`, `checkEmailDescription: "Mandamos um link de confirmação pro seu email. Confirme antes de tentar entrar de novo."`, `forgotPasswordLink: "Esqueci minha senha"`.

- [ ] **Step 5: Rodar os testes**

Run: `npx jest --watchAll=false`
Expected: PASS

- [ ] **Step 6: Build Android real e QA manual**

Run: `npx expo run:android`
Fluxo manual: login com conta de teste sem `emailVerifiedAt` (deve mostrar tela "confirme seu email"), login com 2FA ativo numa conta DONO/GERENTE configurada via web (deve pedir código), "esqueci minha senha" abre o navegador no front web.

- [ ] **Step 7: Commit**

```bash
git add app/login.tsx "app/__tests__/login.test.tsx"
git commit -m "feat(auth): handle email verification and TOTP challenge in mobile login screen"
```

---

## Task 4: Revisão final da branch + `plano.md`

- [ ] **Step 1: Rodar a suíte completa + `tsc`**

Run: `npx jest --watchAll=false && npx tsc --noEmit`
Expected: tudo verde.

- [ ] **Step 2: Build Android real**

Run: `npx expo run:android`
QA manual completo: cadastro (não aplicável no mobile — só web tem tela de registro; funcionário criado pelo dono via web precisa confirmar o próprio email antes do primeiro login no app), login normal, login com 2FA, login com email não verificado, logout revoga a sessão (conferir no dashboard web ou nos logs da API que o `RefreshToken` foi marcado `revokedAt`).

- [ ] **Step 3: Atualizar `C:\RN\plano.md`**

Marcar que o plano de implementação do mobile (auth) está pronto/executado, junto com API e front.

## Fora de escopo

- **Retry automático de refresh em qualquer chamada autenticada do app** (equivalente ao interceptor do front) — esta leva só cobre emissão/revogação do refresh token no login/logout. Se uma chamada do app receber 401 por access token expirado no meio do uso (sessão de 15min, uso contínuo do garçom durante o turno), hoje o app não tenta refresh automático — fica pra uma leva própria se isso se mostrar um problema real de UX (usuário sendo deslogado no meio do turno). Registrar como pendência conhecida no `plano.md`.
- **Tela de cadastro/setup de 2FA no mobile** — decisão já tomada na spec (ver Architecture acima).
