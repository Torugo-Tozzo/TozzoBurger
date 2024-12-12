import React, { useEffect, useState } from 'react';
import { StyleSheet, FlatList, Alert, TouchableOpacity } from 'react-native';
import { Text, View } from '@/components/Themed';
import { useVendasDatabase, VendaDatabase } from '@/database/useVendaDatabse';
import { useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';

export default function HistoricoScreen() {
  const [vendas, setVendas] = useState<Record<string, VendaDatabase[]>>({});
  const { listVendasRecentes, removeVenda } = useVendasDatabase();
  const router = useRouter();

  useEffect(() => {
    const fetchVendas = async () => {
      try {
        const vendasData = await listVendasRecentes();
        setVendas(vendasData);
      } catch (error) {
        console.error(error);
        Alert.alert('Erro', 'Não foi possível carregar o histórico de vendas.');
      }
    };

    fetchVendas();
  }, []);

  const handleExcluir = (vendaId: number) => {
    Alert.alert(
      'Confirmar Exclusão',
      'Tem certeza de que deseja excluir esta venda?',
      [
        {
          text: 'Cancelar',
          style: 'cancel',
        },
        {
          text: 'Excluir',
          onPress: async () => {
            try {
              await removeVenda(vendaId);
              setVendas((prevVendas) => {
                const updatedVendas = { ...prevVendas };
                Object.entries(updatedVendas).forEach(([data, vendasPorData]) => {
                  updatedVendas[data] = vendasPorData.filter((venda) => venda.id !== vendaId);
                });
                return updatedVendas;
              });
            } catch (error) {
              console.error(error);
              Alert.alert('Erro', 'Não foi possível excluir a venda.');
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  const renderVendaItem = ({ item }: { item: VendaDatabase }) => (
    <View style={styles.item}>
      <Text style={styles.itemText}>Venda ID: {item.id}</Text>
      <Text style={styles.itemText}>Total: R$ {item.total.toFixed(2)}</Text>
      <Text style={styles.itemText}>
        Data: {new Date(item.horario).toLocaleDateString()} | Horário: {new Date(item.horario).toLocaleTimeString()}
      </Text>

      <View style={styles.buttonContainer}>
        <TouchableOpacity onPress={() => handleExcluir(item.id)} style={styles.Redbutton}>
          <FontAwesome name="trash" size={20} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.push(`/modais/contaHistoricoModal?vendaId=${item.id}`)}
          style={styles.button}
        >
          <FontAwesome name="eye" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
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
  buttonContainer: {
    flexDirection: 'row',
    marginTop: 10,
    
  },
  button: {
    padding: 10,
    backgroundColor: '#007bff',
    borderRadius: 5,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 5,
  },
  Redbutton: {
    padding: 10,
    backgroundColor: 'red',
    borderRadius: 5,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 5,
  },
});
