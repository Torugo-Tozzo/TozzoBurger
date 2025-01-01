import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet, FlatList, Alert, TouchableOpacity, TextInput, useColorScheme } from 'react-native';
import { Text, View } from '@/components/Themed';
import { useCart } from '@/context/CartContext';  // Importando corretamente o useCart
import { useVendasDatabase } from '@/database/useVendaDatabse';
import { router } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useState } from 'react';
import { formatarVendaParaImpressao, Produto } from '@/hooks/formatarVendaImpressao';
import { useProductDatabase } from '@/database/useProductDatabase';
import { usePrinterDatabase } from '@/database/usePrinterDatabase';
import { sendMessageToDevice } from '@/useBLE';

export default function ContaModalScreen() {
  const { cart, clearCart, updateCartItem } = useCart(); // Acessando o carrinho e a função de atualizar o item
  const { createVenda } = useVendasDatabase();
  const [cliente, setCliente] = useState('');
  const { getVendaById } = useVendasDatabase();
  const { getPrinter } = usePrinterDatabase();
  const { showAdd } = useProductDatabase();

  const colorScheme = useColorScheme();
  const placeholderColor = colorScheme === "dark" ? "#ccc" : "#666";
  const [loadingPrint, setLoadingPrint] = useState<number | null>(null);

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

  const handlePrint = async (vendaId: number) => {
    setLoadingPrint(vendaId); // Ativar o estado de carregamento
    let venda = await getVendaById(vendaId);
    if (!venda) {
      setLoadingPrint(null); // Desativar carregamento caso venda não exista
      return;
    }

    const produtos: Produto[] = await Promise.all(
      venda.produtos.map(async (produto) => {
        let prodInfos = await showAdd(produto.produtoId);
        return {
          nome: prodInfos?.nome ?? "Produto desconhecido",
          quantidade: produto.quantidade,
          preco: prodInfos?.preco ?? 0,
        };
      })
    );

    let printContent = await formatarVendaParaImpressao(venda, produtos);

    try {
      await sendMessageToDevice(printContent, await getPrinter());
      Alert.alert("Sucesso", "Conta enviada para impressão.");
    } catch (error) {
      Alert.alert("Erro", `${error}`);
    } finally {
      setLoadingPrint(null); // Desativar carregamento ao finalizar
    }
  };

  const imprimeConta = async (vendaId: number): Promise<void> => await handlePrint(vendaId);

  const finalizarCompra = async () => {
    try {
      const produtos = cart.map(({ id, quantidade }) => ({
        produtoId: id,
        quantidade: quantidade ?? 0,
      }));

      const { vendaId } = await createVenda(produtos, cliente);
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

  const alterarQuantidade = (itemId: number, operacao: 'incrementar' | 'decrementar') => {
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
    fleNome: {
      flex: 1,
    },
    totalText: {
      fontSize: 18,
      fontWeight: "bold",
      marginVertical: 20,
    },
    quantityControls: {
      flexDirection: "row",
      alignItems: "center",
    },
    quantityButton: {
      backgroundColor: "#007BFF",
      padding: 5,
      borderRadius: 5,
      marginHorizontal: 10,
    },
    quantityButtonText: {
      color: "#fff",
      fontSize: 18,
      fontWeight: "bold",
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
    input: {
      width: '100%',
      padding: 10,
      marginVertical: 10,
      borderWidth: 1,
      borderColor: '#ccc',
      borderRadius: 5,
      color: colorScheme === "dark" ? "#fff" : "#000"
    }
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title} lightColor="black" darkColor="white">
        Carrinho de Compras
      </Text>
      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />
      <TextInput
        style={styles.input}
        placeholder="Nome do Cliente"
        value={cliente}
        onChangeText={setCliente}
        placeholderTextColor={placeholderColor}
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
                <FontAwesome name="minus" size={20} color="white" />
              </TouchableOpacity>

              <Text style={styles.itemText}>{item.quantidade}</Text>

              <TouchableOpacity
                onPress={() => alterarQuantidade(item.id, 'incrementar')}
                style={styles.quantityButton}
              >
                <FontAwesome name="plus" size={20} color="white" />
              </TouchableOpacity>
            </View>
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