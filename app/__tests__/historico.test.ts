import { canLoadNextPage, PAGE_SIZE, withPage } from '@/app/(tabs)/historico';

jest.mock('@expo/vector-icons', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('expo-router', () => ({
  useFocusEffect: jest.fn(),
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('react-native-ble-plx', () => ({
  BleManager: jest.fn(() => ({})),
}));
jest.mock('@/components/Themed', () => ({ Text: () => null, View: () => null }));
jest.mock('@/components/ui/EmptyState', () => ({ EmptyState: () => null }));
jest.mock('@/components/ui/ListDivider', () => ({ ListDivider: () => null }));
jest.mock('@/components/ui/ListFrame', () => ({ ListFrame: () => null }));
jest.mock('@/components/ui/RecordCardSkeleton', () => ({ RecordCardSkeleton: () => null }));
jest.mock('@/components/VendaItem', () => ({ VendaItem: () => null }));
jest.mock('@/components/VendasFilterModal', () => () => null);
jest.mock('@/database/useVendaDatabse', () => ({ useVendasDatabase: jest.fn() }));
jest.mock('@/database/useProductDatabase', () => ({ useProductDatabase: jest.fn() }));
jest.mock('@/database/usePrinterDatabase', () => ({ usePrinterDatabase: jest.fn() }));
jest.mock('@/context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('@/context/AutoSyncContext', () => ({ useAutoSync: jest.fn() }));
jest.mock('@/hooks/useSyncRefresh', () => ({ useSyncRefresh: jest.fn() }));
jest.mock('@/hooks/formatarVendaImpressao', () => ({ formatarVendaParaImpressao: jest.fn() }));
jest.mock('@/useBLE', () => ({ sendMessageToDevice: jest.fn() }));

describe('paginação do histórico', () => {
  it('usa páginas de 50 vendas', () => {
    expect(PAGE_SIZE).toBe(50);
  });

  it('remove paginação recebida nos filtros antes de aplicar a página atual', () => {
    expect(withPage({ cliente: 'Ana', page: 99, limit: 1 }, 2)).toEqual({
      cliente: 'Ana',
      page: 2,
      limit: 50,
    });
  });

  it('não inicia próxima página quando o estado ainda está no reset da consulta', () => {
    expect(canLoadNextPage({
      page: 0,
      hasNextPage: true,
      loadingInitial: false,
      loadingMore: false,
      error: null,
    }, null, 1)).toBe(false);
  });
});
