import React, { useEffect, useState } from 'react';
import { StyleSheet, FlatList, Alert, Button, ScrollView } from 'react-native';
import { Text, View } from '@/components/Themed';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useVendasDatabase, VendaDatabase } from '@/database/useVendaDatabse';
import { useProductDatabase } from '@/database/useProductDatabase';
import { imprimir, listNearbyDevices, connectToDevice } from '@/useBLE'; // Importa funções BLE
import { getConnectedDevice } from '../(tabs)/bluetooth';

export default function ContaHistoricoModal() {
  const { vendaId } = useLocalSearchParams();
  const { getVendaById } = useVendasDatabase();
  const { show: getProductById } = useProductDatabase();
  const router = useRouter();

  const [venda, setVenda] = useState<VendaDatabase | null>(null);
  const [produtos, setProdutos] = useState<{ nome: string; quantidade: number }[]>([]);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const device = getConnectedDevice();

  useEffect(() => {
    setDeviceName(device ? device.name || 'Dispositivo Desconhecido' : 'Nenhum dispositivo conectado');
  }, []);

  useEffect(() => {
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

    fetchVenda();
  }, [vendaId]);

  const handlePrint = async () => {
    if (!venda) return;
  
    if (!getConnectedDevice) {
      Alert.alert('Erro', 'Nenhum dispositivo conectado. Por favor, conecte-se a um dispositivo primeiro.');
      return;
    }
  
    let printContent = `--- Detalhes da Venda ---\n`;
    printContent += `ID da Venda: ${venda.id}\n`;
    printContent += `Data: ${new Date(venda.horario).toLocaleDateString()}\n`;
    printContent += `Horário: ${new Date(venda.horario).toLocaleTimeString()}\n`;
    printContent += `Total: R$ ${venda.total.toFixed(2)}\n\n`;
    printContent += `--- Produtos ---\n`;
  
    produtos.forEach((produto, index) => {
      printContent += `${index + 1}. ${produto.nome} - Quantidade: ${produto.quantidade}\n`;
    });
  
    printContent += `\n------------------------`;
  
    try {
      await imprimir(device, printContent);
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
      <Button title="Imprimir Conta" onPress={handlePrint} color="#007AFF" />
    </View>
  );  
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20
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
