import React, { useEffect, useState } from 'react';
import { StyleSheet, View as RNView, TextInput, TouchableOpacity, Alert, FlatList, Modal, Pressable, useColorScheme } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { View, Text } from '@/components/Themed';
import { useLocalSearchParams, router } from 'expo-router';
import { useOrderDatabase } from '@/database/useOrderDatabase';
import { useProductDatabase } from '@/database/useProductDatabase';
import { useSaleDatabase } from '@/database/useSaleDatabase';
import { ORDER_STATUS } from '@/database/types/Order';
import { useAuth } from '@/context/AuthContext';
import { useAutoSync } from '@/context/AutoSyncContext';
import Colors from '@/constants/Colors';
import { Button } from '@/components/ui/Button';
import { ListItem } from '@/components/ui/ListItem';
import { spacing } from '@/constants/theme';
import { useTranslation } from 'react-i18next';

type OrderStatus = typeof ORDER_STATUS[keyof typeof ORDER_STATUS];

function translateStatus(status: OrderStatus, t: (key: string) => string): string {
  switch (status) {
    case ORDER_STATUS.OPEN: return t('status.open');
    case ORDER_STATUS.IN_PREPARATION: return t('status.inPreparation');
    case ORDER_STATUS.DELIVERING: return t('status.delivering');
    case ORDER_STATUS.CLOSED: return t('status.closed');
  }
  return t('status.open');
}

export default function PedidoModal() {
  const params = useLocalSearchParams();
  const orderId = String((params as any)?.orderId ?? '');
  const { getOrderById, updateOrder, removeOrder } = useOrderDatabase();
  const { showAdd, show: showProduto, searchByName } = useProductDatabase();
  const { createSale } = useSaleDatabase();

  const [pedido, setPedido] = useState<any | null>(null);
  const [customerName, setCliente] = useState('');
  const [status, setStatus] = useState<OrderStatus>(ORDER_STATUS.OPEN);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const { user } = useAuth();
  const isCliente = user?.role === 'CUSTOMER';
  const { triggerSync } = useAutoSync();
  const colorScheme = useColorScheme() ?? 'light';
  const isDarkMode = colorScheme === 'dark';
  const colors = Colors[colorScheme];
  const { t, i18n } = useTranslation();
  const formatCurrency = (value: number) => new Intl.NumberFormat(i18n.language, { style: 'currency', currency: 'BRL' }).format(value);

  const orderAccepted = status !== ORDER_STATUS.OPEN;
  const clienteBloqueado = isCliente;

  const surface = colors.surface;
  const textColor = colors.text;
  const subText = colors.textMuted;
  const inputBorder = colors.border;

  useEffect(() => {
    async function load() {
      if (!orderId) return;
      try {
        const order = await getOrderById(String(orderId));
        const items = Array.isArray(order.items) ? order.items : [];
        const enrichedItems = await Promise.all(
          items.map(async (item: any) => {
            try {
              const info = await showAdd(item.productId);
              return { ...item, name: info?.name ?? item.productId, price: info?.price ?? 0 };
            } catch (e) {
              return { ...item, name: item.productId, price: 0 };
            }
          })
        );

        setPedido({ ...order, items: enrichedItems });
        setCliente(order.customerName ?? '');
        const isValidStatus = (v: any): v is OrderStatus => Object.values(ORDER_STATUS).includes(v);
        setStatus(isValidStatus(order.status) ? order.status : ORDER_STATUS.OPEN);
      } catch (err) {
        console.error('Erro ao carregar pedido:', err);
      }
    }
    load();
  }, [orderId]);

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
      const itemsPayload = (pedido.items || []).map((item: any) => ({ productId: item.productId, quantity: item.quantity }));
      await updateOrder(pedido.id, itemsPayload, customerName, status);
      triggerSync().catch((e) => console.warn('[sync] trigger failed', e));
      Alert.alert(t('common.success'), t('orders.updated'));
      router.back();
    } catch (err) {
      console.error(err);
      Alert.alert(t('common.error'), t('errors.saveFailed'));
    }
  };

  const handleDelete = async () => {
    if (!pedido) return;
    Alert.alert(t('common.confirm'), t('orders.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('orders.delete'), style: 'destructive', onPress: async () => { await removeOrder(pedido.id); router.back(); } },
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
      const items = (pedido.items || []).map((item: any) => ({ productId: item.productId, quantity: item.quantity }));
      const { saleId } = await createSale(items, customerName ?? '', user?.id, user?.name ?? null);
      await updateOrder(pedido.id, undefined, undefined, ORDER_STATUS.CLOSED);
      Alert.alert(t('orders.generatedSaleTitle'), t('orders.generatedSaleMessage', { id: saleId }));
      router.back();
    } catch (err) {
      console.error(err);
      Alert.alert(t('common.error'), t('errors.saveFailed'));
    }
  };

  const renderProduto = ({ item }: { item: any }) => (
    <ListItem
      title={item.name ?? item.productId}
      subtitle={`${formatCurrency(Number(item.price ?? 0))} / ${t('charts.units')}`}
      trailing={
        clienteBloqueado ? (
          <Text style={[styles.qtyText, { color: textColor }]}>{item.quantity}</Text>
        ) : (
          <RNView style={styles.quantityRow}>
            <TouchableOpacity onPress={() => changeQuantidade(item.productId, -1)} style={[styles.qtyBtn, { backgroundColor: colors.primary, borderColor: colors.text }]}>
              <Text style={[styles.qtyBtnText, { color: colors.background }]}>-</Text>
            </TouchableOpacity>
            <Text style={[styles.qtyText, { color: textColor }]}>{item.quantity}</Text>
            <TouchableOpacity onPress={() => changeQuantidade(item.productId, 1)} style={[styles.qtyBtn, { backgroundColor: colors.primary, borderColor: colors.text }]}>
              <Text style={[styles.qtyBtnText, { color: colors.background }]}>+</Text>
            </TouchableOpacity>
          </RNView>
        )
      }
    />
  );

  const itensTotal = (() => {
    if (!pedido || !Array.isArray(pedido.items)) return 0;
    return pedido.items.reduce((acc: number, item: any) => {
      const price = Number(item.price ?? 0);
      const quantity = Number(item.quantity ?? 0);
      return acc + price * quantity;
    }, 0);
  })();

  function changeQuantidade(productId: string, delta: number) {
    if (!pedido) return;
    const items = Array.isArray(pedido.items) ? [...pedido.items] : [];
    const idx = items.findIndex((item: any) => item.productId === productId);
    if (idx === -1) return;
    const nextItem = { ...items[idx] };
    nextItem.quantity = Math.max(0, (nextItem.quantity || 0) + delta);
    if (nextItem.quantity <= 0) {
      items.splice(idx, 1);
    } else {
      items[idx] = nextItem;
    }
    setPedido({ ...pedido, items });
  }

  function addProdutoToPedido(prod: any) {
    if (!pedido) return;
    const items = Array.isArray(pedido.items) ? [...pedido.items] : [];
    const idx = items.findIndex((item: any) => item.productId === prod.id);
    if (idx === -1) {
      items.push({ productId: prod.id, quantity: 1, name: prod.name, price: prod.price ?? 0 });
    } else {
      items[idx] = { ...items[idx], quantity: (items[idx].quantity || 0) + 1 };
    }
    setPedido({ ...pedido, items });
    setPickerVisible(false);
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.title, { color: textColor }]}>{t('orders.title')}</Text>

      <Text style={[styles.label, { color: textColor }]}>{t('orders.customer')}</Text>
      <TextInput style={[styles.input, { borderColor: inputBorder, backgroundColor: surface, color: textColor }]} value={customerName} onChangeText={setCliente} placeholder={t('sales.customer')} placeholderTextColor={subText} editable={!clienteBloqueado} />

      <Text style={[styles.label, { color: textColor }]}>{t('orders.status')}</Text>
      {isCliente ? (
        <RNView style={styles.statusRow}>
          <RNView style={[styles.statusBtn, { borderColor: inputBorder, backgroundColor: colors.primary }]}>
            <Text style={{ color: colors.background }}>{translateStatus(status, t)}</Text>
          </RNView>
        </RNView>
      ) : (
        <RNView style={styles.statusRow}>
          {([ORDER_STATUS.OPEN, ORDER_STATUS.IN_PREPARATION, ORDER_STATUS.DELIVERING, ORDER_STATUS.CLOSED] as const).map((s) => {
            const active = status === s;
            return (
              <TouchableOpacity
                key={s}
                onPress={() => setStatus(s)}
                style={[styles.statusBtn, { borderColor: inputBorder }, active && { backgroundColor: colors.primary }]}
              >
                <Text style={{ color: active ? colors.background : textColor }}>{translateStatus(s, t)}</Text>
              </TouchableOpacity>
            );
          })}
        </RNView>
      )}

      <Text style={[styles.label, { color: textColor }]}>{t('orders.items')}</Text>
      <FlatList
        data={pedido?.items ?? []}
        keyExtractor={(it: any, i: number) => it.productId + i}
        renderItem={renderProduto}
        style={{ backgroundColor: 'transparent' }}
      />

      <RNView style={[styles.totalRow, { backgroundColor: 'transparent' }]}>
        <Text style={[styles.totalLabel, { color: textColor }]}>{t('orders.totalItems')}:</Text>
        <Text style={[styles.totalValue, { color: textColor }]}>{formatCurrency(itensTotal)}</Text>
      </RNView>

      {!clienteBloqueado && (
        <RNView style={styles.buttonsRow}>
          <Button title={t('orders.addItem')} onPress={handleEditInConta} variant="outline" style={styles.btnSpacing} />
          {!isCliente && <Button title={t('sales.direct')} onPress={handleGerarVenda} style={{ flex: 1 }} />}
        </RNView>
      )}

      <Modal visible={pickerVisible} transparent animationType="slide">
        <Pressable style={[styles.modalOverlay, { backgroundColor: isDarkMode ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.4)' }]} onPress={() => setPickerVisible(false)} />
        <RNView style={[styles.modalContainer, { backgroundColor: surface }] }>
          <Text style={[styles.title, { color: textColor }]}>{t('orders.addItem')}</Text>
          <TextInput value={searchText} onChangeText={(value) => { setSearchText(value); searchProducts(value); }} placeholder={t('common.search')} style={[styles.input, { borderColor: inputBorder, backgroundColor: surface, color: textColor }]} placeholderTextColor={subText} />
          <FlatList data={searchResults} keyExtractor={(it: any) => it.id} renderItem={({ item }) => (
            <ListItem
              title={item.name}
              subtitle={formatCurrency(Number(item.price || 0))}
              onPress={() => addProdutoToPedido(item)}
            />
          )} />
          <RNView style={{height:12}} />
          <Button title={t('common.close')} onPress={() => setPickerVisible(false)} variant="outline" style={{ marginTop: spacing.sm }} />
        </RNView>
      </Modal>

      {clienteBloqueado ? (
        <RNView style={[styles.totalRow, { backgroundColor: 'transparent', marginTop: 12 }]}>
          <Text style={{ color: subText, fontStyle: 'italic' }}>{t('orders.readOnly')}</Text>
        </RNView>
      ) : (
        <RNView style={styles.buttonsRow}>
          {!isCliente && (
            <TouchableOpacity style={[styles.deleteBtn, { backgroundColor: Colors.status.danger }]} onPress={handleDelete}>
              <FontAwesome name="trash" size={18} color="#fff" />
            </TouchableOpacity>
          )}
          <Button title={t('orders.save')} onPress={handleSave} style={{ flex: 7 }} />
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
