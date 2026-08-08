import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Alert, FlatList, RefreshControl } from 'react-native';
import { View, Text } from '@/components/Themed';
import { usePedidosDatabase } from '@/database/usePedidoDatabase';
import { useAutoSync } from '@/context/AutoSyncContext';
import PedidoItem from '@/components/PedidoItem';
import { EmptyState } from '@/components/ui/EmptyState';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useSyncRefresh } from '@/hooks/useSyncRefresh';
import { spacing, type } from '@/constants/theme';

export default function Pedidos() {
  const { listPedidosRecentes, listPedidosRecentesPorUsuario, removePedido } = usePedidosDatabase();
  const { lastSync } = useAutoSync();
  const { user } = useAuth();
  const { refreshing, onRefresh } = useSyncRefresh();
  const isCliente = user?.role === 'CLIENTE';
  const [pedidosPorData, setPedidosPorData] = useState<Record<string, any[]>>({});

  async function load() {
    try {
      const data = isCliente && user?.id
        ? await listPedidosRecentesPorUsuario(user.id)
        : await listPedidosRecentes();
      setPedidosPorData(data);
    } catch (err) {
      console.error('Erro ao carregar pedidos:', err);
    }
  }

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  useEffect(() => {
    load();
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

  const renderPedido = (pedido: any, index: number) => (
    <PedidoItem
      key={pedido.id}
      data={pedido}
      index={index}
      onEdit={() => handleEdit(pedido.id)}
      onDelete={isCliente ? undefined : () => handleDelete(pedido.id)}
    />
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pedidos Recentes</Text>
      <FlatList
        data={Object.keys(pedidosPorData)}
        keyExtractor={(d) => d}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<EmptyState icon="list" title="Nenhum pedido recente" message="Pedidos aparecem aqui assim que forem criados." />}
        renderItem={({ item: dataKey }) => (
          <View style={styles.group}>
            <Text style={styles.date}>{dataKey}</Text>
            {(pedidosPorData[dataKey] || []).map((p, idx) => renderPedido(p, idx))}
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
