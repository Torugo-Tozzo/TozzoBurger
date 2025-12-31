import React, { useEffect, useState } from 'react';
import { StyleSheet, View as RNView, TextInput, TouchableOpacity, Alert, FlatList, Modal, Pressable, useColorScheme } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { View, Text } from '@/components/Themed';
import { useLocalSearchParams, router } from 'expo-router';
import { usePedidosDatabase } from '@/database/usePedidoDatabase';
import { useProductDatabase } from '@/database/useProductDatabase';
import { useVendasDatabase } from '@/database/useVendaDatabse';
import { STATUS_PEDIDO } from '@/database/types/Pedido';

type PedidoStatus = typeof STATUS_PEDIDO[keyof typeof STATUS_PEDIDO];

export default function PedidoModal() {
  const params = useLocalSearchParams();
  const pedidoId = String((params as any)?.pedidoId ?? '');
  const { getPedidoById, updatePedido, removePedido } = usePedidosDatabase();
  const { showAdd, show: showProduto, searchByName } = useProductDatabase();
  const { createVenda } = useVendasDatabase();

  const [pedido, setPedido] = useState<any | null>(null);
  const [cliente, setCliente] = useState('');
  const [status, setStatus] = useState<PedidoStatus>(STATUS_PEDIDO.ABERTO);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === 'dark';

  const bg = isDarkMode ? '#0b0b0b' : '#fff';
  const surface = isDarkMode ? '#121212' : '#fff';
  const textColor = isDarkMode ? '#fff' : '#000';
  const subText = isDarkMode ? '#bbb' : '#555';
  const inputBorder = isDarkMode ? '#333' : '#ccc';

  useEffect(() => {
    async function load() {
      if (!pedidoId) return;
      try {
        const p = await getPedidoById(String(pedidoId));
        // enrich produtos with names from TB_PRODUTOS
        const produtos = Array.isArray(p.produtos) ? p.produtos : [];
        const produtosEnriquecidos = await Promise.all(
          produtos.map(async (pr: any) => {
            try {
              const info = await showAdd(pr.produtoId);
              return { ...pr, nome: info?.nome ?? pr.produtoId, preco: info?.preco ?? 0 };
            } catch (e) {
              return { ...pr, nome: pr.produtoId, preco: 0 };
            }
          })
        );

        setPedido({ ...p, produtos: produtosEnriquecidos });
        setCliente(p.cliente ?? '');
        // ensure status from DB matches PedidoStatus union
        const isValidStatus = (v: any): v is PedidoStatus => Object.values(STATUS_PEDIDO).includes(v);
        setStatus(isValidStatus(p.status) ? p.status : STATUS_PEDIDO.ABERTO);
      } catch (err) {
        console.error('Erro ao carregar pedido:', err);
      }
    }
    load();
  }, [pedidoId]);

  async function searchProducts(q: string) {
    try {
      const res = await searchByName(q);
      setSearchResults(Array.isArray(res) ? res : []);
    } catch (e) {
      setSearchResults([]);
    }
  }

  const handleSave = async () => {
    if (!pedido) return;
    try {
      const produtosPayload = (pedido.produtos || []).map((p: any) => ({ produtoId: p.produtoId, quantidade: p.quantidade }));
      await updatePedido(pedido.id, produtosPayload, cliente, status);
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
    // open product picker to add items
    if (!pedido) return;
    setSearchText('');
    searchProducts('');
    setPickerVisible(true);
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
      <RNView style={{ flex: 1 }}>
        <Text style={styles.prodNome}>{item.nome ?? item.produtoId}</Text>
        <Text style={styles.unitPrice}>{`R$ ${Number(item.preco ?? 0).toFixed(2)} / un.`}</Text>
      </RNView>
      <RNView style={styles.quantityRow}>
        <TouchableOpacity onPress={() => changeQuantidade(item.produtoId, -1)} style={styles.qtyBtn}><Text style={styles.qtyBtnText}>-</Text></TouchableOpacity>
        <Text style={styles.qtyText}>{item.quantidade}</Text>
        <TouchableOpacity onPress={() => changeQuantidade(item.produtoId, 1)} style={styles.qtyBtn}><Text style={styles.qtyBtnText}>+</Text></TouchableOpacity>
      </RNView>
    </RNView>
  );

  const itensTotal = (() => {
    if (!pedido || !Array.isArray(pedido.produtos)) return 0;
    return pedido.produtos.reduce((acc: number, p: any) => {
      const preco = Number(p.preco ?? 0);
      const qtd = Number(p.quantidade ?? 0);
      return acc + preco * qtd;
    }, 0);
  })();

  function changeQuantidade(produtoId: string, delta: number) {
    if (!pedido) return;
    const produtos = Array.isArray(pedido.produtos) ? [...pedido.produtos] : [];
    const idx = produtos.findIndex((p: any) => p.produtoId === produtoId);
    if (idx === -1) return;
    const novo = { ...produtos[idx] };
    novo.quantidade = Math.max(0, (novo.quantidade || 0) + delta);
    if (novo.quantidade <= 0) {
      produtos.splice(idx, 1);
    } else {
      produtos[idx] = novo;
    }
    setPedido({ ...pedido, produtos });
  }

  function addProdutoToPedido(prod: any) {
    if (!pedido) return;
    const produtos = Array.isArray(pedido.produtos) ? [...pedido.produtos] : [];
    const idx = produtos.findIndex((p: any) => p.produtoId === prod.id);
    if (idx === -1) {
      produtos.push({ produtoId: prod.id, quantidade: 1, nome: prod.nome, preco: prod.preco ?? 0 });
    } else {
      produtos[idx] = { ...produtos[idx], quantidade: (produtos[idx].quantidade || 0) + 1 };
    }
    setPedido({ ...pedido, produtos });
    setPickerVisible(false);
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: textColor }]}>Pedido</Text>

      <Text style={[styles.label, { color: textColor }]}>Cliente</Text>
      <TextInput style={[styles.input, { borderColor: inputBorder, backgroundColor: surface, color: textColor }]} value={cliente} onChangeText={setCliente} placeholder='Nome do cliente' placeholderTextColor={subText} />

      <Text style={[styles.label, { color: textColor }]}>Status</Text>
      <RNView style={styles.statusRow}>
        <TouchableOpacity onPress={() => setStatus(STATUS_PEDIDO.ABERTO)} style={[styles.statusBtn, status === STATUS_PEDIDO.ABERTO && styles.statusActive]}><Text style={{ color: textColor }}>ABERTO</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setStatus(STATUS_PEDIDO.EM_PREPARO)} style={[styles.statusBtn, status === STATUS_PEDIDO.EM_PREPARO && styles.statusActive]}><Text style={{ color: textColor }}>EM_PREPARO</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setStatus(STATUS_PEDIDO.ENTREGANDO)} style={[styles.statusBtn, status === STATUS_PEDIDO.ENTREGANDO && styles.statusActive]}><Text style={{ color: textColor }}>ENTREGANDO</Text></TouchableOpacity>
        <TouchableOpacity onPress={() => setStatus(STATUS_PEDIDO.FECHADO)} style={[styles.statusBtn, status === STATUS_PEDIDO.FECHADO && styles.statusActive]}><Text style={{ color: textColor }}>FECHADO</Text></TouchableOpacity>
      </RNView>

      <Text style={[styles.label, { color: textColor }]}>Itens</Text>
      <FlatList
        data={pedido?.produtos ?? []}
        keyExtractor={(it: any, i: number) => it.produtoId + i}
        renderItem={renderProduto}
        style={{ backgroundColor: 'transparent' }}
      />

      <RNView style={[styles.totalRow, { backgroundColor: 'transparent' }]}>
        <Text style={[styles.totalLabel, { color: textColor }]}>Total itens:</Text>
        <Text style={[styles.totalValue, { color: textColor }]}>{`R$ ${itensTotal.toFixed(2)}`}</Text>
      </RNView>

      <RNView style={styles.buttonsRow}>
        <TouchableOpacity style={[styles.btn, styles.btnSpacing]} onPress={handleEditInConta}><Text style={styles.btnText}>Add Item</Text></TouchableOpacity>
        <TouchableOpacity style={styles.btn} onPress={handleGerarVenda}><Text style={styles.btnText}>Gerar Venda</Text></TouchableOpacity>
      </RNView>

      <Modal visible={pickerVisible} transparent animationType="slide">
        <Pressable style={[styles.modalOverlay, { backgroundColor: isDarkMode ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.4)' }]} onPress={() => setPickerVisible(false)} />
        <RNView style={[styles.modalContainer, { backgroundColor: surface }] }>
          <Text style={[styles.title, { color: textColor }]}>Adicionar Item</Text>
          <TextInput value={searchText} onChangeText={(t) => { setSearchText(t); searchProducts(t); }} placeholder="Buscar produto" style={[styles.input, { borderColor: inputBorder, backgroundColor: surface, color: textColor }]} placeholderTextColor={subText} />
          <FlatList data={searchResults} keyExtractor={(it: any) => it.id} renderItem={({ item }) => (
            <TouchableOpacity style={[styles.prodPickItem, { backgroundColor: surface }]} onPress={() => addProdutoToPedido(item)}>
              <Text style={[styles.prodNome, { color: textColor }]}>{item.nome}</Text>
              <Text style={{ color: subText }}>{`R$ ${Number(item.preco || 0).toFixed(2)}`}</Text>
            </TouchableOpacity>
          )} />
          <RNView style={{height:12}} />
          <TouchableOpacity style={[styles.btn, { marginTop: 8 }]} onPress={() => setPickerVisible(false)}><Text style={styles.btnText}>Fechar</Text></TouchableOpacity>
        </RNView>
      </Modal>

      <RNView style={styles.buttonsRow}>
        <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
          <FontAwesome name="trash" size={18} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}><Text style={styles.btnText}>Salvar Pedido</Text></TouchableOpacity>
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
  prodItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: '#eee', alignItems: 'center' },
  prodNome: { fontWeight: '400', fontSize: 18 },
  quantityRow: { flexDirection: 'row', alignItems: 'center' },
  qtyBtn: { paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#1976D2', borderRadius: 8, marginHorizontal: 8, backgroundColor: '#2196F3', alignItems: 'center', justifyContent: 'center' },
  qtyBtnText: { color: '#fff', fontWeight: '900', fontSize: 16, textAlign: 'center' },
  qtyText: { minWidth: 36, textAlign: 'center', fontWeight: '400', fontSize: 16 },
  unitPrice: { fontSize: 14, color: '#555', marginTop: 4 },
  prodPickItem: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#eee', alignItems: 'center' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalContainer: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '70%', backgroundColor: '#fff', padding: 16, borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  listFooter: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, borderTopWidth: 1, borderTopColor: '#eee', marginTop: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  totalLabel: { fontWeight: '600', fontSize: 16 },
  totalValue: { fontWeight: '700', fontSize: 16 },
  btnSpacing: { marginRight: 8 },
  buttonsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  btn: { backgroundColor: '#2196F3', padding: 10, borderRadius: 6, flex: 1, alignItems: 'center' },
  saveBtn: { backgroundColor: '#4CAF50', padding: 10, borderRadius: 6, flex: 7, alignItems: 'center' },
  deleteBtn: { backgroundColor: '#F44336', padding: 10, borderRadius: 6, flex: 3, marginRight: 8, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontWeight: '700' },
});
