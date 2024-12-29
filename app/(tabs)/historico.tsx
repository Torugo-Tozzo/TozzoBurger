import React, { useEffect, useState } from 'react';
import { StyleSheet, FlatList, Alert, TouchableOpacity, TextInput, Button, ScrollView, useColorScheme, ActivityIndicator } from 'react-native';
import { Text, View } from '@/components/Themed';
import { useVendasDatabase, VendaDatabase } from '@/database/useVendaDatabse';
import { useProductDatabase } from '@/database/useProductDatabase';
import { usePrinterDatabase } from '@/database/usePrinterDatabase';
import { useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { formatarVendaParaImpressao } from '@/hooks/formatarVendaImpressao';
import { Produto } from '@/hooks/formatarVendaImpressao';
import { sendMessageToDevice } from '@/useBLE';

export default function HistoricoScreen() {
  const [vendas, setVendas] = useState<Record<string, VendaDatabase[]>>({});
  const [searchDate, setSearchDate] = useState('');
  const { listVendasRecentes, listVendasPorDia, removeVenda, getVendaById } = useVendasDatabase();
  const { showAdd } = useProductDatabase();
  const { getPrinter } = usePrinterDatabase();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const placeholderColor = colorScheme === "dark" ? "#ccc" : "#666";
  const [title, setTitle] = useState('Histórico de Vendas (Últimos 5 dias)');
  const [loadingPrint, setLoadingPrint] = useState<number | null>(null);

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
      fontWeight: "bold",
      marginBottom: 5,
      textAlign: 'center',
    },
    itemTextTitle: {
      fontSize: 18,
      fontWeight: "bold",
      margin: 10,
      textAlign: 'center',
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
    Greenbutton: {
      padding: 10,
      backgroundColor: 'green',
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

  const renderVendaItem = ({ item }: { item: VendaDatabase & { produtos: string[] } }) => (
    <View style={styles.item} lightColor="whitesmoke" darkColor="grey">
      <Text style={styles.itemTextTitle}>Venda #{item.id}</Text>
      <Text style={styles.itemText}>Cliente: {item.cliente} | Horário: {new Date(item.horario).toLocaleTimeString()}</Text>
      <Text style={styles.itemTextTitle}>Total: R$ {item.total.toFixed(2)}</Text>
      <Text style={{ fontWeight: "bold", }}>Itens:{item.produtos.join(", ")}</Text>



      <View style={styles.buttonContainer} lightColor="whitesmoke" darkColor="grey">
        <TouchableOpacity
          onPress={() => router.push(`/modais/contaHistoricoModal?vendaId=${item.id}`)}
          style={styles.button}
        >
          <FontAwesome name="eye" size={20} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => handlePrint(item.id)}
          style={styles.Greenbutton}
          disabled={loadingPrint === item.id}
        >
          {loadingPrint === item.id ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <FontAwesome name="print" size={20} color="#fff" />
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => handleExcluir(item.id)} style={styles.Redbutton}>
          <FontAwesome name="trash" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderVendasPorData = (data: string, vendas: (VendaDatabase & { produtos: string[] })[]) => {
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
        renderItem={({ item }) => {
          const [data, vendasDoDia] = item as [string, (VendaDatabase & { produtos: string[] })[]];
          return renderVendasPorData(data, vendasDoDia);
        }}
        keyExtractor={(item) => item[0]}
        showsVerticalScrollIndicator={true}
        style={{ flex: 1 }}
      />
    </View>
  );
}