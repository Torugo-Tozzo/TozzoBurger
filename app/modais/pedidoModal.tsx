import React, { useEffect, useState } from 'react';
import { StyleSheet, View as RNView, TextInput, TouchableOpacity, Alert, FlatList } from 'react-native';
import { View, Text } from '@/components/Themed';
import { useLocalSearchParams, router } from 'expo-router';
import { usePedidosDatabase } from '@/database/usePedidoDatabase';
import { useProductDatabase } from '@/database/useProductDatabase';
import { useVendasDatabase } from '@/database/useVendaDatabse';
import { STATUS_PEDIDO } from '@/database/types/Pedido';

export default function PedidoModal() {
  const params = useLocalSearchParams();
  const pedidoId = String((params as any)?.pedidoId ?? '');
  const { getPedidoById, updatePedido, removePedido } = usePedidosDatabase();
  const { show: showProduto } = useProductDatabase();
  const { createVenda } = useVendasDatabase();

  const [pedido, setPedido] = useState<any | null>(null);
  const [cliente, setCliente] = useState('');
  const [status, setStatus] = useState<string>(STATUS_PEDIDO.ABERTO);

  useEffect(() => {
    async function load() {
      if (!pedidoId) return;
      try {
        const p = await getPedidoById(String(pedidoId));
        setPedido(p);
        setCliente(p.cliente ?? '');
        setStatus(p.status ?? STATUS_PEDIDO.ABERTO);
      } catch (err) {
        console.error('Erro ao carregar pedido:', err);
      }
    }
    load();
  }, [pedidoId]);

  const handleSave = async () => {
    if (!pedido) return;
    try {
      await updatePedido(pedido.id, undefined, cliente, status);
      Alert.alert('Salvo', 'Pedido atualizado.');
      router.back();
    } catch (err) {
      console.error(err);
      Alert.alert('Erro', 'Não foi possível salvar o pedido.');
    }
  };

  const handleDelete = async () => {
    if (!pedido) return;
    Alert.alert('Confirmar', 'Deseja excluir este pedido?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: async () => { await removePedido(pedido.id); router.back(); } },
    ]);
  };

  const handleEditInConta = () => {
    if (!pedido) return;
    router.push({ pathname: '/modais/contaModal', params: { pedidoId: pedido.id } });
  };

  const handleGerarVenda = async () => {
    if (!pedido) return;
    try {
      const produtos = (pedido.produtos || []).map((p: any) => ({ produtoId: p.produtoId, quantidade: p.quantidade }));
      const { vendaId } = await createVenda(produtos, cliente ?? '');
      await updatePedido(pedido.id, undefined, undefined, STATUS_PEDIDO.FECHADO);
      Alert.alert('Venda Gerada', `Venda ${vendaId} gerada a partir do pedido.`);
      router.back();
    } catch (err) {
      console.error(err);
      Alert.alert('Erro', 'Não foi possível gerar venda.');
    }
  };

  const renderProduto = ({ item }: { item: any }) => (
    <RNView style={styles.prodItem}>
      <Text style={styles.prodNome}>{item.nome ?? item.produtoId}</Text>
      <Text>{`(${item.quantidade}x)`}</Text>
    </RNView>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pedido</Text>

      <Text style={styles.label}>Cliente</Text>
      <TextInput style={styles.input} value={cliente} onChangeText={setCliente} placeholder='Nome do cliente' />

      <Text style={styles.label}>Status</Text>
      <RNView style={styles.statusRow}>
        <TouchableOpacity onPress={() => setStatus(STATUS_PEDIDO.ABERTO)} style={[styles.statusBtn, status === STATUS_PEDIDO.ABERTO && styles.statusActive]}><Text>ABERTO</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setStatus(STATUS_PEDIDO.EM_PREPARO)} style={[styles.statusBtn, status === STATUS_PEDIDO.EM_PREPARO && styles.statusActive]}><Text>EM_PREPARO</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setStatus(STATUS_PEDIDO.ENTREGANDO)} style={[styles.statusBtn, status === STATUS_PEDIDO.ENTREGANDO && styles.statusActive]}><Text>ENTREGANDO</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setStatus(STATUS_PEDIDO.FECHADO)} style={[styles.statusBtn, status === STATUS_PEDIDO.FECHADO && styles.statusActive]}><Text>FECHADO</Text></TouchableOpacity>
      </RNView>

      <Text style={styles.label}>Produtos</Text>
      <FlatList data={pedido?.produtos ?? []} keyExtractor={(it: any, i: number) => it.produtoId + i} renderItem={renderProduto} />

      <RNView style={styles.buttonsRow}>
        <TouchableOpacity style={styles.btn} onPress={handleEditInConta}><Text style={styles.btnText}>Editar (Conta)</Text></TouchableOpacity>
        <TouchableOpacity style={styles.btn} onPress={handleGerarVenda}><Text style={styles.btnText}>Gerar Venda</Text></TouchableOpacity>
      </RNView>

      <RNView style={styles.buttonsRow}>
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}><Text style={styles.btnText}>Salvar</Text></TouchableOpacity>
        <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}><Text style={styles.btnText}>Excluir</Text></TouchableOpacity>
      </RNView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  label: { marginTop: 8, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 8, marginTop: 6 },
  statusRow: { flexDirection: 'row', marginTop: 8, flexWrap: 'wrap' },
  statusBtn: { padding: 8, borderRadius: 6, borderWidth: 1, borderColor: '#ccc', marginRight: 8, marginBottom: 8 },
  statusActive: { backgroundColor: '#d0f0c0' },
  prodItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 8, borderBottomWidth: 1, borderBottomColor: '#eee' },
  prodNome: { fontWeight: '600' },
  buttonsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  btn: { backgroundColor: '#2196F3', padding: 10, borderRadius: 6, flex: 1, marginRight: 8, alignItems: 'center' },
  saveBtn: { backgroundColor: '#4CAF50', padding: 10, borderRadius: 6, flex: 1, marginRight: 8, alignItems: 'center' },
  deleteBtn: { backgroundColor: '#F44336', padding: 10, borderRadius: 6, flex: 1, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700' },
});
