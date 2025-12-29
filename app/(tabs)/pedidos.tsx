import React, { useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, Alert, FlatList } from 'react-native';
import { View, Text } from '@/components/Themed';
import { usePedidosDatabase } from '@/database/usePedidoDatabase';
import { router } from 'expo-router';

export default function Pedidos() {
  const { listPedidosRecentes, removePedido } = usePedidosDatabase();
  const [pedidosPorData, setPedidosPorData] = useState<Record<string, any[]>>({});

  async function load() {
    try {
      const data = await listPedidosRecentes();
      setPedidosPorData(data);
    } catch (err) {
      console.error('Erro ao carregar pedidos:', err);
    }
  }

  useEffect(() => {
    load();
  }, []);

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
    <View style={styles.pedidoItem} key={pedido.id}>
      <View style={styles.pedidoLeft}>
        <Text style={styles.counter}>{index + 1}</Text>
        <View style={styles.info}>
          <Text style={styles.cliente}>{pedido.cliente ?? 'Cliente não informado'}</Text>
          <Text style={styles.produtos}>{(pedido.produtos || []).join(', ')}</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Text style={styles.status}>{pedido.status}</Text>
        <TouchableOpacity style={styles.editButton} onPress={() => handleEdit(pedido.id)}>
          <Text style={styles.buttonText}>Editar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteButton} onPress={() => handleDelete(pedido.id)}>
          <Text style={styles.buttonText}>Excluir</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pedidos Recentes</Text>
      <FlatList
        data={Object.keys(pedidosPorData)}
        keyExtractor={(d) => d}
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
