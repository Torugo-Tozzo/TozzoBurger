import React, { useEffect, useState } from 'react';
import { StyleSheet, FlatList, Alert, TouchableOpacity, TextInput, Button, ScrollView, useColorScheme } from 'react-native';
import { Text, View } from '@/components/Themed';
import { useVendasDatabase, VendaDatabase } from '@/database/useVendaDatabse';
import { useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';

export default function HistoricoScreen() {
  const [vendas, setVendas] = useState<Record<string, VendaDatabase[]>>({});
  const [searchDate, setSearchDate] = useState('');
  const { listVendasRecentes, listVendasPorDia, removeVenda } = useVendasDatabase();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const placeholderColor = colorScheme === "dark" ? "#ccc" : "#666";
  const [title, setTitle] = useState('Histórico de Vendas (Últimos 5 dias)');

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      padding: 20,
    },
    title: {
      fontSize: 24,
      fontWeight: 'bold',
      marginBottom: 20,
    },
    input: {
      height: 40,
      borderColor: 'gray',
      borderWidth: 1,
      marginBottom: 10,
      borderRadius: 5,
      paddingHorizontal: 10,
      color: colorScheme === "dark" ? "#fff" : "#000"
    },
    separator: {
      marginVertical: 10,
      height: 1,
    },
    item: {
      marginBottom: 15,
      padding: 10,
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
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 10,
      paddingHorizontal: 20,
    },
    button: {
      padding: 10,
      backgroundColor: '#007bff',
      borderRadius: 5,
      justifyContent: 'center',
      alignItems: 'center',
      marginHorizontal: 5,
      width: 60,
    },
    Redbutton: {
      padding: 10,
      backgroundColor: 'red',
      borderRadius: 5,
      justifyContent: 'center',
      alignItems: 'center',
      marginHorizontal: 5,
      width: 60,
    },
  });

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

  const handleSearch = async () => {
    if (searchDate.trim() === '') {
      setTitle('Histórico de Vendas (Últimos 5 dias)');
      setVendas(await listVendasRecentes());
      return;
    }
  
    const dateParts = searchDate.split('-');
    if (dateParts.length !== 3) {
      Alert.alert('Erro', 'Formato de data inválido. Use DD-MM-YYYY.');
      return;
    }
  
    const formattedDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
  
    try {
      const vendasData = await listVendasPorDia(formattedDate);
      setVendas({ [formattedDate]: vendasData });
      setTitle(`Histórico de Vendas (${searchDate})`);
    } catch (error) {
      console.error(error);
      Alert.alert('Erro', 'Não foi possível buscar as vendas para a data especificada.');
    }
  };  

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
    <View style={styles.item} lightColor="whitesmoke" darkColor="grey">
      <Text style={styles.itemText}>Venda ID: {item.id}</Text>
      <Text style={styles.itemText}>Total: R$ {item.total.toFixed(2)}</Text>
      <Text style={styles.itemText}>
        Data: {new Date(item.horario).toLocaleDateString()} | Horário: {new Date(item.horario).toLocaleTimeString()}
      </Text>

      <View style={styles.buttonContainer} lightColor="whitesmoke" darkColor="grey">
        <TouchableOpacity
          onPress={() => router.push(`/modais/contaHistoricoModal?vendaId=${item.id}`)}
          style={styles.button}
        >
          <FontAwesome name="eye" size={20} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => handleExcluir(item.id)} style={styles.Redbutton}>
          <FontAwesome name="trash" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderVendasPorData = (data: string, vendas: VendaDatabase[]) => {
    const totalVendas = vendas.reduce((acc, venda) => acc + venda.total, 0).toFixed(2);
  
    const hoje = new Date();
    const ontem = new Date(hoje);
    ontem.setDate(hoje.getDate() - 1);
  
    const [dia, mes, ano] = data.split('/');
    const dataFormatada = `${ano}-${mes}-${dia}`;
  
    const dataRenderizada =
      dataFormatada === hoje.toISOString().split("T")[0]
        ? "Hoje"
        : dataFormatada === ontem.toISOString().split("T")[0]
        ? "Ontem"
        : data;
  
    return (
      <View key={data}>
        <Text style={styles.dateHeader}>
          {dataRenderizada} - Total: R$ {totalVendas}
        </Text>
        <FlatList
          data={vendas}
          renderItem={renderVendaItem}
          keyExtractor={(item) => String(item.id)}
        />
      </View>
    );
  };    

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>

      <TextInput
        style={styles.input}
        placeholder="Digite uma data (DD-MM-YYYY)"
        value={searchDate}
        onChangeText={setSearchDate}
        placeholderTextColor={placeholderColor}
      />
      <Button title="Buscar" onPress={handleSearch} />

      <View style={styles.separator} />

      <FlatList
        data={Object.entries(vendas)}
        renderItem={({ item }) => renderVendasPorData(item[0], item[1])}
        keyExtractor={(item) => item[0]}
        showsVerticalScrollIndicator={true}
        style={{ flex: 1 }}
      />
    </View>
  );
}