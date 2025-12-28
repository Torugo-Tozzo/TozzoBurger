import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useSQLiteContext } from 'expo-sqlite';
import { useAuth } from '@/context/AuthContext';
import { sincronizarComServidor } from '@/database/useSyncDatabase';
import { runWithLock } from '@/database/syncGuard';

type LastSyncResult = { ok: boolean | null; message?: string | null; time?: number | null };

type AutoSyncContextType = {
  isSyncing: boolean;
  lastSync: number | null;
  lastSyncResult: LastSyncResult;
  triggerSync: () => Promise<any | null | undefined>;
};

const AutoSyncContext = createContext<AutoSyncContextType | undefined>(undefined);

export const AutoSyncProvider = ({ children }: { children: React.ReactNode }) => {
  const database = useSQLiteContext();
  const { token } = useAuth();
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [lastSyncResult, setLastSyncResult] = useState<LastSyncResult>({ ok: null, message: null, time: null });
  const pendingRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState as AppStateStatus);

  const doSync = async () => {
    if (!token) return null;
    if (isSyncing) {
      pendingRef.current = true;
      return null;
    }

    // Use global lock to avoid parallel syncs initiated from other places
    let res: any = null;
    try {
      res = await runWithLock(async () => {
        setIsSyncing(true);
        try {
          return await sincronizarComServidor(database as any, token);
        } finally {
          setIsSyncing(false);
        }
      });
    } catch (err: any) {
      // sync threw — record failure and return
      const msg = err?.message ?? String(err);
      setLastSyncResult({ ok: false, message: msg, time: Date.now() });
      console.warn('AutoSync failed', err);
      // schedule pending retry if needed
      if (pendingRef.current) {
        pendingRef.current = false;
        setTimeout(() => doSync(), 800);
      }
      return null;
    }

    if (res === null) {
      // someone else is syncing; schedule a retry
      pendingRef.current = true;
      return res;
    }

    try {
      const serverTime = res && (res.serverTime || res.now || res.timestamp) ? res.serverTime || res.now || res.timestamp : null;
      const parsed = serverTime ? (typeof serverTime === 'string' ? Date.parse(serverTime) : Number(serverTime)) : Date.now();
      setLastSync(!Number.isNaN(parsed) ? parsed : Date.now());
      setLastSyncResult({ ok: true, message: null, time: Date.now() });
    } catch (err) {
      console.warn('AutoSync post-sync handling failed', err);
      setLastSyncResult({ ok: false, message: String(err ?? 'post-sync error'), time: Date.now() });
    } finally {
      if (pendingRef.current) {
        pendingRef.current = false;
        // small delay to avoid tight loops
        setTimeout(() => doSync(), 800);
      }
    }

    return res;
  };

  useEffect(() => {
    const handleAppState = (next: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if ((prev === 'background' || prev === 'inactive') && next === 'active') {
        doSync().catch(() => {});
      }
    };

    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, [token]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = state.isConnected ?? state.isInternetReachable ?? false;
      if (connected) {
        doSync().catch(() => {});
      }
    });
    return () => unsubscribe();
  }, [token]);

  // Optionally do an initial sync when token becomes available
  useEffect(() => {
    if (token) {
      // slight delay to allow DB to be ready
      const t = setTimeout(() => { doSync().catch(() => {}); }, 500);
      return () => clearTimeout(t);
    }
    return;
  }, [token]);

  const value: AutoSyncContextType = {
    isSyncing,
    lastSync,
    lastSyncResult,
    triggerSync: async () => doSync(),
  };

  return <AutoSyncContext.Provider value={value}>{children}</AutoSyncContext.Provider>;
};

export const useAutoSync = () => {
  const ctx = useContext(AutoSyncContext);
  if (!ctx) throw new Error('useAutoSync must be used within AutoSyncProvider');
  return ctx;
};

export default AutoSyncContext;
