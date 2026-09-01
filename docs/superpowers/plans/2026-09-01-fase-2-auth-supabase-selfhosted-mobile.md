# Auth via Supabase Auth (GoTrue) self-hosted — Mobile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o login do app (`POST /auth/login` próprio da api) por `@supabase/auth-js`
apontando pro GoTrue self-hosted, ganhando desafio de 2FA e Google Sign-In sem código próprio de
OAuth, mantendo a mesma interface pública de `AuthContext` que o resto do app já consome.

**Architecture:** `services/authClient.ts` expõe uma instância de `AuthClient` (auth-js) com
storage customizado (`LargeSecureStore` — sessão do auth-js passa de 2048 bytes, o limite do
`expo-secure-store`; padrão: chave AES fica no SecureStore, blob criptografado fica no
AsyncStorage já usado pelo projeto). `AuthContext` mantém a mesma forma pública (`user`, `token`,
`loading`, `login`, `logout`) que os outros 10 arquivos do app já consomem — só troca a
implementação interna pra usar `authClient` em vez de `services/api.login()`. `login()` continua
devolvendo `boolean` (não quebra os 2 call sites existentes, `login.tsx` e `configs.tsx`); um
novo estado `mfaChallenge` no contexto cobre o caso de 2FA sem mudar essa assinatura.

**Tech Stack:** Expo Router (SDK 52), React Native 0.76, `@supabase/auth-js` (novo), `aes-js` +
`react-native-get-random-values` (novo, só pro `LargeSecureStore`), `expo-secure-store`,
`@react-native-async-storage/async-storage` (já no projeto), Jest + `jest-expo`,
`react-test-renderer`.

**Spec:** `docs/superpowers/specs/2026-09-01-fase-2-auth-supabase-selfhosted-design.md`

## Global Constraints

- `EXPO_PUBLIC_AUTH_URL` novo em `.env`/`.env.example` = `${EXPO_PUBLIC_API_URL}/gotrue` (mesmo
  padrão de override que `EXPO_PUBLIC_API_URL` já tem hoje).
- Timestamps sempre em epoch ms — este plano não introduz timestamp novo, mas qualquer código
  tocado que já lide com data deve manter o padrão.
- Rodar teste sempre com `npx jest --watchAll=false` — **nunca** `npm test` puro (script padrão
  do `package.json` é `jest --watchAll`, trava para sempre non-interactive).
- Não fazer push, merge ou PR. Não tocar em `main`/`master`/`dev`.
- Este plano **não** implementa tela de setup de 2FA no mobile (decisão da spec — setup só pelo
  dashboard web) nem cadastro/registro (o app não tem essa tela hoje, só login).
- GoTrue **não está rodando** neste ambiente — toda integração é testada via `jest.mock`, nunca
  contra instância real. Nenhuma task depende de GoTrue estar de pé.
- **Não** rodar `npx expo run:android` neste plano — validação de build nativo real fica pra
  QA manual do usuário depois (mesmo padrão já usado nas fases anteriores deste projeto).

---

### Task 1: `services/authClient.ts` (auth-js + `LargeSecureStore`)

**Files:**
- Create: `services/authClient.ts`
- Modify: `package.json` (dependências novas)
- Modify: `app/_layout.tsx` (polyfill `react-native-get-random-values`, 1ª linha do arquivo)
- Test: `services/__tests__/authClient.test.ts`

**Interfaces:**
- Consumes: `process.env.EXPO_PUBLIC_AUTH_URL`.
- Produces: `export const authClient: AuthClient` — usado pela Task 2 em diante.

- [ ] **Step 1: Instalar as dependências**

Run: `npm install @supabase/auth-js aes-js react-native-get-random-values`

- [ ] **Step 2: Escrever o teste**

```typescript
// services/__tests__/authClient.test.ts
import { authClient } from '../authClient';

describe('authClient', () => {
  it('expõe os métodos principais do auth-js', () => {
    expect(typeof authClient.signInWithPassword).toBe('function');
    expect(typeof authClient.signInWithOAuth).toBe('function');
    expect(typeof authClient.getSession).toBe('function');
    expect(typeof authClient.onAuthStateChange).toBe('function');
    expect(typeof authClient.resetPasswordForEmail).toBe('function');
    expect(typeof authClient.mfa.challenge).toBe('function');
    expect(typeof authClient.mfa.verify).toBe('function');
  });
});
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `npx jest services/__tests__/authClient.test.ts --watchAll=false`
Expected: FAIL — `services/authClient.ts` não existe.

- [ ] **Step 4: Implementar o `LargeSecureStore` + client**

```typescript
// services/authClient.ts
import 'react-native-get-random-values';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as aesjs from 'aes-js';
import { AuthClient } from '@supabase/auth-js';

// A sessão do auth-js (access+refresh token, dados do usuário) passa dos 2048 bytes que o
// expo-secure-store aceita com segurança — padrão oficial da Supabase pra Expo/React Native:
// chave AES-256 fica no SecureStore (pequena), o blob criptografado fica no AsyncStorage.
class LargeSecureStore {
  private async _encrypt(key: string, value: string) {
    const encryptionKey = crypto.getRandomValues(new Uint8Array(256 / 8));
    const cipher = new aesjs.ModeOfOperation.ctr(encryptionKey, new aesjs.Counter(1));
    const encryptedBytes = cipher.encrypt(aesjs.utils.utf8.toBytes(value));
    await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(encryptionKey));
    return aesjs.utils.hex.fromBytes(encryptedBytes);
  }

  private async _decrypt(key: string, value: string) {
    const encryptionKeyHex = await SecureStore.getItemAsync(key);
    if (!encryptionKeyHex) return null;
    const cipher = new aesjs.ModeOfOperation.ctr(
      aesjs.utils.hex.toBytes(encryptionKeyHex),
      new aesjs.Counter(1),
    );
    const decryptedBytes = cipher.decrypt(aesjs.utils.hex.toBytes(value));
    return aesjs.utils.utf8.fromBytes(decryptedBytes);
  }

  async getItem(key: string) {
    const encrypted = await AsyncStorage.getItem(key);
    if (!encrypted) return encrypted;
    return this._decrypt(key, encrypted);
  }

  async removeItem(key: string) {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key);
  }

  async setItem(key: string, value: string) {
    const encrypted = await this._encrypt(key, value);
    await AsyncStorage.setItem(key, encrypted);
  }
}

const AUTH_URL = process.env.EXPO_PUBLIC_AUTH_URL || `${process.env.EXPO_PUBLIC_API_URL || 'https://api.tozzo.uk'}/gotrue`;

export const authClient = new AuthClient({
  url: AUTH_URL,
  storage: new LargeSecureStore(),
  autoRefreshToken: true,
  persistSession: true,
  detectSessionInUrl: false,
});
```

- [ ] **Step 5: Adicionar o polyfill no entrypoint**

Em `app/_layout.tsx`, garanta que `import 'react-native-get-random-values';` é a **primeira**
linha do arquivo (antes de qualquer outro import) — `crypto.getRandomValues` precisa existir
antes de qualquer módulo tentar usá-lo.

- [ ] **Step 6: Rodar o teste e confirmar que passa**

Run: `npx jest services/__tests__/authClient.test.ts --watchAll=false`
Expected: PASS.

- [ ] **Step 7: Adicionar `EXPO_PUBLIC_AUTH_URL` ao `.env.example`**

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json services/authClient.ts services/__tests__/authClient.test.ts app/_layout.tsx .env.example
git commit -m "feat(auth): cliente @supabase/auth-js com LargeSecureStore (GoTrue)"
```

---

### Task 2: `AuthContext` usa `authClient`, mantém a mesma interface pública

**Files:**
- Modify: `context/AuthContext.tsx` (reescrita completa do provider)
- Test: `context/__tests__/AuthContext.test.tsx` (novo — não existe teste hoje pra este arquivo)

**Interfaces:**
- Consumes: `authClient` (Task 1), `synchronizeWithServer`/`runWithLock`/`resetWatermelonLocalData`
  (já existentes, sem mudança de assinatura), `api.getMe(token)` (`services/api.ts`, sem mudança).
- Produces:

```typescript
type AuthContextData = {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, senha: string) => Promise<boolean>;
  mfaChallenge: { factorId: string; challengeId: string } | null;
  verifyMfa: (code: string) => Promise<boolean>;
  logout: () => void;
};
```

`user`/`token`/`loading`/`login`/`logout` têm a mesma assinatura de hoje — os 10 arquivos que já
consomem `useAuth()` continuam funcionando sem mudança. `mfaChallenge`/`verifyMfa` são novos,
consumidos só pela Task 3.

- [ ] **Step 1: Escrever o teste (login sem MFA)**

```typescript
// context/__tests__/AuthContext.test.tsx
import React from 'react';
import { act, create } from 'react-test-renderer';
import { AuthProvider, useAuth } from '../AuthContext';

const mockSignInWithPassword = jest.fn();
const mockGetSession = jest.fn();
const mockOnAuthStateChange = jest.fn();

jest.mock('../authClient', () => ({
  authClient: {
    signInWithPassword: (...args: unknown[]) => mockSignInWithPassword(...args),
    getSession: (...args: unknown[]) => mockGetSession(...args),
    onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
    mfa: { challenge: jest.fn(), verify: jest.fn(), listFactors: jest.fn() },
  },
}));

jest.mock('@/services/api', () => ({
  getMe: jest.fn().mockResolvedValue({ id: 'user-1', name: 'Ana', role: 'DONO', establishmentId: 'estab-1' }),
}));

jest.mock('@/database/watermelon/sync', () => ({ synchronizeWithServer: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/database/syncGuard', () => ({ runWithLock: (fn: () => unknown) => fn() }));
jest.mock('@/database/watermelon/database', () => ({ resetWatermelonLocalData: jest.fn() }));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

function TestConsumer() {
  const { login, user, token } = useAuth();
  React.useEffect(() => {
    login('ana@example.com', 'senha123');
  }, []);
  return React.createElement('Text', {}, `${user?.name ?? 'none'}:${token ?? 'none'}`);
}

describe('AuthContext', () => {
  beforeEach(() => {
    mockSignInWithPassword.mockReset();
    mockGetSession.mockReset();
    mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: jest.fn() } } });
  });

  it('login bem-sucedido preenche user e token a partir da sessão do auth-js', async () => {
    mockSignInWithPassword.mockResolvedValue({
      data: { session: { access_token: 'tok-1', user: { id: 'user-1' } } },
      error: null,
    });

    let root: ReturnType<typeof create>;
    await act(async () => {
      root = create(React.createElement(AuthProvider, {}, React.createElement(TestConsumer)));
    });
    await act(async () => {
      await Promise.resolve();
    });

    const text = root!.root.findByType('Text').props.children;
    expect(text).toBe('Ana:tok-1');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx jest context/__tests__/AuthContext.test.tsx --watchAll=false`
Expected: FAIL — `AuthContext.tsx` ainda usa `services/api.login`/`SecureStore` direto, não
`authClient`.

- [ ] **Step 3: Reescrever `AuthContext.tsx`**

```typescript
import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import * as api from '@/services/api';
import { authClient } from '@/services/authClient';
import { synchronizeWithServer } from '@/database/watermelon/sync';
import { runWithLock } from '@/database/syncGuard';
import { resetWatermelonLocalData } from '@/database/watermelon/database';

type User = {
  id?: number | string;
  name?: string;
  email?: string;
  establishmentId?: number | string | null;
  role?: string | null;
};

type MfaChallenge = { factorId: string; challengeId: string };

type AuthContextData = {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, senha: string) => Promise<boolean>;
  mfaChallenge: MfaChallenge | null;
  verifyMfa: (code: string) => Promise<boolean>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextData | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [mfaChallenge, setMfaChallenge] = useState<MfaChallenge | null>(null);
  const [prevEstablishmentId, setPrevEstablishmentId] = useState<string | number | null>(null);

  const applySession = async (accessToken: string) => {
    try {
      const me = await api.getMe(accessToken);
      if (!me) return false;

      const meEstab = (me as any)?.establishmentId ?? null;
      if (prevEstablishmentId != null && String(prevEstablishmentId) !== String(meEstab)) {
        await resetWatermelonLocalData().catch((e) => console.warn('[auth] Watermelon local data reset failed', e));
      }
      setPrevEstablishmentId(meEstab);
      setUser(me);
      setToken(accessToken);

      void runWithLock(() => synchronizeWithServer(accessToken, meEstab))
        .then((res) => {
          if (res === null) console.log('[sync] skipped login-triggered sync; another sync is in progress');
        })
        .catch((err) => console.warn('sync after login failed', err));

      return true;
    } catch (err) {
      console.warn('Failed to fetch /usuarios/me', err);
      return false;
    }
  };

  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = authClient.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      if (session?.access_token) {
        setLoading(true);
        await applySession(session.access_token);
        setLoading(false);
      } else {
        setUser(null);
        setToken(null);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (email: string, senha: string): Promise<boolean> => {
    setLoading(true);
    setMfaChallenge(null);
    try {
      const { data, error } = await authClient.signInWithPassword({ email, password: senha });

      if (error?.code === 'mfa_challenge_required') {
        const { data: factors } = await authClient.mfa.listFactors();
        const factorId = factors?.totp?.[0]?.id;
        if (factorId) {
          const { data: challenge } = await authClient.mfa.challenge({ factorId });
          if (challenge) setMfaChallenge({ factorId, challengeId: challenge.id });
        }
        return false;
      }

      if (error || !data.session) {
        console.warn('Login failed', error);
        return false;
      }

      return await applySession(data.session.access_token);
    } catch (err) {
      console.warn('Login failed', err);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const verifyMfa = async (code: string): Promise<boolean> => {
    if (!mfaChallenge) return false;
    setLoading(true);
    try {
      const { data, error } = await authClient.mfa.verify({ ...mfaChallenge, code });
      if (error || !data?.access_token) return false;
      setMfaChallenge(null);
      return await applySession(data.access_token);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    authClient.signOut();
    setUser(null);
    setToken(null);
    setMfaChallenge(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, mfaChallenge, verifyMfa, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export default AuthContext;
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx jest context/__tests__/AuthContext.test.tsx --watchAll=false`
Expected: PASS.

- [ ] **Step 5: Rodar a suíte inteira e checar tipos**

Run: `npx jest --watchAll=false && npx tsc --noEmit`
Expected: verde. Os 10 outros arquivos que consomem `useAuth()` (`AutoSyncContext`,
`CategoryOnboardingGate`, `pedidoModal`, `_layout` (tabs e raiz), `pedidos`, `historico`,
`contaModal`, `login`, `configs`) não devem quebrar — todos consomem só `user`/`token`/`loading`/
`login`/`logout`, que mantiveram a mesma assinatura.

- [ ] **Step 6: Commit**

```bash
git add context/AuthContext.tsx context/__tests__/AuthContext.test.tsx
git commit -m "feat(auth): AuthContext usa authClient (GoTrue), mantém interface pública"
```

---

### Task 3: `login.tsx` trata desafio de 2FA + `configs.tsx` não mostra erro errado

**Files:**
- Modify: `app/login.tsx`
- Modify: `app/(tabs)/configs.tsx:149-163`
- Test: `app/__tests__/login.test.tsx` (novo)

**Interfaces:**
- Consumes: `mfaChallenge`, `verifyMfa` do `AuthContext` (Task 2).
- Produces: nenhuma.

- [ ] **Step 1: Escrever o teste**

```typescript
// app/__tests__/login.test.tsx
import React from 'react';
import { act, create } from 'react-test-renderer';
import LoginScreen from '../login';

const mockLogin = jest.fn();
const mockVerifyMfa = jest.fn();

jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ login: mockLogin, mfaChallenge: mockLogin.mock.results.length ? { factorId: 'f1', challengeId: 'c1' } : null, verifyMfa: mockVerifyMfa }),
}));
jest.mock('@/components/useColorScheme', () => ({ useColorScheme: () => 'light' }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe('LoginScreen', () => {
  beforeEach(() => {
    mockLogin.mockReset();
    mockVerifyMfa.mockReset();
  });

  it('mostra o campo de código TOTP quando o contexto sinaliza mfaChallenge', async () => {
    mockLogin.mockResolvedValue(false);
    let root: ReturnType<typeof create>;
    await act(async () => {
      root = create(React.createElement(LoginScreen));
    });

    const loginButton = root!.root.findByProps({ accessibilityLabel: 'auth.login' });
    await act(async () => {
      await loginButton.props.onPress();
    });

    expect(root!.root.findAllByProps({ accessibilityLabel: 'auth.totpCode' }).length).toBe(1);
  });
});
```

(Ajuste `findByProps`/`accessibilityLabel` pro padrão exato que o resto do repo usa pra testar
telas — confira em `app/__tests__/onboarding.test.tsx` se o seletor usado lá é diferente, e siga
o mesmo.)

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx jest app/__tests__/login.test.tsx --watchAll=false`
Expected: FAIL — não existe campo de código TOTP na tela ainda.

- [ ] **Step 3: Adicionar o estado de desafio MFA em `login.tsx`**

```tsx
import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Alert } from 'react-native';
import { Image } from 'react-native';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import Colors from '@/constants/Colors';
import { useTranslation } from 'react-i18next';

export default function LoginScreen() {
  const { login, mfaChallenge, verifyMfa } = useAuth();
  const { t } = useTranslation();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !senha) {
      Alert.alert(t('auth.credentialsRequired'));
      return;
    }
    setLoading(true);
    try {
      const ok = await login(email, senha);
      if (!ok && !mfaChallenge) {
        Alert.alert(t('auth.loginFailedTitle'), t('auth.invalidCredentials'));
      }
    } catch (err) {
      console.warn('Login error:', err);
      Alert.alert(t('errors.generic'), t('auth.loginFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyMfa = async () => {
    if (!totpCode) return;
    setLoading(true);
    try {
      const ok = await verifyMfa(totpCode);
      if (!ok) {
        Alert.alert(t('auth.loginFailedTitle'), t('auth.invalidTotpCode'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Image
        source={require('../assets/images/logo-login.png')}
        style={styles.logo}
        resizeMode="contain"
        fadeDuration={0}
      />
      <Text style={[styles.title, { color: colors.text }]}>Tozzo.uk</Text>
      <View style={styles.form}>
        {mfaChallenge ? (
          <>
            <TextInput
              placeholder={t('auth.totpCodePlaceholder')}
              accessibilityLabel={t('auth.totpCode')}
              value={totpCode}
              onChangeText={setTotpCode}
              keyboardType="number-pad"
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
              placeholderTextColor={colors.textMuted}
            />
            <Button
              title={t('auth.confirm')}
              accessibilityLabel={t('auth.confirm')}
              onPress={handleVerifyMfa}
              loading={loading}
              disabled={loading}
              style={styles.button}
            />
          </>
        ) : (
          <>
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
            <Button
              title={t('auth.login')}
              accessibilityLabel={t('auth.login')}
              onPress={handleLogin}
              loading={loading}
              disabled={loading}
              style={styles.button}
            />
          </>
        )}
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
});
```

Adicione as chaves `auth.totpCode`, `auth.totpCodePlaceholder`, `auth.confirm`,
`auth.invalidTotpCode` nos 6 arquivos `i18n/locales/*/auth.json` (mesmo padrão das chaves
`auth.*` já existentes nesses arquivos).

- [ ] **Step 4: Ajustar `configs.tsx` pra não mostrar "credenciais inválidas" quando é MFA**

Em `app/(tabs)/configs.tsx:149-163`, importe `mfaChallenge` do contexto e ajuste:

```typescript
const { user, login, logout, token, mfaChallenge } = useAuth(); // linha 33, já existe — só adiciona mfaChallenge

const handleLogin = async () => {
  setLoginLoading(true);
  try {
    const ok = await login(email.trim(), senha);
    if (!ok) {
      if (mfaChallenge) {
        Alert.alert(t('auth.loginFailedTitle'), t('auth.totpRequiredUseMainLogin'));
      } else {
        Alert.alert(t('auth.loginFailedTitle'), t('auth.invalidCredentials'));
      }
    } else {
      setEmail('');
      setSenha('');
    }
  } catch (err) {
    Alert.alert(t('common.error'), t('auth.loginFailed'));
  } finally {
    setLoginLoading(false);
  }
};
```

Adicione a chave `auth.totpRequiredUseMainLogin` ("Esta conta tem 2FA ativo — saia e entre pela
tela de login principal") nos 6 locales.

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npx jest app/__tests__/login.test.tsx --watchAll=false`
Expected: PASS.

- [ ] **Step 6: Rodar a suíte inteira, i18n e tsc**

Run: `npx jest --watchAll=false && npx tsc --noEmit`
Expected: verde (inclui os testes de paridade de i18n já existentes —
`app/__tests__/i18nResources.test.tsx`/`i18nSurfaces.test.tsx` — que vão pegar qualquer chave
faltando em algum dos 6 idiomas).

- [ ] **Step 7: Commit**

```bash
git add app/login.tsx app/(tabs)/configs.tsx app/__tests__/login.test.tsx i18n/locales
git commit -m "feat(auth): desafio de 2FA no login.tsx, configs.tsx não confunde com credencial inválida"
```

---

### Task 4: Botão "Entrar com Google"

**Files:**
- Modify: `app/login.tsx`
- Test: `app/__tests__/login.test.tsx`

**Interfaces:**
- Consumes: `authClient.signInWithOAuth` (Task 1), `expo-web-browser`, `expo-linking` (já
  instalados).
- Produces: nenhuma.

- [ ] **Step 1: Escrever o teste**

```typescript
const mockOpenAuthSessionAsync = jest.fn();
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: (...args: unknown[]) => mockOpenAuthSessionAsync(...args) }));
jest.mock('@/services/authClient', () => ({
  authClient: { signInWithOAuth: jest.fn().mockResolvedValue({ data: { url: 'https://accounts.google.com/xyz' }, error: null }) },
}));

it('botão Google abre o browser de autenticação com a URL do GoTrue', async () => {
  mockOpenAuthSessionAsync.mockResolvedValue({ type: 'success', url: 'myapp://auth-callback#access_token=tok' });

  let root: ReturnType<typeof create>;
  await act(async () => {
    root = create(React.createElement(LoginScreen));
  });
  const googleButton = root!.root.findByProps({ accessibilityLabel: 'auth.continueWithGoogle' });
  await act(async () => {
    await googleButton.props.onPress();
  });

  expect(mockOpenAuthSessionAsync).toHaveBeenCalledWith('https://accounts.google.com/xyz', 'myapp://auth-callback');
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx jest app/__tests__/login.test.tsx --watchAll=false`
Expected: FAIL — botão não existe.

- [ ] **Step 3: Adicionar o botão e o fluxo OAuth**

```tsx
import * as WebBrowser from 'expo-web-browser';
import { authClient } from '@/services/authClient';

// dentro do componente, junto dos outros handlers:
const handleGoogleSignIn = async () => {
  const { data, error } = await authClient.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: 'myapp://auth-callback', skipBrowserRedirect: true },
  });
  if (error || !data?.url) {
    Alert.alert(t('errors.generic'), t('auth.loginFailed'));
    return;
  }
  const result = await WebBrowser.openAuthSessionAsync(data.url, 'myapp://auth-callback');
  if (result.type === 'success' && result.url) {
    // auth-js extrai o token do fragmento da URL de retorno e atualiza a sessão sozinho —
    // basta entregar a URL completa pra ele.
    await authClient.initialize(); // força reprocessar a sessão persistida/URL de retorno
  }
};
```

E o botão, abaixo do form (fora do `if (mfaChallenge)`, só aparece na tela de login normal):

```tsx
{!mfaChallenge && (
  <Button
    title={t('auth.continueWithGoogle')}
    accessibilityLabel={t('auth.continueWithGoogle')}
    onPress={handleGoogleSignIn}
    style={styles.button}
  />
)}
```

Adicione a chave `auth.continueWithGoogle` nos 6 locales (mesmo texto usado no front web, pra
consistência).

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx jest app/__tests__/login.test.tsx --watchAll=false`
Expected: PASS.

- [ ] **Step 5: Rodar a suíte inteira e tsc**

Run: `npx jest --watchAll=false && npx tsc --noEmit`
Expected: verde.

- [ ] **Step 6: Commit**

```bash
git add app/login.tsx app/__tests__/login.test.tsx i18n/locales
git commit -m "feat(auth): botão Entrar com Google via expo-web-browser + auth-js OAuth"
```

---

### Task 5: "Esqueci minha senha" abre o fluxo web

**Files:**
- Modify: `app/login.tsx`
- Test: `app/__tests__/login.test.tsx`

**Interfaces:**
- Consumes: `authClient.resetPasswordForEmail` (Task 1).
- Produces: nenhuma.

- [ ] **Step 1: Escrever o teste**

```typescript
it('esqueci senha chama resetPasswordForEmail com o email digitado', async () => {
  const resetMock = jest.fn().mockResolvedValue({ data: {}, error: null });
  jest.mock('@/services/authClient', () => ({ authClient: { resetPasswordForEmail: resetMock } }));

  let root: ReturnType<typeof create>;
  await act(async () => {
    root = create(React.createElement(LoginScreen));
  });
  const emailInput = root!.root.findByProps({ accessibilityLabel: 'auth.email' });
  await act(async () => {
    emailInput.props.onChangeText('ana@example.com');
  });
  const forgotButton = root!.root.findByProps({ accessibilityLabel: 'auth.forgotPassword' });
  await act(async () => {
    await forgotButton.props.onPress();
  });

  expect(resetMock).toHaveBeenCalledWith('ana@example.com');
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx jest app/__tests__/login.test.tsx --watchAll=false`
Expected: FAIL — botão não existe.

- [ ] **Step 3: Adicionar o link/botão**

```tsx
const handleForgotPassword = async () => {
  if (!email) {
    Alert.alert(t('auth.forgotPasswordEmailRequired'));
    return;
  }
  await authClient.resetPasswordForEmail(email);
  Alert.alert(t('auth.forgotPasswordEmailSentTitle'), t('auth.forgotPasswordEmailSentBody'));
};
```

E, abaixo do botão de login (só na tela de login normal, fora do `mfaChallenge`):

```tsx
<Button
  title={t('auth.forgotPassword')}
  accessibilityLabel={t('auth.forgotPassword')}
  onPress={handleForgotPassword}
  style={styles.button}
/>
```

Adicione `auth.forgotPassword`, `auth.forgotPasswordEmailRequired`,
`auth.forgotPasswordEmailSentTitle`, `auth.forgotPasswordEmailSentBody` nos 6 locales.

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx jest app/__tests__/login.test.tsx --watchAll=false`
Expected: PASS.

- [ ] **Step 5: Rodar a suíte inteira e tsc**

Run: `npx jest --watchAll=false && npx tsc --noEmit`
Expected: verde.

- [ ] **Step 6: Commit**

```bash
git add app/login.tsx app/__tests__/login.test.tsx i18n/locales
git commit -m "feat(auth): esqueci minha senha dispara resetPasswordForEmail do auth-js"
```

---

### Task 6: Remove `login()` obsoleto de `services/api.ts`

**Files:**
- Modify: `services/api.ts:130-152` (remove a função `login`)

**Interfaces:**
- Consumes: nada.
- Produces: nada (remoção pura — `getMe` continua igual, `AuthContext` da Task 2 já não chama
  mais `api.login`).

- [ ] **Step 1: Confirmar que nada mais chama `api.login`**

Depois das Tasks 1-5, `AuthContext.tsx` já não importa `api.login` (só `api.getMe`). Confirme
que nenhum outro arquivo do repo chama `login(` importado de `@/services/api` (o único
consumidor era o `AuthContext` antigo).

- [ ] **Step 2: Remover a função**

Delete `export async function login(...)` (linhas 130-152 de `services/api.ts`) — o endpoint
`POST /auth/login` que ela chamava não existe mais na api (removido no plano da api, Task 6).

- [ ] **Step 3: Rodar a suíte inteira e tsc**

Run: `npx jest --watchAll=false && npx tsc --noEmit`
Expected: verde, sem import quebrado.

- [ ] **Step 4: Commit**

```bash
git add services/api.ts
git commit -m "refactor(auth): remove login() obsoleto de services/api.ts (GoTrue assume login)"
```

---

## Self-Review (feito ao escrever este plano)

- **Cobertura da spec**: `authClient`+`LargeSecureStore` (Task 1), `AuthContext` (Task 2),
  desafio 2FA no login (Task 3), Google Sign-In (Task 4), esqueci senha (Task 5), limpeza do
  código morto de login antigo (Task 6) — cobre toda a seção "Mobile" da spec. Setup de 2FA
  (fora de escopo, decisão da spec) e cadastro/registro (app não tem essa tela) não entram.
- **Sem placeholder**: toda task tem código real.
- **Consistência de tipo**: `login(): Promise<boolean>` mantido idêntico nos 2 call sites
  (`login.tsx` Task 3, `configs.tsx` Task 3) — `mfaChallenge`/`verifyMfa` são aditivos, não
  quebram a assinatura que os outros 9 arquivos consumidores de `useAuth()` já esperam.
