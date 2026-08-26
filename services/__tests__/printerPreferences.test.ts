import AsyncStorage from '@react-native-async-storage/async-storage';
import { getPrinterWidth, setPrinterWidth, PRINTER_WIDTH_PREFERENCE_KEY } from '../printerPreferences';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
  },
}));

const mockGetItem = AsyncStorage.getItem as jest.Mock;
const mockSetItem = AsyncStorage.setItem as jest.Mock;

describe('printerPreferences', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('falls back to 80mm when nothing is stored', async () => {
    mockGetItem.mockResolvedValueOnce(null);
    expect(await getPrinterWidth()).toBe('80mm');
  });

  it('returns a valid stored preset', async () => {
    mockGetItem.mockResolvedValueOnce('58mm');
    expect(await getPrinterWidth()).toBe('58mm');
  });

  it('falls back to 80mm for a corrupted value', async () => {
    mockGetItem.mockResolvedValueOnce('bogus');
    expect(await getPrinterWidth()).toBe('80mm');
  });

  it('falls back to 80mm when storage throws', async () => {
    mockGetItem.mockRejectedValueOnce(new Error('storage unavailable'));
    expect(await getPrinterWidth()).toBe('80mm');
  });

  it('persists a valid preset', async () => {
    const result = await setPrinterWidth('110mm');
    expect(result).toBe('110mm');
    expect(mockSetItem).toHaveBeenCalledWith(PRINTER_WIDTH_PREFERENCE_KEY, '110mm');
  });

  it('persisting an invalid value falls back to 80mm', async () => {
    const result = await setPrinterWidth('bogus');
    expect(result).toBe('80mm');
    expect(mockSetItem).toHaveBeenCalledWith(PRINTER_WIDTH_PREFERENCE_KEY, '80mm');
  });
});
