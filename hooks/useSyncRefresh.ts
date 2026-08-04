import { useCallback, useState } from 'react';
import { useAutoSync } from '@/context/AutoSyncContext';

/**
 * Pull-to-refresh que dispara a sincronização — mesma lógica do botão de sync
 * (useAutoSync().triggerSync). Retorna props prontas pro RefreshControl.
 * Erros continuam sendo tratados pelo SyncIndicator (reage a lastSyncResult).
 */
export function useSyncRefresh() {
  const { triggerSync, isSyncing } = useAutoSync();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    // Já sincronizando (botão de sync ou auto-sync) — ignora o pull.
    // Espelha o guard do SyncIndicator; evita sync redundante e spinner duplo.
    if (isSyncing) return;
    setRefreshing(true);
    try {
      await triggerSync();
    } finally {
      setRefreshing(false);
    }
  }, [triggerSync, isSyncing]);

  // Spinner só quando o próprio pull disparou. Não espelha isSyncing global,
  // senão auto-sync (login/reconexão/foreground) piscaria o spinner sem o user puxar.
  return { refreshing, onRefresh };
}

export default useSyncRefresh;
