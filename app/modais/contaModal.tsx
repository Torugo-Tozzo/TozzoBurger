import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet, FlatList, Alert, TouchableOpacity, TextInput, useColorScheme } from 'react-native';
import { Text, View } from '@/components/Themed';
import { useCart } from '@/context/CartContext';  // Importando corretamente o useCart
import { useSaleDatabase } from '@/database/useSaleDatabase';
import { router } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { captureScreen } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { useOrderDatabase } from '@/database/useOrderDatabase';
import { useProductDatabase } from '@/database/useProductDatabase';
import { useAuth } from '@/context/AuthContext';
import { useAutoSync } from '@/context/AutoSyncContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { ListFrame } from '@/components/ui/ListFrame';
import { ListDivider } from '@/components/ui/ListDivider';
import Colors from '@/constants/Colors';
import { spacing, radius, type } from '@/constants/theme';

export default function ContaModalScreen() {
  const { cart, customerName, clearCart, updateCartItem, addToCart, setCliente } = useCart();
  const { createSale } = useSaleDatabase();
  const { createOrder, countOpenOrders } = useOrderDatabase();
  const { show: showProduto } = useProductDatabase();
  const { user } = useAuth();
  const isCliente = user?.role === 'CUSTOMER';
  const { triggerSync } = useAutoSync();

  useEffect(() => {
    if (isCliente && !customerName && user?.name) setCliente(user.name);
  }, [isCliente, customerName, user?.name, setCliente]);

  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const placeholderColor = colors.textMuted;

  const total = cart.reduce((sum, item) => {
    const quantity = item.quantity ?? 0; // Se quantity for null ou undefined, usamos 0
    return sum + item.price * quantity;
  }, 0);

  const isCartEmpty = cart.length === 0 || total === 0;

  const limparConta = () => {
    Alert.alert("Confirmação", "Deseja realmente limpar o carrinho?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Limpar",
        onPress: clearCart,
      },
    ]);
  };

  const handleShare = async () => {
      try {
        const uri = await captureScreen({
          format: 'png',
          quality: 0.8,
        });
        await Sharing.shareAsync(uri);
      } catch (error) {
        console.error("Erro ao capturar e compartilhar:", error);
      } 
    };

  const imprimeConta = async (saleId: string): Promise<void> => await router.push(`/modais/contaHistoricoModal?saleId=${saleId}`);

  const finalizarCompra = async () => {
    try {
      const produtos = cart.map(({ id, quantity }) => ({
        productId: id,
        quantity: quantity ?? 0,
      }));

      const { saleId } = await createSale(produtos, customerName, user?.id, user?.name ?? null);
      await clearCart(); 
      router.back(); 

      Alert.alert("Venda Realizada!", "Deseja imprimir a Conta?", [
        { text: "Não", style: "cancel" },
        {
          text: "Sim",
          onPress: () => imprimeConta(saleId),
        },
      ]);

    } catch (error) {
      console.error(error);
      Alert.alert("Erro", "Não foi possível finalizar a compra.");
    }
  };

  const gerarPedido = async () => {
    try {
      if (isCliente) {
        const openOrders = await countOpenOrders(user?.id);
        if (openOrders >= 3) {
          Alert.alert('Limite atingido', 'Você já possui 3 pedidos abertos. Aguarde um ser aceito ou fechado para criar outro.');
          return;
        }
      }

      const produtos = cart.map(({ id, quantity }) => ({
        productId: id,
        quantity: quantity ?? 0,
      }));

      const { orderId } = await createOrder(produtos, customerName, undefined, user?.id, user?.name ?? null);
      await clearCart();
      triggerSync().catch((e) => console.warn('[sync] trigger failed', e));
      router.back();
      Alert.alert('Pedido Gerado!', `Pedido ${orderId} criado com sucesso.`);
    } catch (error) {
      console.error('Erro ao gerar pedido:', error);
      Alert.alert('Erro', 'Não foi possível gerar o pedido.');
    }
  };

  const alterarQuantidade = (itemId: string, operacao: 'incrementar' | 'decrementar') => {
    const item = cart.find((cartItem) => cartItem.id === itemId);
    if (!item) return;

    const novaQuantidade = operacao === 'incrementar' ? (item.quantity ?? 0) + 1 : (item.quantity ?? 0) - 1;

    if (novaQuantidade <= 0) {
      // Se a quantity for zero ou negativa, removemos o item
      updateCartItem(itemId, 0);  // A quantity vira 0 e o item sai do carrinho
    } else {
      updateCartItem(itemId, novaQuantidade);  // Atualiza a quantity
    }
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      borderColor: 'black',
      borderWidth: 1,
    },
    title: {
      fontSize: 24,
      fontWeight: "bold",
      marginBottom: 20,
    },
    separator: {
      height: 1,
      width: "100%",
      backgroundColor: colors.border,
    },
    listFrame: {
      flex: 1,
    },
    cartItem: {
      flexDirection: "row",
      alignItems: "center",
    },
    itemInfo: {
      flex: 1,
    },
    itemNome: {
      fontSize: type.body,
      fontWeight: "bold",
      marginBottom: 4,
    },
    itemPreco: {
      fontSize: type.bodySm,
    },
    totalText: {
      fontSize: 25,
      fontWeight: "bold",
      marginVertical: 20,
      textAlign: "center"
    },
    quantityControls: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.sm,
    },
    quantityText: {
      fontSize: type.body,
      fontWeight: "bold",
      minWidth: 24,
      textAlign: "center",
    },
    topRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: spacing.md },
    bottomRow: { flexDirection: 'row', margin: spacing.md, alignItems: 'center'},
    iconBtn: { backgroundColor: colors.primary, padding: spacing.md, borderRadius: radius.md, flex: 3, marginRight: spacing.sm, alignItems: 'center', justifyContent: 'center' },
    iconBtnDanger: { backgroundColor: Colors.status.danger, padding: spacing.md, borderRadius: radius.md, flex: 3, marginRight: spacing.sm, alignItems: 'center', justifyContent: 'center' },
    ctaFlex: { flex: 7 },
    buttonDisabled: { opacity: 0.5 },
    input: {
      width: '90%',
      alignSelf: 'center',
      padding: 10,
      marginVertical: 10,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 5,
      color: colors.text,
    }
  });

  return (
    <View style={styles.container}>
      <TextInput
        style={[styles.input, isCliente && { backgroundColor: colors.surface }]}
        placeholder="Nome do Cliente"
        value={customerName}
        onChangeText={setCliente}
        placeholderTextColor={placeholderColor}
        editable={!isCliente}
      />
      <ListFrame style={styles.listFrame}>
        <FlatList
          data={cart}
          keyExtractor={(item) => String(item.id)}  // Garantir que o item tem id
          ItemSeparatorComponent={ListDivider}
          renderItem={({ item }) => {
            const isUltimo = (item.quantity ?? 0) <= 1;

            return (
              <Card bordered={false} style={styles.cartItem}>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemNome}>{item.name}</Text>
                  <Text style={styles.itemPreco}>R$ {((item.quantity ?? 0) * item.price).toFixed(2)}</Text>
                </View>

                <View style={styles.quantityControls}>
                  <IconButton
                    icon={isUltimo ? 'trash' : 'minus'}
                    label={isUltimo ? 'Remover item' : 'Diminuir quantity'}
                    destructive={isUltimo}
                    onPress={() => alterarQuantidade(item.id, 'decrementar')}
                  />

                  <Text style={styles.quantityText}>{item.quantity}</Text>

                  <IconButton
                    icon="plus"
                    label="Aumentar quantity"
                    onPress={() => alterarQuantidade(item.id, 'incrementar')}
                  />
                </View>
              </Card>
            );
          }}
        />
      </ListFrame>

      <View style={styles.separator} />
      <Text style={styles.totalText}>Total: R$ {total.toFixed(2)}</Text>

      <View style={styles.topRow}>
        {!isCliente && (
          <TouchableOpacity
            style={[styles.iconBtn, isCartEmpty && styles.buttonDisabled]}
            onPress={handleShare}
            disabled={isCartEmpty}
          >
            <Ionicons name="share-social" size={22} color={colors.background} />
          </TouchableOpacity>
        )}

        <Button title="Gerar Pedido" onPress={gerarPedido} disabled={isCartEmpty} style={styles.ctaFlex} />
      </View>

      <View style={styles.bottomRow}>
        <TouchableOpacity
          style={[styles.iconBtnDanger, isCartEmpty && styles.buttonDisabled]}
          onPress={limparConta}
          disabled={isCartEmpty}
        >
          <FontAwesome name="trash" size={20} color="#fff" />
        </TouchableOpacity>

        {!isCliente && (
          <Button title="Vender Direto" onPress={finalizarCompra} disabled={isCartEmpty} style={styles.ctaFlex} />
        )}
      </View>

      <StatusBar style={Platform.OS === 'ios' ? 'light' : 'auto'} />
    </View>
  );
}
