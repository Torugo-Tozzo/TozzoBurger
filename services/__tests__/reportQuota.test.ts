import AsyncStorage from '@react-native-async-storage/async-storage';
import { getReportCountThisMonth, recordReportGenerated, clearReportQuota } from '../reportQuota';

const mockStorage = new Map<string, string>();

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    clear: jest.fn(async () => {
      mockStorage.clear();
    }),
    getItem: jest.fn(async (key: string) => mockStorage.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockStorage.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      mockStorage.delete(key);
    }),
    multiRemove: jest.fn(async (keys: string[]) => {
      keys.forEach((key) => mockStorage.delete(key));
    }),
  },
}));

describe('reportQuota', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('comeca em 0', async () => {
    await expect(getReportCountThisMonth('estab-1')).resolves.toBe(0);
  });

  it('incrementa a cada recordReportGenerated', async () => {
    await recordReportGenerated('estab-1');
    await recordReportGenerated('estab-1');

    await expect(getReportCountThisMonth('estab-1')).resolves.toBe(2);
  });

  it('reseta quando o mes guardado e diferente do mes atual', async () => {
    await AsyncStorage.setItem('tozzo_report_month_v1:estab-1', '2020-0');
    await AsyncStorage.setItem('tozzo_report_count_v1:estab-1', '5');

    await expect(getReportCountThisMonth('estab-1')).resolves.toBe(0);
  });

  it('não vaza contador entre estabelecimentos diferentes no mesmo dispositivo', async () => {
    await recordReportGenerated('estab-A');
    await recordReportGenerated('estab-A');
    await recordReportGenerated('estab-A');

    await expect(getReportCountThisMonth('estab-A')).resolves.toBe(3);
    await expect(getReportCountThisMonth('estab-B')).resolves.toBe(0);
  });

  it('clearReportQuota limpa a entrada do estabelecimento no logout', async () => {
    await recordReportGenerated('estab-1');
    await clearReportQuota('estab-1');

    await expect(getReportCountThisMonth('estab-1')).resolves.toBe(0);
  });
});
