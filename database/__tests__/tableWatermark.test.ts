import { markChanged, getChangedAt } from '../tableWatermark';

describe('tableWatermark', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('getChangedAt returns a stable number until markChanged is called', () => {
    const before = getChangedAt('orders');
    const after = getChangedAt('orders');
    expect(after).toBe(before);
  });

  it('markChanged strictly increases the watermark for that table', () => {
    const before = getChangedAt('products');
    markChanged('products');
    const after = getChangedAt('products');
    expect(after).toBeGreaterThan(before);
  });

  it('markChanged only affects the table it was called for', () => {
    const beforeVendas = getChangedAt('sales');
    const beforePedidos = getChangedAt('orders');
    markChanged('sales');
    expect(getChangedAt('sales')).toBeGreaterThan(beforeVendas);
    expect(getChangedAt('orders')).toBe(beforePedidos);
  });

  it('stays strictly increasing even when Date.now() does not advance between calls', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const before = getChangedAt('products');
    markChanged('products');
    const first = getChangedAt('products');
    markChanged('products'); // Date.now() still mocked to the same value
    const second = getChangedAt('products');

    expect(first).toBeGreaterThan(before);
    expect(second).toBeGreaterThan(first);
  });
});
