import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet, FlatList, Alert, TouchableOpacity, TextInput, useColorScheme } from 'react-native';
import { Text, View } from '@/components/Themed';
import { useCart } from '@/context/CartContext';  // Importando corretamente o useCart
import { useVendasDatabase } from '@/database/useVendaDatabse';
import { router } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { captureScreen } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { usePedidosDatabase } from '@/database/usePedidoDatabase';
import { useProductDatabase } from '@/database/useProductDatabase';
import { useAuth } from '@/context/AuthContext';
import { useAutoSync } from '@/context/AutoSyncContext';
import { Button } from '@/components/ui/Button';
import Colors from '@/constants/Colors';
import { spacing, radius } from '@/constants/theme';

export default function ContaModalScreen() {
  const { cart, clearCart, updateCartItem, addToCart } = useCart();
  const { createVenda } = useVendasDatabase();
  const { createPedido, getPedidoById, countPedidosAbertos } = usePedidosDatabase();
  const { show: showProduto } = useProductDatabase();
  const { user } = useAuth();
  const isCliente = user?.role === 'CLIENTE';
  const { triggerSync } = useAutoSync();
  const [cliente, setCliente] = useState(isCliente ? (user?.nome ?? '') : '');

  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const placeholderColor = colors.textMuted;

  const total = cart.reduce((sum, item) => {
    const quantidade = item.quantidade ?? 0; // Se quantidade for null ou undefined, usamos 0
    return sum + item.preco * quantidade;
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

  const imprimeConta = async (vendaId: string): Promise<void> => await router.push(`/modais/contaHistoricoModal?vendaId=${vendaId}`);

  const finalizarCompra = async () => {
    try {
      const produtos = cart.map(({ id, quantidade }) => ({
        produtoId: id,
        quantidade: quantidade ?? 0,
      }));

      const { vendaId } = await createVenda(produtos, cliente, user?.id, user?.nome ?? null);
      await clearCart(); 
      router.back(); 

      Alert.alert("Venda Realizada!", "Deseja imprimir a Conta?", [
        { text: "Não", style: "cancel" },
        {
          text: "Sim",
          onPress: () => imprimeConta(vendaId),
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
        const abertos = await countPedidosAbertos(user?.id);
        if (abertos >= 3) {
          Alert.alert('Limite atingido', 'Você já possui 3 pedidos abertos. Aguarde um ser aceito ou fechado para criar outro.');
          return;
        }
      }

      const produtos = cart.map(({ id, quantidade }) => ({
        produtoId: id,
        quantidade: quantidade ?? 0,
      }));

      const { pedidoId } = await createPedido(produtos, cliente, undefined, user?.id, user?.nome ?? null);
      await clearCart();
      triggerSync().catch((e) => console.warn('[sync] trigger failed', e));
      router.back();
      Alert.alert('Pedido Gerado!', `Pedido ${pedidoId} criado com sucesso.`);
    } catch (error) {
      console.error('Erro ao gerar pedido:', error);
      Alert.alert('Erro', 'Não foi possível gerar o pedido.');
    }
  };

  const alterarQuantidade = (itemId: string, operacao: 'incrementar' | 'decrementar') => {
    const item = cart.find((cartItem) => cartItem.id === itemId);
    if (!item) return;

    const novaQuantidade = operacao === 'incrementar' ? (item.quantidade ?? 0) + 1 : (item.quantidade ?? 0) - 1;

    if (novaQuantidade <= 0) {
      // Se a quantidade for zero ou negativa, removemos o item
      updateCartItem(itemId, 0);  // A quantidade vira 0 e o item sai do carrinho
    } else {
      updateCartItem(itemId, novaQuantidade);  // Atualiza a quantidade
    }
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      padding: 20
    },
    title: {
      fontSize: 24,
      fontWeight: "bold",
      marginBottom: 20,
    },
    separator: {
      marginVertical: 10,
      height: 1,
      width: "100%",
      backgroundColor: colors.border,
    },
    cartItem: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 10,
    },
    itemText: {
      fontSize: 16,
    },
    fleNome: {
      flex: 1,
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
    },
    quantityButton: {
      backgroundColor: colors.primary,
      padding: 5,
      borderRadius: 5,
      marginHorizontal: 10,
    },
    topRow: { flexDirection: 'row', marginTop: spacing.md, alignItems: 'center' },
    bottomRow: { flexDirection: 'row', marginTop: spacing.md, alignItems: 'center' },
    iconBtn: { backgroundColor: colors.primary, padding: spacing.md, borderRadius: radius.md, flex: 3, marginRight: spacing.sm, alignItems: 'center', justifyContent: 'center' },
    iconBtnDanger: { backgroundColor: Colors.status.danger, padding: spacing.md, borderRadius: radius.md, flex: 3, marginRight: spacing.sm, alignItems: 'center', justifyContent: 'center' },
    ctaFlex: { flex: 7 },
    buttonDisabled: { opacity: 0.5 },
    input: {
      width: '100%',
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
      <Text style={styles.title}>
        Carrinho de Compras
      </Text>
      <View style={styles.separator} />
      <TextInput
        style={[styles.input, isCliente && { backgroundColor: colors.surface }]}
        placeholder="Nome do Cliente"
        value={cliente}
        onChangeText={setCliente}
        placeholderTextColor={placeholderColor}
        editable={!isCliente}
      />
      <FlatList
        data={cart}
        keyExtractor={(item) => String(item.id)}  // Garantir que o item tem id
        renderItem={({ item }) => (
          <View style={styles.cartItem}>
            <Text style={[styles.itemText, styles.fleNome]}>{item.nome}</Text>
            <Text style={styles.itemText}>R$ {((item.quantidade ?? 0) * item.preco).toFixed(2)}</Text>

            <View style={styles.quantityControls}>
              <TouchableOpacity
                onPress={() => alterarQuantidade(item.id, 'decrementar')}
                style={styles.quantityButton}
              >
                <FontAwesome name="minus" size={20} color={colors.background} />
              </TouchableOpacity>

              <Text style={styles.itemText}>{item.quantidade}</Text>

              <TouchableOpacity
                onPress={() => alterarQuantidade(item.id, 'incrementar')}
                style={styles.quantityButton}
              >
                <FontAwesome name="plus" size={20} color={colors.background} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

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