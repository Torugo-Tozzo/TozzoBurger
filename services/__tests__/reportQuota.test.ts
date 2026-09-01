import AsyncStorage from '@react-native-async-storage/async-storage';
import { getReportCountThisMonth, recordReportGenerated } from '../reportQuota';

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
  },
}));

describe('reportQuota', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('comeca em 0', async () => {
    await expect(getReportCountThisMonth()).resolves.toBe(0);
  });

  it('incrementa a cada recordReportGenerated', async () => {
    await recordReportGenerated();
    await recordReportGenerated();

    await expect(getReportCountThisMonth()).resolves.toBe(2);
  });

  it('reseta quando o mes guardado e diferente do mes atual', async () => {
    await AsyncStorage.setItem('tozzo_report_month_v1', '2020-0');
    await AsyncStorage.setItem('tozzo_report_count_v1', '5');

    await expect(getReportCountThisMonth()).resolves.toBe(0);
  });
});
