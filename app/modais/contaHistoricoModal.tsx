import React, { useState } from 'react';
import { StyleSheet, FlatList, Alert, ActivityIndicator, TouchableOpacity, Text as RNText } from 'react-native';
import { Text, View } from '@/components/Themed';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useVendasDatabase, VendaDatabase } from '@/database/useVendaDatabse';
import { useProductDatabase } from '@/database/useProductDatabase';
import { sendMessageToDevice } from '@/useBLE';
import { usePrinterDatabase } from '@/database/usePrinterDatabase';
import { formatarVendaParaImpressao } from '@/hooks/formatarVendaImpressao';

export default function ContaHistoricoModal() {
  const { vendaId } = useLocalSearchParams();
  const { getVendaById } = useVendasDatabase();
  const { showAdd: getProductById } = useProductDatabase();
  const { getPrinter } = usePrinterDatabase();
  const router = useRouter();

  const [venda, setVenda] = useState<VendaDatabase | null>(null);
  const [produtos, setProdutos] = useState<{ nome: string; quantidade: number; preco: number }[]>([]);
  const [isPrinterConnected, setIsPrinterConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingPrint, setLoadingPrint] = useState<number | null>(null);

  useFocusEffect(
    React.useCallback(() => {
      async function fetchPrinter() {
        try {
          setIsPrinterConnected(false); // Reseta o estado antes da verificação
          const printer = await getPrinter(); // Verifica se há uma impressora registrada
          setIsPrinterConnected(printer.uuid !== null); // Atualiza o estado com o resultado
        } catch (error) {
          console.error('Erro ao verificar impressora:', error);
        } finally {
          setIsLoading(false); // Indica que o carregamento terminou
        }
      }

      async function fetchVenda() {
        try {
          if (!vendaId) {
            Alert.alert('Erro', 'ID da venda não fornecido.');
            router.back();
            return;
          }

          const vendaData = await getVendaById(Number(vendaId));
          if (!vendaData) {
            Alert.alert('Erro', 'Venda não encontrada.');
            router.back();
            return;
          }

          setVenda(vendaData);

          const produtosComNomes = await Promise.all(
            vendaData.produtos.map(async (produto) => {
              const produtoData = await getProductById(produto.produtoId);
              return {
                nome: produtoData?.nome || 'Produto não encontrado',
                quantidade: produto.quantidade,
                preco: produtoData?.preco || 0,
              };
            })
          );

          setProdutos(produtosComNomes);
        } catch (error) {
          console.error('Erro ao carregar a venda:', error);
          Alert.alert('Erro', 'Não foi possível carregar os detalhes da venda.');
          router.back();
        }
      }

      setIsLoading(true); // Inicia o carregamento
      fetchPrinter();
      fetchVenda();
    }, [vendaId])
  );

  const handlePrint = async () => {
    if (!venda) return;

    setLoadingPrint(venda?.id);

    let printContent = await formatarVendaParaImpressao(venda, produtos);

    try {
      await sendMessageToDevice(printContent, await getPrinter());
    } catch (error) {
      Alert.alert('Erro', `${error}`);
      return;
    } finally {
      setLoadingPrint(null); // Desativar carregamento ao finalizar
    }
    Alert.alert('Sucesso', 'Conta enviada para impressão.');
  };

  const renderItem = ({ item }: { item: { nome: string; quantidade: number; preco: number } }) => (
    <View style={styles.item} darkColor="grey" lightColor="whitesmoke">
      <View style={styles.itemRow} darkColor="grey" lightColor="whitesmoke">
        <Text style={styles.itemTextLeft}>
          ({item.quantidade}x) {item.nome}
        </Text>
        <Text style={styles.itemTextRight}>R$ {item.preco.toFixed(2)}</Text>
      </View>
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text>Carregando...</Text>
      </View>
    );
  }

  if (!venda) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Carregando detalhes da venda...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Detalhes da Venda {venda.id}</Text>
      <View style={styles.separator} />

      <Text style={styles.detailText}>
        Data: {new Date(venda.horario).toLocaleDateString()}
      </Text>
      <Text style={styles.detailText}>
        Horário: {new Date(venda.horario).toLocaleTimeString()}
      </Text>
      <Text style={styles.detailText}>Cliente: {venda.cliente}</Text>
      <View style={styles.separator} />
      <Text style={styles.subtitle}>Produtos</Text>

      <FlatList
        data={produtos}
        renderItem={renderItem}
        keyExtractor={(item, index) => String(index)}
      />
      <Text style={styles.title}>Total: R$ {venda.total.toFixed(2)}</Text>
      <View style={styles.separator} />

      <TouchableOpacity
        style={[
          styles.button,
          (!isPrinterConnected) && styles.buttonDisabled,
        ]}
        onPress={handlePrint}
      >
        {loadingPrint ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <RNText style={styles.buttonText}>Imprimir Conta</RNText>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  separator: {
    marginVertical: 10,
    height: 1,
    backgroundColor: '#ddd',
  },
  detailText: {
    fontSize: 16,
    marginBottom: 5,
  },
  item: {
    marginBottom: 15,
    padding: 10,
    borderRadius: 5,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemTextLeft: {
    fontSize: 16,
    flex: 1,
  },
  itemTextRight: {
    fontSize: 16,
    textAlign: 'right',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 5,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#a1a1a1',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
