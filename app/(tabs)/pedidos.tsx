import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Alert, FlatList, RefreshControl } from 'react-native';
import { View, Text } from '@/components/Themed';
import { usePedidosDatabase } from '@/database/usePedidoDatabase';
import { useAutoSync } from '@/context/AutoSyncContext';
import PedidoItem from '@/components/PedidoItem';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useSyncRefresh } from '@/hooks/useSyncRefresh';

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
  container: { flex: 1, padding: 16 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 12 },
  group: { marginBottom: 18 },
  date: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  pedidoItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 10, borderRadius: 8, backgroundColor: '#f5f5f5', marginBottom: 8 },
  pedidoLeft: { flexDirection: 'row', alignItems: 'center' },
  counter: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#2196F3', color: 'white', textAlign: 'center', lineHeight: 32, fontWeight: '700', marginRight: 10 },
  info: { maxWidth: 200 },
  cliente: { fontWeight: '600' },
  produtos: { color: '#666' },
  actions: { alignItems: 'flex-end' },
  status: { fontSize: 12, marginBottom: 8 },
  editButton: { backgroundColor: '#4CAF50', padding: 6, borderRadius: 6, marginBottom: 6 },
  deleteButton: { backgroundColor: '#F44336', padding: 6, borderRadius: 6 },
  buttonText: { color: '#fff', fontWeight: '600' },
});
