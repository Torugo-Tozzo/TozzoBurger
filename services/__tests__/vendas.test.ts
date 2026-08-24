import {
  buildSalesQueryParams,
  DEFAULT_SALES_LIMIT,
  DEFAULT_SALES_PAGE,
  filterLocalSales,
  mapSaleApiToRender,
  MAX_VENDAS_LIMIT,
  mergeSalesPage,
  resetSalesPageState,
  SaleRenderable,
} from '../sales';

describe('serviços puros de sales', () => {
  it('expõe os limites compartilhados da paginação local', () => {
    expect(DEFAULT_SALES_PAGE).toBe(1);
    expect(DEFAULT_SALES_LIMIT).toBe(50);
    expect(MAX_VENDAS_LIMIT).toBe(100);
  });

  it('monta os parâmetros da API com limites de data no fuso local e omite vazios', () => {
    const params = buildSalesQueryParams({
      page: 2, limit: 25, dataInicial: '2026-08-20', dataFinal: '2026-08-21', horaInicial: '08:30', horaFinal: '22:15', customerName: ' Ana Silva ', totalMin: '10,50', totalMax: 99.9,
    });
    expect(params.get('page')).toBe('2');
    expect(params.get('limit')).toBe('25');
    expect(params.get('dataInicial')).toBe(new Date(2026, 7, 20, 8, 30, 0, 0).toISOString());
    expect(params.get('dataFinal')).toBe(new Date(2026, 7, 21, 22, 15, 0, 0).toISOString());
    expect(params.get('horaInicial')).toBe('08:30');
    expect(params.get('horaFinal')).toBe('22:15');
    expect(params.get('customerName')).toBe('Ana Silva');
    expect(params.get('totalMin')).toBe('10,50');
    expect(params.get('totalMax')).toBe('99.9');
    const emptyParams = buildSalesQueryParams({ dataInicial: '', dataFinal: null, horaInicial: ' ', customerName: undefined, totalMin: null, totalMax: '' });
    expect([...emptyParams.keys()]).toEqual([]);
  });

  it('envia o timezoneOffsetMinutes quando há filtro de hora e preserva a vírgula decimal', () => {
    const params = buildSalesQueryParams({
      horaInicial: '20:00',
      horaFinal: '22:00',
      timezoneOffsetMinutes: 180,
      totalMin: '10,50',
    });

    expect(params.get('timezoneOffsetMinutes')).toBe('180');
    expect(params.get('totalMin')).toBe('10,50');

    const withoutHour = buildSalesQueryParams({ timezoneOffsetMinutes: 180 });
    expect(withoutHour.get('timezoneOffsetMinutes')).toBeNull();
  });

  it('mapeia itens, preços históricos e vendedor para o formato renderizável', () => {
    const venda = mapSaleApiToRender({
      id: 'venda-1', total: '42.5', soldAt: '2026-08-21T12:00:00.000Z', customerName: 'Ana Silva', seller: { id: 'usuario-1', name: 'Caixa 1' },
      items: [
        { id: 'item-1', quantity: 2, unitPriceAtSale: '10.5', product: { id: 'produto-1', name: 'X-Burger', price: 12 } },
        { quantity: '1', product: { id: 'produto-2', name: 'Batata', price: '8' } },
      ],
    });
    expect(venda).toEqual({
      id: 'venda-1', total: 42.5, soldAt: '2026-08-21T12:00:00.000Z', customerName: 'Ana Silva', isCancelled: false, createdBy: 'usuario-1', createdByName: 'Caixa 1',
      products: ['( 2x ) X-Burger', '( 1x ) Batata'],
      items: [
        { id: 'item-1', productId: 'produto-1', name: 'X-Burger', quantity: 2, price: 10.5, subtotal: 21 },
        { id: undefined, productId: 'produto-2', name: 'Batata', quantity: 1, price: 8, subtotal: 8 },
      ],
    });
  });

  it('filtra sales locais por período, horário, customerName e total', () => {
    const sales: SaleRenderable[] = [
      { id: 'venda-1', total: 20, soldAt: new Date(2026, 7, 20, 9, 15).toISOString(), customerName: 'João da Silva', isCancelled: false, createdBy: null, createdByName: null, products: [], items: [] },
      { id: 'venda-2', total: 50, soldAt: new Date(2026, 7, 20, 11, 0).toISOString(), customerName: 'Maria', isCancelled: false, createdBy: null, createdByName: null, products: [], items: [] },
      { id: 'venda-3', total: 20, soldAt: new Date(2026, 7, 21, 9, 15).toISOString(), customerName: 'João da Silva', isCancelled: false, createdBy: null, createdByName: null, products: [], items: [] },
    ];
    const filtered = filterLocalSales(sales, { dataInicial: '2026-08-20', dataFinal: '2026-08-20', horaInicial: '09:00', horaFinal: '10:00', customerName: 'JOÃO', totalMin: '19,99', totalMax: 20 });
    expect(filtered.map(({ id }) => id)).toEqual(['venda-1']);
    expect(sales).toHaveLength(3);
  });

  it('mescla página posterior sem duplicar IDs e substitui a venda repetida', () => {
    const existing = [{ id: 'v1', total: 10 } as SaleRenderable];
    const incoming = [{ id: 'v1', total: 20 } as SaleRenderable, { id: 'v2', total: 30 } as SaleRenderable];

    expect(mergeSalesPage(existing, incoming, 2).map((v) => v.id)).toEqual(['v1', 'v2']);
    expect(mergeSalesPage(existing, incoming, 2)[0]).toBe(incoming[0]);
  });

  it('deduplica o estado existente pela primeira ocorrência antes de mesclar página posterior', () => {
    const first = { id: 'v1', total: 10 } as SaleRenderable;
    const duplicate = { id: 'v1', total: 11 } as SaleRenderable;
    const other = { id: 'v2', total: 20 } as SaleRenderable;
    const replacement = { id: 'v1', total: 99 } as SaleRenderable;
    const incoming = [replacement, { id: 'v3', total: 30 } as SaleRenderable];

    const merged = mergeSalesPage([first, duplicate, other], incoming, 2);

    expect(merged.map((v) => v.id)).toEqual(['v1', 'v2', 'v3']);
    expect(merged[0]).toBe(replacement);
    expect(merged[1]).toBe(other);
  });

  it('substitui a lista anterior pela página 1 deduplicada', () => {
    const existing = [{ id: 'old' } as SaleRenderable];
    const incoming = [{ id: 'v1' } as SaleRenderable, { id: 'v1', total: 2 } as SaleRenderable];

    expect(mergeSalesPage(existing, incoming, 1).map((v) => v.id)).toEqual(['v1']);
    expect(mergeSalesPage(existing, incoming, 1)[0]).toBe(incoming[1]);
  });

  it('mantém itens existentes quando uma página posterior vem vazia', () => {
    const existing = [{ id: 'v1' } as SaleRenderable, { id: 'v2' } as SaleRenderable];

    expect(mergeSalesPage(existing, [], 3)).toEqual(existing);
  });

  it('cria o estado inicial padrão para resetar a paginação', () => {
    const first = resetSalesPageState();
    const second = resetSalesPageState();

    expect(first).toEqual({ page: 0, hasNextPage: true, loadingInitial: false, loadingMore: false, error: null });
    expect(second).not.toBe(first);
  });
});
