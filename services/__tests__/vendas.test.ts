import {
  buildVendasQueryParams,
  DEFAULT_VENDAS_LIMIT,
  DEFAULT_VENDAS_PAGE,
  filterVendasLocais,
  mapVendaApiToRender,
  MAX_VENDAS_LIMIT,
  mergeVendasPage,
  resetVendasPageState,
  VendaRenderizavel,
} from '../vendas';

describe('serviços puros de vendas', () => {
  it('expõe os limites compartilhados da paginação local', () => {
    expect(DEFAULT_VENDAS_PAGE).toBe(1);
    expect(DEFAULT_VENDAS_LIMIT).toBe(50);
    expect(MAX_VENDAS_LIMIT).toBe(100);
  });

  it('monta os parâmetros da API com limites de data no fuso local e omite vazios', () => {
    const params = buildVendasQueryParams({
      page: 2, limit: 25, dataInicial: '2026-08-20', dataFinal: '2026-08-21', horaInicial: '08:30', horaFinal: '22:15', cliente: ' Ana Silva ', totalMin: '10,50', totalMax: 99.9,
    });
    expect(params.get('page')).toBe('2');
    expect(params.get('limit')).toBe('25');
    expect(params.get('dataInicial')).toBe(new Date(2026, 7, 20, 8, 30, 0, 0).toISOString());
    expect(params.get('dataFinal')).toBe(new Date(2026, 7, 21, 22, 15, 0, 0).toISOString());
    expect(params.get('horaInicial')).toBe('08:30');
    expect(params.get('horaFinal')).toBe('22:15');
    expect(params.get('cliente')).toBe('Ana Silva');
    expect(params.get('totalMin')).toBe('10,50');
    expect(params.get('totalMax')).toBe('99.9');
    const emptyParams = buildVendasQueryParams({ dataInicial: '', dataFinal: null, horaInicial: ' ', cliente: undefined, totalMin: null, totalMax: '' });
    expect([...emptyParams.keys()]).toEqual([]);
  });

  it('mapeia itens, preços históricos e vendedor para o formato renderizável', () => {
    const venda = mapVendaApiToRender({
      id: 'venda-1', total: '42.5', horario: '2026-08-21T12:00:00.000Z', cliente: 'Ana Silva', vendedor: { id: 'usuario-1', nome: 'Caixa 1' },
      itens: [
        { id: 'item-1', quantidade: 2, precoHistorico: '10.5', produto: { id: 'produto-1', nome: 'X-Burger', preco: 12 } },
        { quantidade: '1', produto: { id: 'produto-2', nome: 'Batata', preco: '8' } },
      ],
    });
    expect(venda).toEqual({
      id: 'venda-1', total: 42.5, horario: '2026-08-21T12:00:00.000Z', cliente: 'Ana Silva', excluida: false, criado_por: 'usuario-1', criado_por_nome: 'Caixa 1',
      produtos: ['( 2x ) X-Burger', '( 1x ) Batata'],
      itens: [
        { id: 'item-1', produtoId: 'produto-1', nome: 'X-Burger', quantidade: 2, preco: 10.5, subtotal: 21 },
        { id: undefined, produtoId: 'produto-2', nome: 'Batata', quantidade: 1, preco: 8, subtotal: 8 },
      ],
    });
  });

  it('filtra vendas locais por período, horário, cliente e total', () => {
    const vendas: VendaRenderizavel[] = [
      { id: 'venda-1', total: 20, horario: new Date(2026, 7, 20, 9, 15).toISOString(), cliente: 'João da Silva', excluida: false, criado_por: null, criado_por_nome: null, produtos: [], itens: [] },
      { id: 'venda-2', total: 50, horario: new Date(2026, 7, 20, 11, 0).toISOString(), cliente: 'Maria', excluida: false, criado_por: null, criado_por_nome: null, produtos: [], itens: [] },
      { id: 'venda-3', total: 20, horario: new Date(2026, 7, 21, 9, 15).toISOString(), cliente: 'João da Silva', excluida: false, criado_por: null, criado_por_nome: null, produtos: [], itens: [] },
    ];
    const filtered = filterVendasLocais(vendas, { dataInicial: '2026-08-20', dataFinal: '2026-08-20', horaInicial: '09:00', horaFinal: '10:00', cliente: 'JOÃO', totalMin: '19,99', totalMax: 20 });
    expect(filtered.map(({ id }) => id)).toEqual(['venda-1']);
    expect(vendas).toHaveLength(3);
  });

  it('mescla página posterior sem duplicar IDs e substitui a venda repetida', () => {
    const existing = [{ id: 'v1', total: 10 } as VendaRenderizavel];
    const incoming = [{ id: 'v1', total: 20 } as VendaRenderizavel, { id: 'v2', total: 30 } as VendaRenderizavel];

    expect(mergeVendasPage(existing, incoming, 2).map((v) => v.id)).toEqual(['v1', 'v2']);
    expect(mergeVendasPage(existing, incoming, 2)[0]).toBe(incoming[0]);
  });

  it('deduplica o estado existente pela primeira ocorrência antes de mesclar página posterior', () => {
    const first = { id: 'v1', total: 10 } as VendaRenderizavel;
    const duplicate = { id: 'v1', total: 11 } as VendaRenderizavel;
    const other = { id: 'v2', total: 20 } as VendaRenderizavel;
    const replacement = { id: 'v1', total: 99 } as VendaRenderizavel;
    const incoming = [replacement, { id: 'v3', total: 30 } as VendaRenderizavel];

    const merged = mergeVendasPage([first, duplicate, other], incoming, 2);

    expect(merged.map((v) => v.id)).toEqual(['v1', 'v2', 'v3']);
    expect(merged[0]).toBe(replacement);
    expect(merged[1]).toBe(other);
  });

  it('substitui a lista anterior pela página 1 deduplicada', () => {
    const existing = [{ id: 'old' } as VendaRenderizavel];
    const incoming = [{ id: 'v1' } as VendaRenderizavel, { id: 'v1', total: 2 } as VendaRenderizavel];

    expect(mergeVendasPage(existing, incoming, 1).map((v) => v.id)).toEqual(['v1']);
    expect(mergeVendasPage(existing, incoming, 1)[0]).toBe(incoming[1]);
  });

  it('mantém itens existentes quando uma página posterior vem vazia', () => {
    const existing = [{ id: 'v1' } as VendaRenderizavel, { id: 'v2' } as VendaRenderizavel];

    expect(mergeVendasPage(existing, [], 3)).toEqual(existing);
  });

  it('cria o estado inicial padrão para resetar a paginação', () => {
    const first = resetVendasPageState();
    const second = resetVendasPageState();

    expect(first).toEqual({ page: 0, hasNextPage: true, loadingInitial: false, loadingMore: false, error: null });
    expect(second).not.toBe(first);
  });
});
