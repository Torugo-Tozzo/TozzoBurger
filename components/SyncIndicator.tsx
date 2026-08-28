import React, { useState, useRef, useEffect } from 'react';
import { TouchableOpacity, View, ActivityIndicator, StyleSheet, Alert, useColorScheme } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useAutoSync } from '@/context/AutoSyncContext';
import Colors from '@/constants/Colors';
import { i18n } from '@/i18n';
import { useTranslation } from 'react-i18next';

export default function SyncIndicator() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const { t } = useTranslation();
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
      const nice = /network|offline|internet|ENOTFOUND|Network request failed/i.test(r.message ?? '')
        ? i18n.t('sync.noConnectionMessage')
        : i18n.t('sync.genericError');
      Alert.alert(i18n.t('sync.syncFailedTitle'), nice);
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

    // The native Watermelon synchronize() resolves void on success. Only a
    // null result means the caller was skipped because no token/lock cycle ran.
    if (res === null) {
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
      const nice = /network|offline|internet|ENOTFOUND|Network request failed/i.test(errorMsg ?? '')
        ? i18n.t('sync.noConnectionMessage')
        : i18n.t('sync.genericError');
      Alert.alert(i18n.t('sync.syncFailedTitle'), nice);
    }
  };

  const disabled = isSyncing || localLoading || result === 'success' || result === 'error';

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={[styles.container, disabled ? styles.disabled : undefined]}
      accessibilityLabel={
        (isSyncing || localLoading) ? t('sync.syncing')
          : result === 'success' ? t('sync.synced')
            : result === 'error' ? t('sync.syncFailedTitle')
              : t('sync.accessibilityLabel')
      }
      disabled={disabled}
    >
      <View style={styles.inner}>
        { (isSyncing || localLoading) ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : result === 'success' ? (
          <FontAwesome name="check" size={18} color={colors.primary} />
        ) : result === 'error' ? (
          <FontAwesome name="times" size={18} color={Colors.status.danger} />
        ) : (
          <FontAwesome name="refresh" size={20} color={colors.primary} />
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
