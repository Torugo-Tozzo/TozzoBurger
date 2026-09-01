import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { Platform } from 'react-native';
import * as api from '@/services/api';
import * as SecureStore from 'expo-secure-store';
import { getOrCreateDeviceId } from '@/services/deviceId';
import { cachePlan } from '@/services/planCache';
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

type AuthContextData = {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, senha: string) => Promise<boolean>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextData | undefined>(undefined);

const TOKEN_KEY = 'tozzo_token_v1';
const USER_CACHE_KEY = 'tozzo_user_cache_v1';

async function cacheUser(user: User) {
  try {
    await SecureStore.setItemAsync(USER_CACHE_KEY, JSON.stringify(user));
  } catch (err) {
    console.warn('Failed to persist user cache to SecureStore', err);
  }
}

async function readCachedUser(): Promise<User | null> {
  try {
    const raw = await SecureStore.getItemAsync(USER_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('Failed to read user cache from SecureStore', err);
    return null;
  }
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Rehydrate token on mount and validate it
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const stored = await SecureStore.getItemAsync(TOKEN_KEY);
        if (stored && mounted) {
          setToken(stored);
          try {
            const me = await api.getMe(stored);
            if (me && mounted) {
              setUser(me);
              await cacheUser(me);
            }
          } catch (err: any) {
            // Only clear token on explicit auth errors (401/402/403).
            // For network/server errors (offline) keep the stored token.
            const status = err?.response?.status ?? err?.status ?? null;
            if (status === 401 || status === 402 || status === 403) {
              console.warn('Stored token invalid, clearing', err);
              await SecureStore.deleteItemAsync(TOKEN_KEY);
              if (mounted) {
                setToken(null);
                setUser(null);
              }
            } else {
              console.warn('Network/server error validating token — keeping stored token', err);
              const prev = await readCachedUser();
              if (prev && mounted) {
                setUser(prev);
              }
            }
          }
        }
      } catch (err) {
        console.warn('Failed to load token from SecureStore', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const login = async (email: string, senha: string) => {
    setLoading(true);
    try {
      const body = await api.login(email, senha);
      // Expect the API to return an object that includes a token string.
      // Common keys: token, accessToken. Try both.
      const t = body?.token ?? body?.accessToken ?? body?.access_token ?? null;
      if (!t) return false;
      try {
        await SecureStore.setItemAsync(TOKEN_KEY, t);
      } catch (err) {
        console.warn('Failed to persist token to SecureStore', err);
      }

      // Fetch user profile
      try {
        const me = await api.getMe(t);
        if (!me) {
          console.warn('Failed to fetch /usuarios/me: empty profile');
          return false;
        }
        setUser(me);

        const prev = await readCachedUser();
        const meEstab = (me as any)?.establishmentId ?? null;
        if (prev && String(prev.establishmentId) !== String(meEstab)) {
          await resetWatermelonLocalData().catch((e) => console.warn('[auth] Watermelon local data reset failed', e));
        }
        await cacheUser(me);

        setToken(t);
        void (async () => {
          try {
            const deviceId = await getOrCreateDeviceId();
            await api.registerDevice(t, deviceId, { platform: Platform.OS });
          } catch (err: any) {
            if (err?.code === 'DEVICE_LIMIT_REACHED') {
              console.warn('[auth] device limit reached, printing/report gates will use fail-closed cache defaults');
            } else {
              console.warn('[auth] device registration failed (non-blocking)', err);
            }
          }

          try {
            const establishment = await api.getEstablishment(t);
            if (establishment && typeof establishment.plan === 'string') {
              await cachePlan(establishment.plan);
            }
          } catch (err) {
            console.warn('[auth] failed to prime plan cache (non-blocking)', err);
          }
        })();

        // The first sync must not block navigation. The list screens show their
        // skeletons while this background sync populates the local database.
        void runWithLock(() => synchronizeWithServer(t, (me as any)?.establishmentId))
          .then((res) => {
            if (res === null) console.log('[sync] skipped login-triggered sync; another sync is in progress');
          })
          .catch((err) => console.warn('sync after login failed', err));
        
      } catch (err) {
        console.warn('Failed to fetch /usuarios/me', err);
        return false;
      }

      return true;
    } catch (err) {
      console.warn('Login failed', err);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    SecureStore.deleteItemAsync(TOKEN_KEY).catch((err) => console.warn('Failed to delete token', err));
    SecureStore.deleteItemAsync(USER_CACHE_KEY).catch((err) => console.warn('Failed to delete user cache', err));
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
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
