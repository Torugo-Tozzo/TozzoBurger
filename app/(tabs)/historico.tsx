import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, FlatList, Alert, TouchableOpacity, useColorScheme, ActivityIndicator, Modal, RefreshControl } from 'react-native';
import { Text, View } from '@/components/Themed';
import { useVendasDatabase } from '@/database/useVendaDatabse';
import { useAutoSync } from '@/context/AutoSyncContext';
import { useSyncRefresh } from '@/hooks/useSyncRefresh';
import { VendaDatabase } from '@/database/types/Venda';
import { useProductDatabase } from '@/database/useProductDatabase';
import { usePrinterDatabase } from '@/database/usePrinterDatabase';
import { useFocusEffect, useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { formatarVendaParaImpressao } from '@/hooks/formatarVendaImpressao';
import { Produto } from '@/hooks/formatarVendaImpressao';
import { sendMessageToDevice } from '@/useBLE';
import { Calendar } from 'react-native-calendars';
import Colors from '@/constants/Colors';
import { EmptyState } from '@/components/ui/EmptyState';

export default function HistoricoScreen() {
  const [vendas, setVendas] = useState<Record<string, VendaDatabase[]>>({});
  const [searchDate, setSearchDate] = useState(new Date());
  const [showCalendar, setShowCalendar] = useState(false);
  const [loading, setLoading] = useState(true);
  const { listVendasRecentes, listVendasPorDia, removeVenda, getVendaById } = useVendasDatabase();
  const { lastSync } = useAutoSync();
  const { refreshing, onRefresh } = useSyncRefresh();
  const { showAdd } = useProductDatabase();
  const { getPrinter } = usePrinterDatabase();
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const [title, setTitle] = useState('Histórico de Vendas (Últimos 3 dias)');
  const [loadingPrint, setLoadingPrint] = useState<string | null>(null);

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
    dateContainer: {
      width: '100%',
      marginBottom: 20,
    },
    label: {
      fontSize: 16,
      marginBottom: 8,
      fontWeight: '500',
    },
    dateButton: {
      padding: 12,
      borderRadius: 8,
      width: '100%',
      borderWidth: 1,
      borderColor: colors.border,
    },
    dateText: {
      fontSize: 16,
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
      backgroundColor: colors.primary,
      borderRadius: 5,
      justifyContent: 'center',
      alignItems: 'center',
      marginHorizontal: 5,
      width: 60,
    },
    searchButton: {
      backgroundColor: colors.primary,
      padding: 10,
      borderRadius: 8,
      width: '100%',
      alignItems: 'center',
    },
    searchButtonText: {
      color: 'white',
      fontSize: 16,
      fontWeight: 'bold',
    },
    Greenbutton: {
      padding: 10,
      backgroundColor: colors.primary,
      borderRadius: 5,
      justifyContent: 'center',
      alignItems: 'center',
      marginHorizontal: 5,
      width: 60,
    },
    Redbutton: {
      padding: 10,
      backgroundColor: Colors.status.danger,
      borderRadius: 5,
      justifyContent: 'center',
      alignItems: 'center',
      marginHorizontal: 5,
      width: 60,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    modalContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    calendarContainer: {
      width: '90%',
      padding: 20,
      borderRadius: 10,
      shadowColor: "#000",
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
      elevation: 5,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      marginBottom: 15,
      textAlign: 'center',
    },
    closeButton: {
      backgroundColor: colors.primary,
      padding: 12,
      borderRadius: 8,
      alignItems: 'center',
      marginTop: 15,
    },
    closeButtonText: {
      color: 'white',
      fontSize: 16,
      fontWeight: 'bold',
    },
    disabledColor: {
      color: colors.textMuted,
    },
    disabledBackground: {
      backgroundColor: colors.textMuted,
    },
  });

  const fetchVendas = useCallback(async () => {
    try {
      setTitle('Histórico de Vendas (Últimos 3 dias)');
      const vendasData = await listVendasRecentes();
      setVendas(vendasData);
      setLoading(false);
    } catch (error) {
      console.error(error);
      Alert.alert('Erro', 'Não foi possível carregar o histórico de vendas.');
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setSearchDate(new Date());
      fetchVendas();
    }, [fetchVendas])
  );

  useEffect(() => {
    fetchVendas();
  }, [lastSync]);

  const formatCalendarDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleSearch = async () => {
    setLoading(true);
    setTitle(`Histórico de Vendas (${searchDate.toLocaleDateString('pt-BR')})`);
    const formattedDate = formatCalendarDate(searchDate);

    try {
      const vendasData = await listVendasPorDia(formattedDate);
      setVendas({ [searchDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '/')]: vendasData });
    } catch (error) {
      console.error(error);
      Alert.alert('Erro', 'Não foi possível buscar as vendas para a data especificada.');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = async (vendaId: string) => {
    setLoadingPrint(vendaId);
    let venda = await getVendaById(vendaId);
    if (!venda) {
      setLoadingPrint(null);
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
      setLoadingPrint(null);
    }
  };

  const handleExcluir = (vendaId: string) => {
    Alert.alert(
      'Confirmar Exclusão',
      'Tem certeza de que deseja excluir esta venda?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          onPress: async () => {
            try {
              await removeVenda(vendaId);
              setVendas((prevVendas) => {
                const updatedVendas = { ...prevVendas };
                Object.entries(updatedVendas).forEach(([data, vendasPorData]) => {
                  updatedVendas[data] = vendasPorData.map((venda) =>
                    venda.id === vendaId ? { ...venda, excluida: true } : venda
                  );
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

  const renderVendaItem = ({ item, index }: { item: VendaDatabase & { produtos: string[] }; index: number }) => (
    <View style={styles.item} lightColor={Colors.light.surface} darkColor={Colors.dark.surface}>
      <Text
        style={[
          styles.itemTextTitle,
          item.excluida == true && { textDecorationLine: 'line-through', color: styles.disabledColor.color },
        ]}
      >
        Venda #{index + 1}
      </Text>
      <Text
        style={[
          styles.itemText,
          item.excluida == true && { textDecorationLine: 'line-through', color: styles.disabledColor.color },
        ]}
      >
        Cliente: {item.cliente} | Horário: {new Date(item.horario).toLocaleTimeString()}
      </Text>
      <Text
        style={[
          styles.itemTextTitle,
          item.excluida == true && { textDecorationLine: 'line-through', color: styles.disabledColor.color },
        ]}
      >
        Total: R$ {item.total.toFixed(2)}
      </Text>
      <Text
        style={[
          { fontWeight: 'bold' },
          item.excluida == true && { textDecorationLine: 'line-through', color: styles.disabledColor.color },
        ]}
      >
        Itens: {item.produtos.join(', ')}
      </Text>
      <View style={styles.buttonContainer} lightColor={Colors.light.surface} darkColor={Colors.dark.surface}>
        <TouchableOpacity
          onPress={() => router.push(`/modais/contaHistoricoModal?vendaId=${item.id}`)}
          style={[styles.button, item.excluida == true && { backgroundColor: styles.disabledBackground.backgroundColor }]}
          disabled={item.excluida == true}
        >
          <FontAwesome name="eye" size={20} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => handlePrint(item.id)}
          style={[styles.Greenbutton, item.excluida == true && { backgroundColor: styles.disabledBackground.backgroundColor }]}
          disabled={loadingPrint === item.id || item.excluida == true}
        >
          {loadingPrint === item.id ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <FontAwesome name="print" size={20} color="#fff" />
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => handleExcluir(item.id)}
          style={[styles.Redbutton, item.excluida == true && { backgroundColor: styles.disabledBackground.backgroundColor }]}
          disabled={item.excluida == true}
        >
          <FontAwesome name="trash" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderVendasPorData = (data: string, vendas: (VendaDatabase & { produtos: string[] })[]) => {
    const totalVendas = vendas
      .filter((venda) => venda.excluida != true)
      .reduce((acc, venda) => acc + venda.total, 0)
      .toFixed(2);

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

      <View style={styles.dateContainer}>
        <Text style={styles.label}>Selecione uma data:</Text>
        <TouchableOpacity 
          style={styles.dateButton} 
          onPress={() => setShowCalendar(true)}
        >
          <Text style={styles.dateText}>
            {searchDate.toLocaleDateString('pt-BR', { 
              weekday: 'short', 
              day: '2-digit', 
              month: '2-digit', 
              year: 'numeric' 
            })}
          </Text>
        </TouchableOpacity>
        
        <Modal
          visible={showCalendar}
          transparent={true}
          animationType="slide"
        >
          <View style={styles.modalContainer}>
            <View style={styles.calendarContainer}>
              <Text style={styles.modalTitle}>Selecione a Data</Text>
              
              <Calendar
                current={formatCalendarDate(searchDate)}
                onDayPress={(day: {timestamp: number; dateString: string; day: number; month: number; year: number}) => {
                  const selectedDate = new Date(day.year, day.month - 1, day.day, 12, 0, 0);
                  setSearchDate(selectedDate);
                  setShowCalendar(false);
                }}
                markedDates={{
                  [formatCalendarDate(searchDate)]: {
                    selected: true,
                    selectedColor: colors.primary,
                  }
                }}
                theme={{
                  calendarBackground: colors.surface,
                  textSectionTitleColor: colors.textMuted,
                  selectedDayBackgroundColor: colors.primary,
                  selectedDayTextColor: colors.background,
                  todayTextColor: colors.primary,
                  dayTextColor: colors.text,
                  textDisabledColor: colors.textMuted,
                  dotColor: colors.primary,
                  selectedDotColor: colors.background,
                  arrowColor: colors.primary,
                  monthTextColor: colors.text,
                  indicatorColor: colors.primary,
                }}
                firstDay={0}
              />
              
              <TouchableOpacity 
                style={styles.closeButton}
                onPress={() => setShowCalendar(false)}
              >
                <Text style={styles.closeButtonText}>Fechar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>

      <TouchableOpacity 
        style={styles.searchButton}
        onPress={handleSearch}
      >
        <Text style={styles.searchButtonText}>Buscar</Text>
      </TouchableOpacity>

      <View style={styles.separator} />

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={Object.entries(vendas)}
          renderItem={({ item }) => {
            const [data, vendasDoDia] = item as [string, (VendaDatabase & { produtos: string[] })[]];
            return renderVendasPorData(data, vendasDoDia);
          }}
          keyExtractor={(item) => item[0]}
          showsVerticalScrollIndicator={true}
          style={{ flex: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<EmptyState icon="clock-o" title="Nenhuma venda no período" message="Busque outra data ou aguarde novas vendas." />}
        />
      )}
    </View>
  );
}
