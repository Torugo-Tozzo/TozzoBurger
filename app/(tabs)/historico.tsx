import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, FlatList, Alert, TouchableOpacity, useColorScheme, Modal, RefreshControl } from 'react-native';
import { Text, View } from '@/components/Themed';
import { useVendasDatabase } from '@/database/useVendaDatabse';
import { useAutoSync } from '@/context/AutoSyncContext';
import { useSyncRefresh } from '@/hooks/useSyncRefresh';
import { useShouldReload } from '@/hooks/useShouldReload';
import { VendaDatabase } from '@/database/types/Venda';
import { useProductDatabase } from '@/database/useProductDatabase';
import { usePrinterDatabase } from '@/database/usePrinterDatabase';
import { useFocusEffect, useRouter } from 'expo-router';
import { formatarVendaParaImpressao } from '@/hooks/formatarVendaImpressao';
import { Produto } from '@/hooks/formatarVendaImpressao';
import { sendMessageToDevice } from '@/useBLE';
import { Calendar } from 'react-native-calendars';
import Colors from '@/constants/Colors';
import { EmptyState } from '@/components/ui/EmptyState';
import { RecordCardSkeleton } from '@/components/ui/RecordCardSkeleton';
import { VendaItem } from '@/components/VendaItem';
import { spacing, type } from '@/constants/theme';
import { ListFrame } from '@/components/ui/ListFrame';
import { ListDivider } from '@/components/ui/ListDivider';

// Evita re-render de toda a lista (perde React.memo dos cards) quando o
// refetch em foco de aba traz o mesmo conteudo de antes - so muda o estado
// se algo de fato mudou.
function isVendasPorDataEqual(
  a: Record<string, VendaDatabase[]>,
  b: Record<string, VendaDatabase[]>
): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    const aList = a[key];
    const bList = b[key];
    if (!bList || aList.length !== bList.length) return false;
    for (let i = 0; i < aList.length; i++) {
      if (aList[i].id !== bList[i].id || aList[i].updated_at !== bList[i].updated_at) return false;
    }
  }
  return true;
}

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
      padding: spacing.xl,
    },
    title: {
      fontSize: type.heading,
      fontWeight: 'bold',
      marginBottom: spacing.xl,
    },
    dateContainer: {
      width: '100%',
      marginBottom: spacing.xl,
    },
    label: {
      fontSize: type.body,
      marginBottom: spacing.sm,
      fontWeight: '500',
    },
    dateButton: {
      padding: spacing.md,
      borderRadius: 8,
      width: '100%',
      borderWidth: 1,
      borderColor: colors.border,
    },
    dateText: {
      fontSize: type.body,
    },
    separator: {
      marginVertical: spacing.sm,
      height: 1,
    },
    dateHeader: {
      fontSize: type.subtitle,
      fontWeight: 'bold',
      marginVertical: spacing.sm,
    },
    searchButton: {
      backgroundColor: colors.primary,
      padding: spacing.md,
      borderRadius: 8,
      width: '100%',
      alignItems: 'center',
    },
    searchButtonText: {
      color: colors.background,
      fontSize: type.body,
      fontWeight: 'bold',
    },
    modalContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    calendarContainer: {
      width: '90%',
      padding: spacing.xl,
      borderRadius: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
      elevation: 5,
    },
    modalTitle: {
      fontSize: type.subtitle,
      fontWeight: 'bold',
      marginBottom: spacing.lg,
      textAlign: 'center',
    },
    closeButton: {
      backgroundColor: colors.primary,
      padding: spacing.md,
      borderRadius: 8,
      alignItems: 'center',
      marginTop: spacing.lg,
    },
    closeButtonText: {
      color: colors.background,
      fontSize: type.body,
      fontWeight: 'bold',
    },
  });

  const fetchVendas = useCallback(async () => {
    try {
      setTitle('Histórico de Vendas (Últimos 3 dias)');
      const vendasData = await listVendasRecentes();
      setVendas((prev) => (isVendasPorDataEqual(prev, vendasData) ? prev : vendasData));
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

  const shouldReloadVendas = useShouldReload(['vendas', 'produtos']);
  useEffect(() => {
    if (!shouldReloadVendas()) return;
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
      setVendas({ [searchDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })]: vendasData });
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
          nome: prodInfos?.nome ?? 'Produto desconhecido',
          quantidade: produto.quantidade,
          preco: prodInfos?.preco ?? 0,
        };
      })
    );

    let printContent = await formatarVendaParaImpressao(venda, produtos);

    try {
      await sendMessageToDevice(printContent, await getPrinter());
      Alert.alert('Sucesso', 'Conta enviada para impressão.');
    } catch (error) {
      Alert.alert('Erro', `${error}`);
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
    <VendaItem
      data={item}
      index={index}
      onView={() => router.push(`/modais/contaHistoricoModal?vendaId=${item.id}`)}
      onPrint={() => handlePrint(item.id)}
      onDelete={() => handleExcluir(item.id)}
      printing={loadingPrint === item.id}
    />
  );

  const renderVendasPorData = (data: string, vendasDoDia: (VendaDatabase & { produtos: string[] })[]) => {
    const totalVendas = vendasDoDia
      .filter((venda) => venda.excluida != true)
      .reduce((acc, venda) => acc + venda.total, 0)
      .toFixed(2);

    const hoje = new Date();
    const ontem = new Date(hoje);
    ontem.setDate(hoje.getDate() - 1);

    const [dia, mes, ano] = data.split('/');
    const dataFormatada = `${ano}-${mes}-${dia}`;

    const dataRenderizada =
      dataFormatada === hoje.toISOString().split('T')[0]
        ? 'Hoje'
        : dataFormatada === ontem.toISOString().split('T')[0]
          ? 'Ontem'
          : data;

    return (
      <View key={data}>
        <Text style={styles.dateHeader}>
          {dataRenderizada} - Total: R$ {totalVendas}
        </Text>
        <ListFrame>
          <FlatList
            data={vendasDoDia}
            renderItem={renderVendaItem}
            keyExtractor={(item) => String(item.id)}
            ItemSeparatorComponent={ListDivider}
          />
        </ListFrame>
      </View>
    );
  };

  // Skeleton cheio so no primeiro load (sem dado nenhum ainda) - mostrar ele
  // toda vez que ja tem dado na tela fazia a lista "piscar" (dado -> skeleton
  // -> dado de novo), parecendo recarregar 2x. Com dado ja carregado, o
  // refetch usa o spinner do RefreshControl (nao esconde a lista).
  const hasData = Object.keys(vendas).length > 0;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>

      <View style={styles.dateContainer}>
        <Text style={styles.label}>Selecione uma data:</Text>
        <TouchableOpacity style={styles.dateButton} onPress={() => setShowCalendar(true)}>
          <Text style={styles.dateText}>
            {searchDate.toLocaleDateString('pt-BR', {
              weekday: 'short',
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            })}
          </Text>
        </TouchableOpacity>

        <Modal visible={showCalendar} transparent animationType="slide">
          <View style={styles.modalContainer}>
            <View style={styles.calendarContainer}>
              <Text style={styles.modalTitle}>Selecione a Data</Text>

              <Calendar
                current={formatCalendarDate(searchDate)}
                onDayPress={(day: { timestamp: number; dateString: string; day: number; month: number; year: number }) => {
                  const selectedDate = new Date(day.year, day.month - 1, day.day, 12, 0, 0);
                  setSearchDate(selectedDate);
                  setShowCalendar(false);
                }}
                markedDates={{
                  [formatCalendarDate(searchDate)]: { selected: true, selectedColor: colors.primary },
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

              <TouchableOpacity style={styles.closeButton} onPress={() => setShowCalendar(false)}>
                <Text style={styles.closeButtonText}>Fechar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>

      <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
        <Text style={styles.searchButtonText}>Buscar</Text>
      </TouchableOpacity>

      <View style={styles.separator} />

      {loading && !hasData ? (
        <ListFrame>
          <RecordCardSkeleton />
          <ListDivider />
          <RecordCardSkeleton />
          <ListDivider />
          <RecordCardSkeleton />
          <ListDivider />
          <RecordCardSkeleton />
        </ListFrame>
      ) : (
        <FlatList
          data={Object.entries(vendas)}
          renderItem={({ item }) => {
            const [data, vendasDoDia] = item as [string, (VendaDatabase & { produtos: string[] })[]];
            return renderVendasPorData(data, vendasDoDia);
          }}
          keyExtractor={(item) => item[0]}
          showsVerticalScrollIndicator
          style={{ flex: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing || loading} onRefresh={onRefresh} />}
          ListEmptyComponent={<EmptyState icon="clock-o" title="Nenhuma venda no período" message="Busque outra data ou aguarde novas vendas." />}
        />
      )}
    </View>
  );
}
