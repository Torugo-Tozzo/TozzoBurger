import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, TouchableOpacity, useColorScheme } from 'react-native';
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
import {
  EMPTY_VENDAS_FILTERS,
  mapVendaApiToRender,
  mergeVendasPage,
  resetVendasPageState,
  type VendaRenderizavel,
  type VendasFilters,
  type VendasPageState,
} from '@/services/vendas';
import { setVendaDetalhes } from '@/services/vendasDetalhes';
import Colors from '@/constants/Colors';
import { spacing, type } from '@/constants/theme';

export const PAGE_SIZE = 50;

type SalesSection = 'device' | 'establishment';
type GroupedSales = Record<string, VendaRenderizavel[]>;
type LocalVendaPageItem = {
  id: string;
  total: number;
  horario: string;
  cliente?: string | null;
  excluida: boolean;
  criado_por?: string | null;
  criado_por_nome?: string | null;
  produtos: string[];
};
type SalesState = VendasPageState & {
  items: VendaRenderizavel[];
  total: number;
  fechamento: number;
};
type InFlightRequest = { generation: number; page: number };
type ManualRefresh = {
  generation: number;
  filters: VendasFilters;
  started: boolean;
};

function groupByDate(vendas: VendaRenderizavel[]): GroupedSales {
  return vendas.reduce<GroupedSales>((groups, venda) => {
    const date = new Date(venda.horario).toLocaleDateString('pt-BR');
    groups[date] = groups[date] ? [...groups[date], venda] : [venda];
    return groups;
  }, {});
}

function emptyFilters(): VendasFilters {
  return { ...EMPTY_VENDAS_FILTERS };
}

function createSalesState(loadingInitial = false): SalesState {
  return {
    items: [],
    total: 0,
    fechamento: 0,
    ...resetVendasPageState(),
    loadingInitial,
  };
}

export function withPage(filters: VendasFilters, page: number): VendasFilters {
  const queryFilters = { ...filters };
  delete queryFilters.page;
  delete queryFilters.limit;
  return { ...queryFilters, page, limit: PAGE_SIZE };
}

function mapLocalVendaToRender(venda: LocalVendaPageItem): VendaRenderizavel {
  return {
    id: String(venda.id),
    total: Number(venda.total ?? 0),
    horario: String(venda.horario),
    cliente: venda.cliente == null ? null : String(venda.cliente),
    excluida: venda.excluida === true,
    criado_por: venda.criado_por == null ? null : String(venda.criado_por),
    criado_por_nome: venda.criado_por_nome == null ? null : String(venda.criado_por_nome),
    produtos: Array.isArray(venda.produtos) ? venda.produtos : [],
    itens: [],
  };
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return fallback;
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
  const [localState, setLocalState] = useState<SalesState>(() => createSalesState(true));
  const [remoteState, setRemoteState] = useState<SalesState>(() => createSalesState());
  const [showFilters, setShowFilters] = useState(false);
  const [draftFilters, setDraftFilters] = useState<VendasFilters>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<VendasFilters>(emptyFilters);
  const [loadingPrint, setLoadingPrint] = useState<string | null>(null);

  const generationRef = useRef(0);
  const inFlightRef = useRef<Record<SalesSection, InFlightRequest | null>>({
    device: null,
    establishment: null,
  });
  const lastSyncSeenRef = useRef(lastSync);
  const manualRefreshRef = useRef<ManualRefresh | null>(null);

  const resetSectionState = useCallback((targetSection: SalesSection) => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    const nextState = createSalesState();
    if (targetSection === 'device') setLocalState(nextState);
    else setRemoteState(nextState);
    return generation;
  }, []);

  const beginRequest = (targetSection: SalesSection, page: number, generation: number): boolean => {
    const current = inFlightRef.current[targetSection];
    if (current?.generation === generation) return false;
    inFlightRef.current[targetSection] = { generation, page };
    return true;
  };

  const finishRequest = (targetSection: SalesSection, page: number, generation: number): void => {
    const current = inFlightRef.current[targetSection];
    if (current?.generation === generation && current.page === page) {
      inFlightRef.current[targetSection] = null;
    }
  };

  const loadLocalPage = useCallback(async (filters: VendasFilters, page: number, generation: number) => {
    if (!beginRequest('device', page, generation)) return;
    if (generationRef.current !== generation) {
      finishRequest('device', page, generation);
      return;
    }

    setLocalState((state) => ({
      ...state,
      loadingInitial: page === 1,
      loadingMore: page !== 1,
      error: null,
    }));

    try {
      const response = await listVendasRecentes(withPage(filters, page));
      if (generationRef.current !== generation) return;

      const incoming = response.vendas.map((venda) => mapLocalVendaToRender(venda as LocalVendaPageItem));
      setLocalState((state) => ({
        ...state,
        items: mergeVendasPage(state.items, incoming, response.pagination.page),
        total: response.pagination.total,
        fechamento: Number(response.fechamento ?? 0),
        page: response.pagination.page,
        hasNextPage: response.pagination.hasNextPage,
        loadingInitial: false,
        loadingMore: false,
        error: null,
      }));
    } catch (error) {
      if (generationRef.current !== generation) return;
      console.error('Erro ao carregar vendas deste aparelho:', error);
      setLocalState((state) => ({
        ...state,
        items: page === 1 ? [] : state.items,
        total: page === 1 ? 0 : state.total,
        fechamento: page === 1 ? 0 : state.fechamento,
        page: page === 1 ? 0 : state.page,
        hasNextPage: false,
        loadingInitial: false,
        loadingMore: false,
        error: errorMessage(error, 'Não foi possível carregar as vendas deste aparelho.'),
      }));
    } finally {
      finishRequest('device', page, generation);
    }
  }, []);

  const loadRemotePage = useCallback(async (filters: VendasFilters, page: number, generation: number) => {
    if (!token || !beginRequest('establishment', page, generation)) return;
    if (generationRef.current !== generation) {
      finishRequest('establishment', page, generation);
      return;
    }

    setRemoteState((state) => ({
      ...state,
      loadingInitial: page === 1,
      loadingMore: page !== 1,
      error: null,
    }));

    try {
      const response = await api.listVendas(token, withPage(filters, page));
      if (generationRef.current !== generation) return;

      const incoming = (response.vendas ?? []).map(mapVendaApiToRender);
      setRemoteState((state) => ({
        ...state,
        items: mergeVendasPage(state.items, incoming, response.pagination.page),
        total: response.pagination.total,
        fechamento: Number(response.fechamento ?? 0),
        page: response.pagination.page,
        hasNextPage: response.pagination.hasNextPage,
        loadingInitial: false,
        loadingMore: false,
        error: null,
      }));
    } catch (error) {
      if (generationRef.current !== generation) return;
      console.error('Erro ao carregar vendas do estabelecimento:', error);
      setRemoteState((state) => ({
        ...state,
        items: page === 1 ? [] : state.items,
        total: page === 1 ? 0 : state.total,
        fechamento: page === 1 ? 0 : state.fechamento,
        page: page === 1 ? 0 : state.page,
        hasNextPage: false,
        loadingInitial: false,
        loadingMore: false,
        error: errorMessage(error, 'Não foi possível carregar as vendas do estabelecimento.'),
      }));
    } finally {
      finishRequest('establishment', page, generation);
    }
  }, [token]);

  const beginSectionQuery = useCallback((targetSection: SalesSection, filters: VendasFilters) => {
    const generation = resetSectionState(targetSection);
    if (targetSection === 'device') void loadLocalPage(filters, 1, generation);
    else void loadRemotePage(filters, 1, generation);
  }, [loadLocalPage, loadRemotePage, resetSectionState]);

  useFocusEffect(useCallback(() => {
    if (section === 'device') beginSectionQuery('device', appliedFilters);
  }, [appliedFilters, beginSectionQuery, section]));

  useEffect(() => {
    if (section === 'establishment' && token) beginSectionQuery('establishment', appliedFilters);
  }, [appliedFilters, beginSectionQuery, section, token]);

  useEffect(() => {
    if (lastSync === lastSyncSeenRef.current) return;
    lastSyncSeenRef.current = lastSync;
    if (section !== 'device') return;

    const manualRefresh = manualRefreshRef.current;
    if (manualRefresh?.generation === generationRef.current) {
      if (!manualRefresh.started) {
        manualRefresh.started = true;
        void loadLocalPage(manualRefresh.filters, 1, manualRefresh.generation);
      }
      manualRefreshRef.current = null;
      return;
    }

    beginSectionQuery('device', appliedFilters);
  }, [appliedFilters, beginSectionQuery, lastSync, loadLocalPage, section]);

  useEffect(() => () => {
    generationRef.current += 1;
  }, []);

  const handleSectionChange = (nextSection: SalesSection) => {
    if (nextSection === section) return;
    resetSectionState(nextSection);
    setSection(nextSection);
  };

  const handleApplyFilters = () => {
    resetSectionState(section);
    setAppliedFilters({ ...draftFilters });
    setShowFilters(false);
  };

  const handleClearFilters = () => {
    const nextFilters = emptyFilters();
    resetSectionState(section);
    setDraftFilters(nextFilters);
    setAppliedFilters(nextFilters);
    setShowFilters(false);
  };

  const handleRefresh = async () => {
    const targetSection = section;
    const filters = appliedFilters;
    const generation = resetSectionState(targetSection);
    const manualRefresh: ManualRefresh = { generation, filters, started: false };
    manualRefreshRef.current = manualRefresh;

    try {
      await onRefresh();
    } catch (error) {
      console.error('Erro ao atualizar vendas:', error);
    } finally {
      if (generationRef.current === generation && !manualRefresh.started) {
        manualRefresh.started = true;
        if (targetSection === 'device') void loadLocalPage(filters, 1, generation);
        else void loadRemotePage(filters, 1, generation);
      }
      if (manualRefreshRef.current === manualRefresh) manualRefreshRef.current = null;
    }
  };

  const activeState = section === 'device' ? localState : remoteState;
  const groupedSales = useMemo(() => groupByDate(activeState.items), [activeState.items]);

  const handleEndReached = useCallback(() => {
    if (activeState.loadingInitial || activeState.loadingMore || !activeState.hasNextPage) return;
    const nextPage = activeState.page + 1;
    const generation = generationRef.current;
    if (inFlightRef.current[section]?.generation === generation) return;
    if (section === 'device') void loadLocalPage(appliedFilters, nextPage, generation);
    else void loadRemotePage(appliedFilters, nextPage, generation);
  }, [activeState, appliedFilters, loadLocalPage, loadRemotePage, section]);

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
          setLocalState((state) => {
            const sale = state.items.find((item) => item.id === vendaId);
            if (!sale || sale.excluida) return state;
            return {
              ...state,
              items: state.items.map((item) => item.id === vendaId ? { ...item, excluida: true } : item),
              total: Math.max(0, state.total - 1),
              fechamento: Math.max(0, state.fechamento - Number(sale.total || 0)),
            };
          });
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
      <Text style={[styles.total, { color: colors.textMuted }]}>Total do período: R$ {activeState.fechamento.toFixed(2)}</Text>

      {activeState.loadingInitial ? (
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
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.5}
          ListHeaderComponent={activeState.error && activeState.items.length > 0 ? <Text style={[styles.error, { color: colors.textMuted }]}>{activeState.error}</Text> : null}
          ListFooterComponent={activeState.loadingMore ? <ActivityIndicator style={styles.footerLoader} color={colors.text} /> : null}
          ListEmptyComponent={<EmptyState icon="clock-o" title="Nenhuma venda encontrada" message={activeState.error ?? 'Ajuste os filtros ou aguarde novas vendas.'} />}
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
  error: { paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
  footerLoader: { paddingVertical: spacing.lg },
});
