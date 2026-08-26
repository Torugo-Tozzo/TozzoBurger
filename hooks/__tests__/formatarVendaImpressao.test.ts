// hooks/__tests__/formatarVendaImpressao.test.ts
import { formatarVendaParaImpressao } from '../formatarVendaImpressao';
import { getPrinterWidth } from '@/services/printerPreferences';
import { i18n } from '@/i18n';

jest.mock('@/services/printerPreferences', () => ({
  getPrinterWidth: jest.fn(async () => '80mm'),
}));

// @/i18n transitively imports @react-native-async-storage/async-storage, whose
// real native module is unavailable under jest-expo — mock it like the other
// suites that pull in i18n (services/__tests__/printerPreferences.test.ts,
// i18n/__tests__/index.test.ts, app/__tests__/i18nResources.test.tsx).
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
  },
}));

const mockGetPrinterWidth = getPrinterWidth as jest.Mock;

const baseSale = {
  id: 'venda-1',
  total: 20,
  soldAt: new Date('2026-08-26T10:00:00Z').toISOString(),
  customerName: 'Jane',
} as any;

describe('formatarVendaParaImpressao', () => {
  beforeAll(async () => {
    await i18n.changeLanguage('en');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPrinterWidth.mockResolvedValue('80mm');
  });

  it('produces a longer padded line at 80mm (48 cols) than at 44mm (24 cols) for the same item', async () => {
    const produtos = [{ name: 'Burger', quantity: 1, price: 10 }];

    mockGetPrinterWidth.mockResolvedValueOnce('80mm');
    const at80mm = await formatarVendaParaImpressao(baseSale, produtos);

    mockGetPrinterWidth.mockResolvedValueOnce('44mm');
    const at44mm = await formatarVendaParaImpressao(baseSale, produtos);

    const dotsLength = (text: string) => (text.match(/\.{2,}/)?.[0].length ?? 0);
    expect(dotsLength(at80mm)).toBeGreaterThan(dotsLength(at44mm));
  });

  it('never produces a negative dot count for a long product name at the narrowest width (44mm, 24 cols)', async () => {
    mockGetPrinterWidth.mockResolvedValueOnce('44mm');
    const produtos = [{ name: 'A'.repeat(40), quantity: 1, price: 999.99 }];
    const result = await formatarVendaParaImpressao(baseSale, produtos);
    // Scope the assertion to the item line itself: the receipt header/footer
    // already contain literal "-" as decorative separators
    // (`------------- ... -------------`), unrelated to this guard, which is
    // specifically about numPontosLinha never going negative.
    const itemLine = result.split('\n').find((line) => line.includes('AAA')) ?? '';
    expect(itemLine).not.toContain('-');
  });

  it('resolves the customer name and total in the output', async () => {
    const result = await formatarVendaParaImpressao(baseSale, [{ name: 'Burger', quantity: 1, price: 10 }]);
    expect(result).toContain('Jane');
    expect(result).toContain('$20.00');
  });
});
