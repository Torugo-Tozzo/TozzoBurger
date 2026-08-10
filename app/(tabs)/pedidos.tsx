import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Alert, FlatList, RefreshControl } from 'react-native';
import { View, Text } from '@/components/Themed';
import { usePedidosDatabase } from '@/database/usePedidoDatabase';
import { useAutoSync } from '@/context/AutoSyncContext';
import PedidoItem from '@/components/PedidoItem';
import { EmptyState } from '@/components/ui/EmptyState';
import { RecordCardSkeleton } from '@/components/ui/RecordCardSkeleton';
import { ListFrame } from '@/components/ui/ListFrame';
import { ListDivider } from '@/components/ui/ListDivider';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useSyncRefresh } from '@/hooks/useSyncRefresh';
import { useMinLoadingDuration } from '@/hooks/useMinLoadingDuration';
import { useShouldReload } from '@/hooks/useShouldReload';
import { spacing, type } from '@/constants/theme';
import { PedidoDatabase } from '@/database/types/Pedido';

type PedidoComProdutos = PedidoDatabase & { produtos: string[] };

// Evita re-render de toda a lista (perde React.memo dos cards) quando o
// refetch em foco de aba traz o mesmo conteudo de antes - so muda o estado
// se algo de fato mudou.
function isPedidosPorDataEqual(
  a: Record<string, PedidoComProdutos[]>,
  b: Record<string, PedidoComProdutos[]>
): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    const aList = a[key];
    const bList = b[key];
    if (!bList || aList.length !== bList.length) return false;
    for (let i = 0; i < aList.length; i++) {
      if (aList[i].id !== bList[i].id || aList[i].updated_at !== bList[i].updated_at) return false;
    }
  }
  return true;
}

export default function Pedidos() {
  const { listPedidosRecentes, listPedidosRecentesPorUsuario, removePedido } = usePedidosDatabase();
  const { lastSync } = useAutoSync();
  const { user } = useAuth();
  const { refreshing, onRefresh } = useSyncRefresh();
  const shouldReloadPedidos = useShouldReload(['pedidos', 'produtos']);
  const isCliente = user?.role === 'CLIENTE';
  const [pedidosPorData, setPedidosPorData] = useState<Record<string, PedidoComProdutos[]>>({});
  const [isLoading, setIsLoading] = useState(true);

  async function load() {
    setIsLoading(true);
    try {
      const data = isCliente && user?.id
        ? await listPedidosRecentesPorUsuario(user.id)
        : await listPedidosRecentes();
      setPedidosPorData((prev) => (isPedidosPorDataEqual(prev, data) ? prev : data));
    } catch (err) {
      console.error('Erro ao carregar pedidos:', err);
    } finally {
      setIsLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      if (shouldReloadPedidos()) load();
    }, [])
  );

  useEffect(() => {
    if (shouldReloadPedidos()) load();
  }, [lastSync]);

  const handleEdit = (pedidoId: string) => {
    router.push({ pathname: '/modais/pedidoModal', params: { pedidoId } });
  };

  const handleDelete = (pedidoId: string) => {
    Alert.alert('Confirmação', 'Deseja excluir este pedido?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: async () => { await removePedido(pedidoId); await load(); } },
    ]);
  };

  const renderPedido = (pedido: PedidoComProdutos) => (
    <PedidoItem
      key={pedido.id}
      data={pedido}
      produtos={pedido.produtos}
      onEdit={() => handleEdit(pedido.id)}
      onDelete={isCliente ? undefined : () => handleDelete(pedido.id)}
    />
  );

  // Skeleton cheio so no primeiro load (sem dado nenhum ainda) - mostrar ele
  // toda vez que ja tem dado na tela fazia a lista "piscar" (dado -> skeleton
  // -> dado de novo), parecendo recarregar 2x. Com dado ja carregado, o
  // refetch em foco usa o spinner do RefreshControl (nao esconde a lista).
  const hasData = Object.keys(pedidosPorData).length > 0;
  const showSkeleton = useMinLoadingDuration(isLoading && !hasData);

  if (showSkeleton) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Pedidos Recentes</Text>
        <ListFrame>
          <RecordCardSkeleton />
          <ListDivider />
          <RecordCardSkeleton />
          <ListDivider />
          <RecordCardSkeleton />
          <ListDivider />
          <RecordCardSkeleton />
          <ListDivider />
          <RecordCardSkeleton />
        </ListFrame>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pedidos Recentes</Text>
      <FlatList
        data={Object.keys(pedidosPorData)}
        keyExtractor={(d) => d}
        refreshControl={<RefreshControl refreshing={refreshing || isLoading} onRefresh={onRefresh} />}
        ListEmptyComponent={<EmptyState icon="list" title="Nenhum pedido recente" message="Pedidos aparecem aqui assim que forem criados." />}
        renderItem={({ item: dataKey }) => (
          <View style={styles.group}>
            <Text style={styles.date}>{dataKey}</Text>
            <ListFrame>
              {(pedidosPorData[dataKey] || []).map((p, idx) => (
                <React.Fragment key={p.id}>
                  {idx > 0 ? <ListDivider /> : null}
                  {renderPedido(p)}
                </React.Fragment>
              ))}
            </ListFrame>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg },
  title: { fontSize: type.title, fontWeight: 'bold', marginBottom: spacing.md },
  group: { marginBottom: spacing.xl },
  date: { fontSize: type.body, fontWeight: '600', marginBottom: spacing.sm },
});
