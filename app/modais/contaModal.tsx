import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet, FlatList, Alert, TouchableOpacity } from 'react-native';
import { Text, View } from '@/components/Themed';
import { useCart } from '@/context/CartContext';  // Importando corretamente o useCart
import { useVendasDatabase } from '@/database/useVendaDatabse';
import { router } from 'expo-router';

export default function ContaModalScreen() {
  const { cart, clearCart } = useCart(); // Acessando o carrinho através do hook useCart
  const { createVenda } = useVendasDatabase();

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

  const finalizarCompra = async () => {
    try {
      const produtos = cart.map(({ id, quantidade }) => ({
        produtoId: id,
        quantidade: quantidade ?? 0,
      }));

      const { vendaId } = await createVenda(produtos);

      Alert.alert(
        "Compra Finalizada",
        `A compra foi concluída com sucesso!`
      );
      clearCart(); // Limpa o carrinho após finalizar a compra
      router.push('/historico');
    } catch (error) {
      console.error(error);
      Alert.alert("Erro", "Não foi possível finalizar a compra.");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title} lightColor="black" darkColor="white">
        Carrinho de Compras
      </Text>
      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />

      <FlatList
        data={cart}
        keyExtractor={(item) => String(item.id)}  // Garantir que o item tem id
        renderItem={({ item }) => (
          <View style={styles.cartItem}>
            <Text style={styles.itemText}>( {item.quantidade}x )  {item.nome}</Text>
            <Text style={styles.itemText}>Preço Unitário: {item.preco.toFixed(2)}</Text>
            <Text style={styles.itemText}> R$ {((item.quantidade ?? 0) * item.preco).toFixed(2)}</Text>
          </View>
        )}
      />

      <Text style={styles.totalText}>Total: R$ {total.toFixed(2)}</Text>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.button, isCartEmpty && styles.buttonDisabled]}  // Aplicar estilo para botão desabilitado
          onPress={limparConta}
          disabled={isCartEmpty}  // Desabilitar botão se o carrinho estiver vazio
        >
          <Text style={styles.buttonText}>Limpar Conta</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.button, isCartEmpty && styles.buttonDisabled]}  // Aplicar estilo para botão desabilitado
          onPress={finalizarCompra}
          disabled={isCartEmpty}  // Desabilitar botão se o carrinho estiver vazio
        >
          <Text style={styles.buttonText}>Finalizar Compra</Text>
        </TouchableOpacity>
      </View>

      <StatusBar style={Platform.OS === 'ios' ? 'light' : 'auto'} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#fff",
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
    backgroundColor: "#ddd",
  },
  cartItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  itemText: {
    fontSize: 16,
  },
  totalText: {
    fontSize: 18,
    fontWeight: "bold",
    marginVertical: 20,
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  button: {
    backgroundColor: "#007BFF",
    padding: 10,
    borderRadius: 8,
    flex: 1,
    marginHorizontal: 5,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  buttonDisabled: {
    backgroundColor: "#A1A1A1",  // Cor de fundo para o botão desabilitado
  },
});
