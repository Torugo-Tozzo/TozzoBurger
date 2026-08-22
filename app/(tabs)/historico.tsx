import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, RefreshControl, StyleSheet, TouchableOpacity, useColorScheme } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFocusEffect, useRouter } from 'expo-router';
import { Text, View } from '@/components/Themed';
import { EmptyState } from '@/components/ui/EmptyState';
import { ListDivider } from '@/components/ui/ListDivider';
import { ListFrame } from '@/components/ui/ListFrame';
import { RecordCardSkeleton } from '@/components/ui/RecordCardSkeleton';
import { VendaItem } from '@/components/VendaItem';
import VendasFilterModal from '@/components/VendasFilterModal';
import { useVendasDatabase } from '@/database/useVendaDatabse';
import { useProductDatabase } from '@/database/useProductDatabase';
import { usePrinterDatabase } from '@/database/usePrinterDatabase';
import { useAuth } from '@/context/AuthContext';
import { useAutoSync } from '@/context/AutoSyncContext';
import { useSyncRefresh } from '@/hooks/useSyncRefresh';
import { formatarVendaParaImpressao, Produto } from '@/hooks/formatarVendaImpressao';
import { sendMessageToDevice } from '@/useBLE';
import * as api from '@/services/api';
import { EMPTY_VENDAS_FILTERS, filterVendasLocais, mapVendaApiToRender, type VendaRenderizavel, type VendasFilters } from '@/services/vendas';
import { setVendaDetalhes } from '@/services/vendasDetalhes';
import Colors from '@/constants/Colors';
import { spacing, type } from '@/constants/theme';

type SalesSection = 'device' | 'establishment';
type GroupedSales = Record<string, VendaRenderizavel[]>;

function groupByDate(vendas: VendaRenderizavel[]): GroupedSales {
  return vendas.reduce<GroupedSales>((groups, venda) => {
    const date = new Date(venda.horario).toLocaleDateString('pt-BR');
    groups[date] = groups[date] ? [...groups[date], venda] : [venda];
    return groups;
  }, {});
}

function totalVendas(vendas: VendaRenderizavel[]) {
  return vendas.filter((venda) => venda.excluida !== true).reduce((total, venda) => total + Number(venda.total || 0), 0);
}

function emptyFilters(): VendasFilters {
  return { ...EMPTY_VENDAS_FILTERS };
}

export default function HistoricoScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const router = useRouter();
  const { token } = useAuth();
  const { lastSync } = useAutoSync();
  const { refreshing, onRefresh } = useSyncRefresh();
  const { listVendasRecentes, removeVenda, getVendaById } = useVendasDatabase();
  const { showAdd } = useProductDatabase();
  const { getPrinter } = usePrinterDatabase();

  const [section, setSection] = useState<SalesSection>('device');
  const [localSales, setLocalSales] = useState<VendaRenderizavel[]>([]);
  const [remoteSales, setRemoteSales] = useState<VendaRenderizavel[]>([]);
  const [remoteTotal, setRemoteTotal] = useState(0);
  const [localLoaded, setLocalLoaded] = useState(false);
  const [remoteLoaded, setRemoteLoaded] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [draftFilters, setDraftFilters] = useState<VendasFilters>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<VendasFilters>(emptyFilters);
  const [loadingPrint, setLoadingPrint] = useState<string | null>(null);

  const loadLocalSales = useCallback(async () => {
    try {
      const grouped = await listVendasRecentes();
      setLocalSales(Object.values(grouped).flat().map((sale) => ({ ...sale, itens: [] })) as VendaRenderizavel[]);
    } catch (error) {
      console.error('Erro ao carregar vendas deste aparelho:', error);
      Alert.alert('Erro', 'Não foi possível carregar as vendas deste aparelho.');
    } finally {
      setLocalLoaded(true);
    }
  }, []);

  const loadRemoteSales = useCallback(async (filters: VendasFilters) => {
    if (!token) return;
    try {
      const response = await api.listVendas(token, { ...filters, page: 1, limit: 100 });
      const sales = (response.vendas ?? []).map(mapVendaApiToRender);
      setRemoteSales(sales);
      setRemoteTotal(Number(response.fechamento ?? totalVendas(sales)));
      setRemoteLoaded(true);
    } catch (error) {
      console.error('Erro ao carregar vendas do estabelecimento:', error);
      Alert.alert('Erro', 'Não foi possível carregar as vendas do estabelecimento.');
      setRemoteLoaded(true);
    }
  }, [token]);

  useFocusEffect(useCallback(() => {
    if (section === 'device') void loadLocalSales();
  }, [loadLocalSales, section]));

  useEffect(() => {
    if (section === 'device' && lastSync !== null) void loadLocalSales();
  }, [lastSync, section, loadLocalSales]);

  useEffect(() => {
    if (section === 'establishment' && !remoteLoaded) void loadRemoteSales(appliedFilters);
  }, [section, remoteLoaded, appliedFilters, loadRemoteSales]);

  const localFilteredSales = useMemo(() => filterVendasLocais(localSales, appliedFilters), [localSales, appliedFilters]);
  const activeSales = section === 'device' ? localFilteredSales : remoteSales;
  const groupedSales = useMemo(() => groupByDate(activeSales), [activeSales]);
  const activeTotal = section === 'device' ? totalVendas(localFilteredSales) : remoteTotal;
  const activeLoaded = section === 'device' ? localLoaded : remoteLoaded;

  const handleSectionChange = (nextSection: SalesSection) => {
    setSection(nextSection);
  };

  const handleApplyFilters = () => {
    setAppliedFilters({ ...draftFilters });
    setRemoteLoaded(false);
    setShowFilters(false);
  };

  const handleClearFilters = () => {
    const nextFilters = emptyFilters();
    setDraftFilters(nextFilters);
  };

  const handleRefresh = async () => {
    await onRefresh();
    if (section === 'device') await loadLocalSales();
    else await loadRemoteSales(appliedFilters);
  };

  const handlePrint = async (vendaId: string) => {
    setLoadingPrint(vendaId);
    try {
      const venda = await getVendaById(vendaId);
      if (!venda) return;
      const produtos: Produto[] = await Promise.all(venda.produtos.map(async (produto) => {
        const product = await showAdd(produto.produtoId);
        return { nome: product?.nome ?? 'Produto desconhecido', quantidade: produto.quantidade, preco: product?.preco ?? 0 };
      }));
      await sendMessageToDevice(formatarVendaParaImpressao(venda, produtos), await getPrinter());
      Alert.alert('Sucesso', 'Conta enviada para impressão.');
    } catch (error) {
      console.error('Erro ao imprimir venda:', error);
      Alert.alert('Erro', 'Não foi possível imprimir a venda.');
    } finally {
      setLoadingPrint(null);
    }
  };

  const handleDelete = (vendaId: string) => {
    Alert.alert('Confirmar exclusão', 'Tem certeza de que deseja excluir esta venda?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: async () => {
        try {
          await removeVenda(vendaId);
          setLocalSales((sales) => sales.map((sale) => sale.id === vendaId ? { ...sale, excluida: true } : sale));
        } catch (error) {
          console.error('Erro ao excluir venda:', error);
          Alert.alert('Erro', 'Não foi possível excluir a venda.');
        }
      } },
    ]);
  };

  const handleOpenSale = (sale: VendaRenderizavel) => {
    if (section === 'establishment') setVendaDetalhes(sale);
    router.push(`/modais/contaHistoricoModal?vendaId=${encodeURIComponent(sale.id)}&origem=${section}`);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Vendas</Text>
      <View style={styles.sectionTabs}>
        {([
          ['device', 'Neste aparelho'],
          ['establishment', 'Estabelecimento'],
        ] as const).map(([value, label]) => (
          <TouchableOpacity
            key={value}
            style={[styles.sectionTab, { borderColor: colors.border }, section === value && { backgroundColor: colors.text }]}
            onPress={() => handleSectionChange(value)}
          >
            <Text style={[styles.sectionTabText, section === value && { color: colors.background }]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.toolbar}>
        <Text style={styles.sectionTitle}>{section === 'device' ? 'Vendas feitas neste aparelho' : 'Vendas do estabelecimento'}</Text>
        <TouchableOpacity style={[styles.filterButton, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={() => setShowFilters(true)} accessibilityLabel="Abrir filtros de vendas">
          <FontAwesome name="filter" size={16} color={colors.text} />
          <Text style={styles.filterText}>Filtros</Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.total, { color: colors.textMuted }]}>Total do período: R$ {activeTotal.toFixed(2)}</Text>

      {!activeLoaded ? (
        <ListFrame style={styles.skeletonFrame}>
          <RecordCardSkeleton /><ListDivider /><RecordCardSkeleton /><ListDivider /><RecordCardSkeleton /><ListDivider /><RecordCardSkeleton />
        </ListFrame>
      ) : (
        <FlatList
          data={Object.entries(groupedSales)}
          keyExtractor={([date]) => date}
          renderItem={({ item: [date, sales] }) => (
            <View style={styles.group}>
              <Text style={styles.dateHeader}>{date}</Text>
              <ListFrame>
                {sales.map((sale, index) => (
                  <React.Fragment key={sale.id}>
                    {index > 0 ? <ListDivider /> : null}
                    <VendaItem
                      data={sale}
                      index={index}
                      onPress={() => handleOpenSale(sale)}
                      readOnly={section === 'establishment'}
                      onView={section === 'device' ? () => handleOpenSale(sale) : undefined}
                      onPrint={section === 'device' ? () => handlePrint(sale.id) : undefined}
                      onDelete={section === 'device' ? () => handleDelete(sale.id) : undefined}
                      printing={loadingPrint === sale.id}
                    />
                  </React.Fragment>
                ))}
              </ListFrame>
            </View>
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          ListEmptyComponent={<EmptyState icon="clock-o" title="Nenhuma venda encontrada" message="Ajuste os filtros ou aguarde novas vendas." />}
          showsVerticalScrollIndicator={false}
        />
      )}

      <VendasFilterModal visible={showFilters} filters={draftFilters} onChange={setDraftFilters} onApply={handleApplyFilters} onClear={handleClearFilters} onClose={() => setShowFilters(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: spacing.xl, borderColor: 'black', borderWidth: 1 },
  title: { fontSize: type.heading, fontWeight: '700', marginBottom: spacing.lg, paddingHorizontal: spacing.xl },
  sectionTabs: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.xl, marginBottom: spacing.lg },
  sectionTab: { flex: 1, borderWidth: 1, paddingVertical: spacing.md, alignItems: 'center' },
  sectionTabText: { fontSize: type.bodySm, fontWeight: '700' },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, marginBottom: spacing.sm, gap: spacing.md },
  sectionTitle: { flex: 1, fontSize: type.subtitle, fontWeight: '700' },
  filterButton: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  filterText: { fontSize: type.bodySm, fontWeight: '700' },
  total: { paddingHorizontal: spacing.xl, fontSize: type.bodySm, marginBottom: spacing.md },
  skeletonFrame: { marginHorizontal: spacing.xl },
  listContent: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  group: { marginBottom: spacing.lg },
  dateHeader: { fontSize: type.bodySm, fontWeight: '700', marginBottom: spacing.sm },
});
