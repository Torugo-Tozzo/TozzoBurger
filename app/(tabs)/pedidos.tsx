import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Alert, FlatList, RefreshControl } from 'react-native';
import { View, Text } from '@/components/Themed';
import { useOrderDatabase } from '@/database/useOrderDatabase';
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
import { Order } from '@/database/types/Order';

type OrderWithProducts = Order & { products: string[] };

// Evita re-render de toda a lista (perde React.memo dos cards) quando o
// refetch em foco de aba traz o mesmo conteudo de antes - so muda o estado
// se algo de fato mudou.
function isPedidosPorDataEqual(
  a: Record<string, OrderWithProducts[]>,
  b: Record<string, OrderWithProducts[]>
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
  const { listRecentOrders, listRecentOrdersByUser, removeOrder } = useOrderDatabase();
  const { lastSync } = useAutoSync();
  const { user } = useAuth();
  const { refreshing, onRefresh } = useSyncRefresh();
  const shouldReloadPedidos = useShouldReload(['orders', 'products']);
  const isCliente = user?.role === 'CUSTOMER';
  const [ordersByDate, setOrdersByDate] = useState<Record<string, OrderWithProducts[]>>({});
  const [isLoading, setIsLoading] = useState(true);

  async function load() {
    setIsLoading(true);
    try {
      const data = isCliente && user?.id
        ? await listRecentOrdersByUser(user.id)
        : await listRecentOrders();
      setOrdersByDate((prev) => (isPedidosPorDataEqual(prev, data) ? prev : data));
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

  const handleEdit = (orderId: string) => {
    router.push({ pathname: '/modais/pedidoModal', params: { orderId } });
  };

  const handleDelete = (orderId: string) => {
    Alert.alert('Confirmação', 'Deseja excluir este pedido?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: async () => { await removeOrder(orderId); await load(); } },
    ]);
  };

  const renderOrder = (order: OrderWithProducts) => (
    <PedidoItem
      key={order.id}
      data={order}
      products={order.products}
      onEdit={() => handleEdit(order.id)}
      onDelete={isCliente ? undefined : () => handleDelete(order.id)}
    />
  );

  // Skeleton cheio so no primeiro load (sem dado nenhum ainda) - mostrar ele
  // toda vez que ja tem dado na tela fazia a lista "piscar" (dado -> skeleton
  // -> dado de novo), parecendo recarregar 2x. Com dado ja carregado, o
  // refetch em foco usa o spinner do RefreshControl (nao esconde a lista).
  const hasData = Object.keys(ordersByDate).length > 0;
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
      <FlatList
        data={Object.keys(ordersByDate)}
        keyExtractor={(d) => d}
        refreshControl={<RefreshControl refreshing={refreshing || isLoading} onRefresh={onRefresh} />}
        ListEmptyComponent={<EmptyState icon="list" title="Nenhum pedido recente" message="Pedidos aparecem aqui assim que forem criados." />}
        renderItem={({ item: dataKey }) => (
          <View style={styles.group}>
            <Text style={styles.date}>{dataKey}</Text>
            <ListFrame>
              {(ordersByDate[dataKey] || []).map((p, idx) => (
                <React.Fragment key={p.id}>
                  {idx > 0 ? <ListDivider /> : null}
                  {renderOrder(p)}
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
  container: { flex: 1, paddingTop: spacing.lg, borderColor: 'black', borderWidth: 1 },
  title: { fontSize: type.title, fontWeight: 'bold', marginBottom: spacing.md, paddingHorizontal: spacing.lg },
  group: { marginBottom: spacing.xl },
  date: { fontSize: type.body, fontWeight: '600', marginBottom: spacing.sm, paddingHorizontal: spacing.lg },
});
