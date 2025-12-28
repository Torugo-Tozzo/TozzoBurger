import React, { useState, useRef, useEffect } from 'react';
import { TouchableOpacity, View, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useAutoSync } from '@/context/AutoSyncContext';

export default function SyncIndicator() {
  const { isSyncing, triggerSync } = useAutoSync();
  const { lastSyncResult } = useAutoSync();
  const lastHandledResultRef = useRef<number | null>(null);
  const [localLoading, setLocalLoading] = useState(false);
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const [result, setResult] = useState<'idle' | 'success' | 'error'>('idle');
  const resultTimerRef = useRef<number | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; if (resultTimerRef.current) clearTimeout(resultTimerRef.current as any); };
  }, []);

  // react to automatic sync results
  useEffect(() => {
    const r = lastSyncResult;
    if (!r || typeof r.time !== 'number') return;
    if (lastHandledResultRef.current === r.time) return; // already handled
    lastHandledResultRef.current = r.time;
    if (r.ok) {
      setResult('success');
      if (resultTimerRef.current) clearTimeout(resultTimerRef.current as any);
      resultTimerRef.current = setTimeout(() => { if (mountedRef.current) setResult('idle'); }, 1500) as any;
    } else {
      setResult('error');
      if (resultTimerRef.current) clearTimeout(resultTimerRef.current as any);
      resultTimerRef.current = setTimeout(() => { if (mountedRef.current) setResult('idle'); }, 2500) as any;
      const nice = /network|offline|internet|ENOTFOUND|Network request failed/i.test(r.message ?? '') ? 'Sem internet. Verifique sua conexão.' : (r.message ?? 'Falha na sincronização');
      Alert.alert('Sincronização falhou', nice);
    }
  }, [lastSyncResult]);

  const handlePress = async () => {
    if (inFlightRef.current || isSyncing) return;
    inFlightRef.current = true;
    setLocalLoading(true);

    const minimum = 2000;
    const start = Date.now();

    let ok = true;
    let errorMsg: string | null = null;
    let res: any = null;
    try {
      res = await triggerSync();
    } catch (e: any) {
      ok = false;
      errorMsg = e?.message ?? String(e);
      console.warn('triggerSync error', e);
    }

    if (res === null || typeof res === 'undefined') {
      ok = false;
      if (!errorMsg) errorMsg = 'Sem resposta do servidor';
    }

    const elapsed = Date.now() - start;
    const remaining = Math.max(0, minimum - elapsed);
    if (remaining > 0) await new Promise((r) => setTimeout(r, remaining));

    if (!mountedRef.current) return;

    setLocalLoading(false);
    inFlightRef.current = false;

    if (ok) {
      setResult('success');
      if (resultTimerRef.current) clearTimeout(resultTimerRef.current as any);
      resultTimerRef.current = setTimeout(() => { if (mountedRef.current) setResult('idle'); }, 1500) as any;
    } else {
      setResult('error');
      if (resultTimerRef.current) clearTimeout(resultTimerRef.current as any);
      resultTimerRef.current = setTimeout(() => { if (mountedRef.current) setResult('idle'); }, 2500) as any;
      const nice = /network|offline|internet|ENOTFOUND|Network request failed/i.test(errorMsg ?? '') ? 'Sem internet. Verifique sua conexão.' : (errorMsg ?? 'Falha na sincronização');
      Alert.alert('Sincronização falhou', nice);
    }
  };

  const disabled = isSyncing || localLoading || result === 'success' || result === 'error';

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={[styles.container, disabled ? styles.disabled : undefined]}
      accessibilityLabel="sync-button"
      disabled={disabled}
    >
      <View style={styles.inner}>
        { (isSyncing || localLoading) ? (
          <ActivityIndicator size="small" color="#007AFF" />
        ) : result === 'success' ? (
          <FontAwesome name="check" size={18} color="#28a745" />
        ) : result === 'error' ? (
          <FontAwesome name="times" size={18} color="#dc3545" />
        ) : (
          <FontAwesome name="refresh" size={20} color="#007AFF" />
        ) }
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  inner: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
});
