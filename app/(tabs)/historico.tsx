import { useEffect, useState } from 'react';
import { StyleSheet, FlatList, Alert } from 'react-native';
import { Text, View } from '@/components/Themed';
import { useVendasDatabase, VendaDatabase } from '@/database/useVendaDatabse'; // Certifique-se de que o hook e os tipos estão corretos

export default function HistoricoScreen() {
  const [vendas, setVendas] = useState<Record<string, VendaDatabase[]>>({}); // Estado para armazenar as vendas
  const { listVendasRecentes } = useVendasDatabase(); // Obtendo a função que lista vendas recentes

  useEffect(() => {
    const fetchVendas = async () => {
      try {
        const vendasData = await listVendasRecentes(); // Chama a função para obter as vendas
        setVendas(vendasData); // Atualiza o estado com as vendas
      } catch (error) {
        console.error(error);
        Alert.alert('Erro', 'Não foi possível carregar o histórico de vendas.');
      }
    };

    fetchVendas(); // Carrega as vendas quando o componente for montado
  }, []);

  const renderVendaItem = ({ item }: { item: VendaDatabase }) => (
    <View style={styles.item}>
      <Text style={styles.itemText}>Venda ID: {item.id}</Text>
      <Text style={styles.itemText}>Total: R$ {item.total.toFixed(2)}</Text>
      <Text style={styles.itemText}>
        Data: {new Date(item.horario).toLocaleDateString()} | Horário: {new Date(item.horario).toLocaleTimeString()}
      </Text>

    </View>
  );

  const renderVendasPorData = (data: string, vendas: VendaDatabase[]) => (
    <View key={data}>
      <Text style={styles.dateHeader}>{data}</Text>
      <FlatList
        data={vendas}
        renderItem={renderVendaItem}
        keyExtractor={(item) => String(item.id)}
      />
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Histórico de Vendas</Text>

      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />

      {Object.entries(vendas).map(([data, vendasPorData]) =>
        renderVendasPorData(data, vendasPorData)
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  separator: {
    marginVertical: 10,
    height: 1,
    backgroundColor: '#ddd',
  },
  item: {
    marginBottom: 15,
    padding: 10,
    backgroundColor: '#f9f9f9',
    borderRadius: 5,
  },
  itemText: {
    fontSize: 16,
  },
  dateHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    marginVertical: 10,
  },
});
