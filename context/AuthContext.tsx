import React, { createContext, useContext, useState, ReactNode, useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import * as api from '@/services/api';
import { authClient } from '@/services/authClient';
import * as SecureStore from 'expo-secure-store';
import { getOrCreateDeviceId } from '@/services/deviceId';
import { cachePlan, clearCachedPlan } from '@/services/planCache';
import { clearReportQuota } from '@/services/reportQuota';
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
const DATA_OWNER_KEY = 'tozzo_local_data_owner_v1';

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

// Chamado tanto no login quanto na restauração de sessão (app reaberto com
// token já salvo) — sem isso, um dispositivo que nunca refaz login depois de
// instalar essa feature nunca aparece em "Dispositivos em uso" nem conta pro
// limite de dispositivos do plano. registerDevice é idempotente por device id
// (upsert no servidor), seguro de chamar toda vez que a sessão é validada.
async function syncDeviceAndPlan(token: string, establishmentId: number | string | null | undefined) {
  try {
    const deviceId = await getOrCreateDeviceId();
    await api.registerDevice(token, deviceId, { platform: Platform.OS });
  } catch (err: any) {
    // Workaround while the API returns only a localized message rather than a structured
    // DEVICE_LIMIT_REACHED code for this endpoint.
    if (/limite de dispositivos atingido/i.test(String(err?.message ?? ''))) {
      console.warn('[auth] device limit reached, printing/report gates will use fail-closed cache defaults');
    } else {
      console.warn('[auth] device registration failed (non-blocking)', err);
    }
  }

  try {
    const establishment = await api.getEstablishment(token);
    if (establishment && typeof establishment.plan === 'string' && establishmentId != null) {
      await cachePlan(establishment.plan, establishmentId);
    }
  } catch (err) {
    console.warn('[auth] failed to prime plan cache (non-blocking)', err);
  }
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const acceptedSession = useRef(false);
  const revision = useRef(0);
  const currentUser = useRef<User | null>(null);

  const clearLocalSession = () => {
    acceptedSession.current = false;
    revision.current++;
    const establishmentId = currentUser.current?.establishmentId;
    currentUser.current = null;
    setToken(null);
    setUser(null);
    void SecureStore.deleteItemAsync(TOKEN_KEY).catch(console.warn);
    void SecureStore.deleteItemAsync(USER_CACHE_KEY).catch(console.warn);
    if (establishmentId != null) {
      void Promise.resolve(clearCachedPlan(establishmentId)).catch(console.warn);
      void Promise.resolve(clearReportQuota(establishmentId)).catch(console.warn);
    }
  };

  useEffect(() => {
    let mounted = true;
    const initialRevision = revision.current;
    const { data: { subscription } } = authClient.onAuthStateChange((event, session) => {
      // Keep this callback synchronous: auth-js may hold its session lock here.
      if (!mounted) return;
      if (event === 'SIGNED_OUT') clearLocalSession();
      if (event === 'TOKEN_REFRESHED' && acceptedSession.current && session) {
        setToken(session.access_token);
      }
    });
    const refreshForState = (state: string) => {
      if (state === 'active') void authClient.startAutoRefresh();
      else void authClient.stopAutoRefresh();
    };
    const appStateSubscription = AppState.addEventListener('change', refreshForState);
    const load = async () => {
      try {
        // A legacy API token cannot be exchanged for a GoTrue refresh token.
        await SecureStore.deleteItemAsync(TOKEN_KEY);
        const { data, error } = await authClient.getSession();
        if (error) throw error;
        const session = data.session;
        if (!session) return;
        let me: User | null;
        try {
          me = await api.getMe(session.access_token);
        } catch (error: any) {
          if ([401, 403, 410].includes(error?.status)) {
            await authClient.signOut({ scope: 'local' });
            clearLocalSession();
            return;
          }
          if (error?.status === 402) return;
          me = await readCachedUser();
          if (session.user?.id && String(me?.id) !== session.user.id) me = null;
        }
        if (!me || !mounted || revision.current !== initialRevision) return;
        await cacheUser(me);
        if (!mounted || revision.current !== initialRevision) return;
        currentUser.current = me;
        acceptedSession.current = true;
        setUser(me);
        setToken(session.access_token);
        void syncDeviceAndPlan(session.access_token, me.establishmentId);
      } catch (error) {
        console.warn('[auth] Session restoration failed', error);
      } finally {
        if (mounted) {
          setLoading(false);
          refreshForState(AppState.currentState);
        }
      }
    };
    void load();
    return () => {
      mounted = false;
      revision.current++;
      subscription.unsubscribe();
      appStateSubscription.remove();
      void authClient.stopAutoRefresh();
    };
  }, []);

  const login = async (email: string, password: string) => {
    const attempt = ++revision.current;
    setLoading(true);
    try {
      const { data, error } = await authClient.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      if (!data.session) return false;
      const accessToken = data.session.access_token;
      const me = await api.getMe(accessToken);
      if (!me || revision.current !== attempt) return false;
      const previous = await readCachedUser();
      const dataOwner = await SecureStore.getItemAsync(DATA_OWNER_KEY) ?? previous?.establishmentId;
      if (String(dataOwner) !== String(me.establishmentId)) {
        // Do not expose a different account until the previous local data is gone.
        // runWithLock coalesces queued syncs; ensure OUR reset actually executed.
        let reset = false;
        while (!reset) {
          if (revision.current !== attempt) return false;
          await runWithLock(async () => {
            await resetWatermelonLocalData();
            reset = true;
          });
        }
      }
      if (revision.current !== attempt) return false;
      await SecureStore.setItemAsync(DATA_OWNER_KEY, String(me.establishmentId));
      await cacheUser(me);
      if (revision.current !== attempt) return false;
      currentUser.current = me;
      acceptedSession.current = true;
      setUser(me);
      setToken(accessToken);
      void syncDeviceAndPlan(accessToken, me.establishmentId);
      void runWithLock(() => synchronizeWithServer(accessToken, me.establishmentId))
        .catch((error) => console.warn('sync after login failed', error));
      return true;
    } catch (error) {
      console.warn('Login failed', error);
      if (revision.current === attempt) {
        clearLocalSession();
        await authClient.signOut({ scope: 'local' }).catch(console.warn);
      }
      return false;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    clearLocalSession();
    void authClient.signOut({ scope: 'local' }).catch((error) => console.warn('[auth] Sign out failed', error));
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
