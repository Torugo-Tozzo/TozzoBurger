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
import { useSaleDatabase } from '@/database/useSaleDatabase';
import { useProductDatabase } from '@/database/useProductDatabase';
import { usePrinterDatabase } from '@/database/usePrinterDatabase';
import { useAuth } from '@/context/AuthContext';
import { useAutoSync } from '@/context/AutoSyncContext';
import { useSyncRefresh } from '@/hooks/useSyncRefresh';
import { formatarVendaParaImpressao, Produto } from '@/hooks/formatarVendaImpressao';
import { sendMessageToDevice } from '@/useBLE';
import * as api from '@/services/api';
import {
  EMPTY_SALES_FILTERS,
  mapSaleApiToRender,
  mergeSalesPage,
  resetSalesPageState,
  type SaleRenderable,
  type SalesFilters,
  type SalesPageState,
} from '@/services/sales';
import { setVendaDetalhes } from '@/services/salesDetails';
import Colors from '@/constants/Colors';
import { spacing, type } from '@/constants/theme';
import { useTranslation } from 'react-i18next';

export const PAGE_SIZE = 50;

type SalesSection = 'device' | 'establishment';
type GroupedSales = Record<string, SaleRenderable[]>;
type LocalVendaPageItem = {
  id: string;
  total: number;
  soldAt: string;
  customerName?: string | null;
  isCancelled: boolean;
  createdBy?: string | null;
  createdByName?: string | null;
  products: string[];
};
type SalesState = SalesPageState & {
  items: SaleRenderable[];
  total: number;
  fechamento: number;
};
type InFlightRequest = { generation: number; page: number };
type ManualRefresh = {
  generation: number;
  filters: SalesFilters;
  started: boolean;
};

export function canLoadNextPage(
  state: SalesPageState,
  inFlight: Pick<InFlightRequest, 'generation'> | null,
  generation: number,
): boolean {
  return state.page > 0
    && !state.loadingInitial
    && !state.loadingMore
    && state.hasNextPage
    && inFlight?.generation !== generation;
}

function groupByDate(vendas: SaleRenderable[], locale: string): GroupedSales {
  return vendas.reduce<GroupedSales>((groups, venda) => {
    const date = new Date(venda.soldAt).toLocaleDateString(locale);
    groups[date] = groups[date] ? [...groups[date], venda] : [venda];
    return groups;
  }, {});
}

function emptyFilters(): SalesFilters {
  return { ...EMPTY_SALES_FILTERS };
}

function createSalesState(loadingInitial = false): SalesState {
  return {
    items: [],
    total: 0,
    fechamento: 0,
    ...resetSalesPageState(),
    loadingInitial,
  };
}

export function withPage(filters: SalesFilters, page: number): SalesFilters {
  const queryFilters = { ...filters };
  delete queryFilters.page;
  delete queryFilters.limit;
  return { ...queryFilters, page, limit: PAGE_SIZE };
}

function mapLocalVendaToRender(venda: LocalVendaPageItem): SaleRenderable {
  return {
    id: String(venda.id),
    total: Number(venda.total ?? 0),
    soldAt: String(venda.soldAt),
    customerName: venda.customerName == null ? null : String(venda.customerName),
    isCancelled: venda.isCancelled === true,
    createdBy: venda.createdBy == null ? null : String(venda.createdBy),
    createdByName: venda.createdByName == null ? null : String(venda.createdByName),
    products: Array.isArray(venda.products) ? venda.products : [],
    items: [],
  };
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message;
  return fallback;
}

export default function HistoricoScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { token } = useAuth();
  const { lastSync } = useAutoSync();
  const { refreshing, onRefresh } = useSyncRefresh();
  const { listRecentSales, removeSale, getSaleById } = useSaleDatabase();
  const { showAdd } = useProductDatabase();
  const { getPrinter } = usePrinterDatabase();

  const [section, setSection] = useState<SalesSection>('device');
  const [localState, setLocalState] = useState<SalesState>(() => createSalesState(true));
  const [remoteState, setRemoteState] = useState<SalesState>(() => createSalesState());
  const [showFilters, setShowFilters] = useState(false);
  const [draftFilters, setDraftFilters] = useState<SalesFilters>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<SalesFilters>(emptyFilters);
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

  const loadLocalPage = useCallback(async (filters: SalesFilters, page: number, generation: number) => {
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
      const response = await listRecentSales(withPage(filters, page));
      if (generationRef.current !== generation) return;

      const incoming = response.sales.map((venda) => mapLocalVendaToRender(venda as LocalVendaPageItem));
      setLocalState((state) => ({
        ...state,
        items: mergeSalesPage(state.items, incoming, response.pagination.page),
        total: response.pagination.total,
        fechamento: Number(response.closing ?? 0),
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
        error: errorMessage(error, t('sales.localLoadFailed')),
      }));
    } finally {
      finishRequest('device', page, generation);
    }
  }, [t]);

  const loadRemotePage = useCallback(async (filters: SalesFilters, page: number, generation: number) => {
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

      const incoming = (response.sales ?? []).map(mapSaleApiToRender);
      setRemoteState((state) => ({
        ...state,
        items: mergeSalesPage(state.items, incoming, response.pagination.page),
        total: response.pagination.total,
        fechamento: Number(response.closing ?? 0),
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
        error: errorMessage(error, t('sales.remoteLoadFailed')),
      }));
    } finally {
      finishRequest('establishment', page, generation);
    }
  }, [t, token]);

  const beginSectionQuery = useCallback((targetSection: SalesSection, filters: SalesFilters) => {
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
  const groupedSales = useMemo(() => groupByDate(activeState.items, i18n.language), [activeState.items, i18n.language]);

  const handleEndReached = useCallback(() => {
    const generation = generationRef.current;
    if (!canLoadNextPage(activeState, inFlightRef.current[section], generation)) return;
    const nextPage = activeState.page + 1;
    if (section === 'device') void loadLocalPage(appliedFilters, nextPage, generation);
    else void loadRemotePage(appliedFilters, nextPage, generation);
  }, [activeState, appliedFilters, loadLocalPage, loadRemotePage, section]);

  const handlePrint = async (saleId: string) => {
    setLoadingPrint(saleId);
    try {
      const sale = await getSaleById(saleId);
      if (!sale) return;
      const products: Produto[] = await Promise.all((sale.items ?? []).map(async (item) => {
        const product = await showAdd(item.productId);
        return { name: product?.name ?? t('sales.unknownProduct'), quantity: item.quantity, price: product?.price ?? 0 };
      }));
      await sendMessageToDevice(formatarVendaParaImpressao(sale, products), await getPrinter());
      Alert.alert(t('sales.printSuccessTitle'), t('sales.printSuccessMessage'));
    } catch (error) {
      console.error('Erro ao imprimir venda:', error);
      Alert.alert(t('sales.printErrorTitle'), t('sales.printErrorMessage'));
    } finally {
      setLoadingPrint(null);
    }
  };

  const handleDelete = (saleId: string) => {
    Alert.alert(t('sales.deleteConfirmTitle'), t('sales.deleteConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('sales.delete'), style: 'destructive', onPress: async () => {
        try {
          await removeSale(saleId);
          setLocalState((state) => {
            const sale = state.items.find((item) => item.id === saleId);
            if (!sale || sale.isCancelled) return state;
            return {
              ...state,
              items: state.items.map((item) => item.id === saleId ? { ...item, isCancelled: true } : item),
              total: Math.max(0, state.total - 1),
              fechamento: Math.max(0, state.fechamento - Number(sale.total || 0)),
            };
          });
        } catch (error) {
          console.error('Erro ao excluir venda:', error);
          Alert.alert(t('sales.printErrorTitle'), t('sales.deleteErrorMessage'));
        }
      } },
    ]);
  };

  const handleOpenSale = (sale: SaleRenderable) => {
    if (section === 'establishment') setVendaDetalhes(sale);
    router.push(`/modais/contaHistoricoModal?saleId=${encodeURIComponent(sale.id)}&origem=${section}`);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('sales.title')}</Text>
      <View style={styles.sectionTabs}>
        {([
          ['device', t('sales.onThisDevice')],
          ['establishment', t('sales.establishment')],
        ] as const).map(([value, label]) => (
          <TouchableOpacity
            key={value}
            style={[styles.sectionTab, { borderColor: colors.border }, section === value && { backgroundColor: colors.text }]}
            onPress={() => handleSectionChange(value)}
            accessibilityRole="button"
            accessibilityLabel={label}
          >
            <Text style={[styles.sectionTabText, section === value && { color: colors.background }]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.toolbar}>
        <Text style={styles.sectionTitle}>{section === 'device' ? t('sales.deviceTitle') : t('sales.establishmentTitle')}</Text>
        <TouchableOpacity style={[styles.filterButton, { borderColor: colors.border, backgroundColor: colors.surface }]} onPress={() => setShowFilters(true)} accessibilityRole="button" accessibilityLabel={t('sales.openFilters')}>
          <FontAwesome name="filter" size={16} color={colors.text} />
          <Text style={styles.filterText}>{t('sales.filters')}</Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.total, { color: colors.textMuted }]}>
        {t('sales.periodTotal', {
          amount: new Intl.NumberFormat(i18n.language, { style: 'currency', currency: 'BRL' }).format(activeState.fechamento),
        })}
      </Text>

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
          ListEmptyComponent={<EmptyState icon="clock-o" title={t('sales.empty')} message={activeState.error ?? t('sales.adjustFilters')} />}
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
