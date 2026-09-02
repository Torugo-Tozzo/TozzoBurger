import AsyncStorage from '@react-native-async-storage/async-storage';
import { cachePlan, getCachedPlan, clearCachedPlan } from '../planCache';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

const mockGetItem = AsyncStorage.getItem as jest.Mock;
const mockSetItem = AsyncStorage.setItem as jest.Mock;
const mockRemoveItem = AsyncStorage.removeItem as jest.Mock;

describe('planCache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('persiste o plano na chave versionada e escopada por estabelecimento', async () => {
    mockSetItem.mockResolvedValue(undefined);

    await cachePlan('PAGO', 'estab-1');

    expect(mockSetItem).toHaveBeenCalledWith('tozzo_plan_cache_v1:estab-1', 'PAGO');
  });

  it('retorna o plano que foi armazenado pro estabelecimento certo', async () => {
    mockGetItem.mockResolvedValue('FREE');

    await expect(getCachedPlan('estab-1')).resolves.toBe('FREE');
    expect(mockGetItem).toHaveBeenCalledWith('tozzo_plan_cache_v1:estab-1');
  });

  it('não vaza cache entre estabelecimentos diferentes no mesmo dispositivo', async () => {
    mockGetItem.mockImplementation((key: string) => {
      if (key === 'tozzo_plan_cache_v1:estab-A') return Promise.resolve('PAGO');
      if (key === 'tozzo_plan_cache_v1:estab-B') return Promise.resolve(null);
      return Promise.resolve(null);
    });

    await expect(getCachedPlan('estab-A')).resolves.toBe('PAGO');
    await expect(getCachedPlan('estab-B')).resolves.toBeNull();
  });

  it('retorna null quando a leitura do cache falha', async () => {
    mockGetItem.mockRejectedValue(new Error('storage unavailable'));

    await expect(getCachedPlan('estab-1')).resolves.toBeNull();
  });

  it('limpa a entrada do estabelecimento no logout', async () => {
    mockRemoveItem.mockResolvedValue(undefined);

    await clearCachedPlan('estab-1');

    expect(mockRemoveItem).toHaveBeenCalledWith('tozzo_plan_cache_v1:estab-1');
  });
});
