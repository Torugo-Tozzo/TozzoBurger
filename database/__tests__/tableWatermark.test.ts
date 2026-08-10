import { markChanged, getChangedAt } from '../tableWatermark';

describe('tableWatermark', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('getChangedAt returns a stable number until markChanged is called', () => {
    const before = getChangedAt('pedidos');
    const after = getChangedAt('pedidos');
    expect(after).toBe(before);
  });

  it('markChanged strictly increases the watermark for that table', () => {
    const before = getChangedAt('produtos');
    markChanged('produtos');
    const after = getChangedAt('produtos');
    expect(after).toBeGreaterThan(before);
  });

  it('markChanged only affects the table it was called for', () => {
    const beforeVendas = getChangedAt('vendas');
    const beforePedidos = getChangedAt('pedidos');
    markChanged('vendas');
    expect(getChangedAt('vendas')).toBeGreaterThan(beforeVendas);
    expect(getChangedAt('pedidos')).toBe(beforePedidos);
  });

  it('stays strictly increasing even when Date.now() does not advance between calls', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const before = getChangedAt('produtos');
    markChanged('produtos');
    const first = getChangedAt('produtos');
    markChanged('produtos'); // Date.now() still mocked to the same value
    const second = getChangedAt('produtos');

    expect(first).toBeGreaterThan(before);
    expect(second).toBeGreaterThan(first);
  });
});
