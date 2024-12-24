import React, { useState } from 'react';
import { StyleSheet, FlatList, Alert, Button, ActivityIndicator } from 'react-native';
import { Text, View } from '@/components/Themed';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useVendasDatabase, VendaDatabase } from '@/database/useVendaDatabse';
import { useProductDatabase } from '@/database/useProductDatabase';
import { sendMessageToDevice } from '@/useBLE';
import { usePrinterDatabase } from '@/database/usePrinterDatabase';

export default function ContaHistoricoModal() {
  const { vendaId } = useLocalSearchParams();
  const { getVendaById } = useVendasDatabase();
  const { show: getProductById } = useProductDatabase();
  const { getPrinter } = usePrinterDatabase();
  const router = useRouter();

  const [venda, setVenda] = useState<VendaDatabase | null>(null);
  const [produtos, setProdutos] = useState<{ nome: string; quantidade: number }[]>([]);
  const [isPrinterConnected, setIsPrinterConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

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
  
    // Criando uma string com todos os detalhes da venda e dos produtos na ordem correta
    let printContent = `
      \u001b!\u0030\u001bE\u0001TOZZO BURGER\u001bE\u0001\u001b!\u0000
      \n--- Detalhes da Venda ---
      \nID da Venda: ${venda.id}
      \nData: ${new Date(venda.horario).toLocaleDateString()} às ${new Date(venda.horario).toLocaleTimeString()}
      \n--- Itens da Venda ---
    `;
  
    // Adicionando os produtos na string de impressão
    produtos.forEach((produto, index) => {
      printContent += `\n${index + 1}. ( ${produto.quantidade}x ) ${produto.nome}.......valor\n`;
    });

    printContent += `\u001b$a------------------------------\n`;

    // Total à esquerda, linha pontilhada no meio e valor à direita
    let totalLinha = `\u001b_TOTAL:\t\tR$ ${venda.total.toFixed(2)}\t\t`; 
    
    printContent += `${totalLinha}\n`;
    printContent += '\n\n-------fim---------\n\n\n\n\n';
    
    try {
      console.log("String de impressão final:", printContent);
      await sendMessageToDevice(printContent, await getPrinter());
      Alert.alert('Sucesso', 'Conta enviada para impressão.');
    } catch (error) {
      console.error('Erro ao imprimir:', error);
      Alert.alert('Erro', 'Falha ao enviar para impressão.');
    }
  };  

  const renderItem = ({ item }: { item: { nome: string; quantidade: number } }) => (
    <View style={styles.item} lightColor="#f9f9f9" darkColor="grey">
      <Text style={styles.itemText}>
        ( {item.quantidade}x ) {item.nome}
      </Text>
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
      <Text style={styles.title}>Detalhes da Venda</Text>
      <View style={styles.separator} />

      <Text style={styles.detailText}>Venda ID: {venda.id}</Text>
      <Text style={styles.detailText}>
        Data: {new Date(venda.horario).toLocaleDateString()}
      </Text>
      <Text style={styles.detailText}>
        Horário: {new Date(venda.horario).toLocaleTimeString()}
      </Text>
      <Text style={styles.detailText}>Total: R$ {venda.total.toFixed(2)}</Text>

      <View style={styles.separator} />
      <Text style={styles.subtitle}>Produtos</Text>

      <FlatList
        data={produtos}
        renderItem={renderItem}
        keyExtractor={(item, index) => String(index)}
      />

      <View style={styles.separator} />
      <Button
        title="Imprimir Conta"
        onPress={handlePrint}
        color="#007AFF"
        disabled={!isPrinterConnected} // Desabilita o botão caso não haja impressora registrada
      />
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
  itemText: {
    fontSize: 16,
  },
});
