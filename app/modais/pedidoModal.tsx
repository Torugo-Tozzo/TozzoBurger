import React, { useEffect, useState } from 'react';
import { StyleSheet, View as RNView, TextInput, TouchableOpacity, Alert, FlatList, Modal, Pressable, useColorScheme } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { View, Text } from '@/components/Themed';
import { useLocalSearchParams, router } from 'expo-router';
import { usePedidosDatabase } from '@/database/usePedidoDatabase';
import { useProductDatabase } from '@/database/useProductDatabase';
import { useVendasDatabase } from '@/database/useVendaDatabse';
import { STATUS_PEDIDO } from '@/database/types/Pedido';
import { useAuth } from '@/context/AuthContext';
import { useAutoSync } from '@/context/AutoSyncContext';
import Colors from '@/constants/Colors';
import { Button } from '@/components/ui/Button';
import { ListItem } from '@/components/ui/ListItem';
import { spacing } from '@/constants/theme';

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
  const { user } = useAuth();
  const isCliente = user?.role === 'CLIENTE';
  const { triggerSync } = useAutoSync();
  const colorScheme = useColorScheme() ?? 'light';
  const isDarkMode = colorScheme === 'dark';
  const colors = Colors[colorScheme];

  const pedidoAceito = status !== STATUS_PEDIDO.ABERTO;
  const clienteBloqueado = isCliente;

  const surface = colors.surface;
  const textColor = colors.text;
  const subText = colors.textMuted;
  const inputBorder = colors.border;

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
      triggerSync().catch((e) => console.warn('[sync] trigger failed', e));
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
      const { vendaId } = await createVenda(produtos, cliente ?? '', user?.id, user?.nome ?? null);
      await updatePedido(pedido.id, undefined, undefined, STATUS_PEDIDO.FECHADO);
      Alert.alert('Venda Gerada', `Venda ${vendaId} gerada a partir do pedido.`);
      router.back();
    } catch (err) {
      console.error(err);
      Alert.alert('Erro', 'Não foi possível gerar venda.');
    }
  };

  const renderProduto = ({ item }: { item: any }) => (
    <ListItem
      title={item.nome ?? item.produtoId}
      subtitle={`R$ ${Number(item.preco ?? 0).toFixed(2)} / un.`}
      trailing={
        clienteBloqueado ? (
          <Text style={[styles.qtyText, { color: textColor }]}>{item.quantidade}</Text>
        ) : (
          <RNView style={styles.quantityRow}>
            <TouchableOpacity onPress={() => changeQuantidade(item.produtoId, -1)} style={[styles.qtyBtn, { backgroundColor: colors.primary, borderColor: colors.text }]}>
              <Text style={[styles.qtyBtnText, { color: colors.background }]}>-</Text>
            </TouchableOpacity>
            <Text style={[styles.qtyText, { color: textColor }]}>{item.quantidade}</Text>
            <TouchableOpacity onPress={() => changeQuantidade(item.produtoId, 1)} style={[styles.qtyBtn, { backgroundColor: colors.primary, borderColor: colors.text }]}>
              <Text style={[styles.qtyBtnText, { color: colors.background }]}>+</Text>
            </TouchableOpacity>
          </RNView>
        )
      }
    />
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
      <TextInput style={[styles.input, { borderColor: inputBorder, backgroundColor: surface, color: textColor }]} value={cliente} onChangeText={setCliente} placeholder='Nome do cliente' placeholderTextColor={subText} editable={!clienteBloqueado} />

      <Text style={[styles.label, { color: textColor }]}>Status</Text>
      {isCliente ? (
        <RNView style={styles.statusRow}>
          <RNView style={[styles.statusBtn, { borderColor: inputBorder, backgroundColor: colors.primary }]}>
            <Text style={{ color: colors.background }}>{status}</Text>
          </RNView>
        </RNView>
      ) : (
        <RNView style={styles.statusRow}>
          {([STATUS_PEDIDO.ABERTO, STATUS_PEDIDO.EM_PREPARO, STATUS_PEDIDO.ENTREGANDO, STATUS_PEDIDO.FECHADO] as const).map((s) => {
            const active = status === s;
            return (
              <TouchableOpacity
                key={s}
                onPress={() => setStatus(s)}
                style={[styles.statusBtn, { borderColor: inputBorder }, active && { backgroundColor: colors.primary }]}
              >
                <Text style={{ color: active ? colors.background : textColor }}>{s}</Text>
              </TouchableOpacity>
            );
          })}
        </RNView>
      )}

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

      {!clienteBloqueado && (
        <RNView style={styles.buttonsRow}>
          <Button title="Add Item" onPress={handleEditInConta} variant="outline" style={styles.btnSpacing} />
          {!isCliente && <Button title="Gerar Venda" onPress={handleGerarVenda} style={{ flex: 1 }} />}
        </RNView>
      )}

      <Modal visible={pickerVisible} transparent animationType="slide">
        <Pressable style={[styles.modalOverlay, { backgroundColor: isDarkMode ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.4)' }]} onPress={() => setPickerVisible(false)} />
        <RNView style={[styles.modalContainer, { backgroundColor: surface }] }>
          <Text style={[styles.title, { color: textColor }]}>Adicionar Item</Text>
          <TextInput value={searchText} onChangeText={(t) => { setSearchText(t); searchProducts(t); }} placeholder="Buscar produto" style={[styles.input, { borderColor: inputBorder, backgroundColor: surface, color: textColor }]} placeholderTextColor={subText} />
          <FlatList data={searchResults} keyExtractor={(it: any) => it.id} renderItem={({ item }) => (
            <ListItem
              title={item.nome}
              subtitle={`R$ ${Number(item.preco || 0).toFixed(2)}`}
              onPress={() => addProdutoToPedido(item)}
            />
          )} />
          <RNView style={{height:12}} />
          <Button title="Fechar" onPress={() => setPickerVisible(false)} variant="outline" style={{ marginTop: spacing.sm }} />
        </RNView>
      </Modal>

      {clienteBloqueado ? (
        <RNView style={[styles.totalRow, { backgroundColor: 'transparent', marginTop: 12 }]}>
          <Text style={{ color: subText, fontStyle: 'italic' }}>Pedido enviado — sem edição</Text>
        </RNView>
      ) : (
        <RNView style={styles.buttonsRow}>
          {!isCliente && (
            <TouchableOpacity style={[styles.deleteBtn, { backgroundColor: Colors.status.danger }]} onPress={handleDelete}>
              <FontAwesome name="trash" size={18} color="#fff" />
            </TouchableOpacity>
          )}
          <Button title="Salvar Pedido" onPress={handleSave} style={{ flex: 7 }} />
        </RNView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, borderColor: 'black', borderWidth: 1 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  label: { marginTop: 8, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 8, marginTop: 6 },
  statusRow: { flexDirection: 'row', marginTop: 8, flexWrap: 'wrap' },
  statusBtn: { padding: 8, borderRadius: 6, borderWidth: 1, borderColor: '#ccc', marginRight: 8, marginBottom: 8 },
  quantityRow: { flexDirection: 'row', alignItems: 'center' },
  qtyBtn: { paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#1976D2', borderRadius: 8, marginHorizontal: 8, backgroundColor: '#2196F3', alignItems: 'center', justifyContent: 'center' },
  qtyBtnText: { color: '#fff', fontWeight: '900', fontSize: 16, textAlign: 'center' },
  qtyText: { minWidth: 36, textAlign: 'center', fontWeight: '400', fontSize: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalContainer: { position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '70%', backgroundColor: '#fff', padding: 16, borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  listFooter: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, borderTopWidth: 1, borderTopColor: '#eee', marginTop: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  totalLabel: { fontWeight: '600', fontSize: 16 },
  totalValue: { fontWeight: '700', fontSize: 16 },
  btnSpacing: { marginRight: 8 },
  buttonsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  deleteBtn: { backgroundColor: '#F44336', padding: 10, borderRadius: 6, flex: 3, marginRight: 8, alignItems: 'center', justifyContent: 'center' },
});
