import AsyncStorage from '@react-native-async-storage/async-storage';
import { cachePlan, getCachedPlan } from '../planCache';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
  },
}));

const mockGetItem = AsyncStorage.getItem as jest.Mock;
const mockSetItem = AsyncStorage.setItem as jest.Mock;

describe('planCache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('persiste o plano na chave versionada', async () => {
    mockSetItem.mockResolvedValue(undefined);

    await cachePlan('PAGO');

    expect(mockSetItem).toHaveBeenCalledWith('tozzo_plan_cache_v1', 'PAGO');
  });

  it('retorna o plano que foi armazenado', async () => {
    mockGetItem.mockResolvedValue('FREE');

    await expect(getCachedPlan()).resolves.toBe('FREE');
    expect(mockGetItem).toHaveBeenCalledWith('tozzo_plan_cache_v1');
  });

  it('retorna null quando a leitura do cache falha', async () => {
    mockGetItem.mockRejectedValue(new Error('storage unavailable'));

    await expect(getCachedPlan()).resolves.toBeNull();
  });
});
