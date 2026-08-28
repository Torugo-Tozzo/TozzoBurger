import {
  createProductType,
  getEstablishment,
  listVendas,
  updateEstablishmentCategory,
} from '../api';

describe('listVendas', () => {
  const fetchMock = jest.spyOn(global, 'fetch');
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

  afterEach(() => { fetchMock.mockReset(); consoleError.mockClear(); });
  afterAll(() => { fetchMock.mockRestore(); consoleError.mockRestore(); });

  it('faz GET autenticado, monta query params e preserva a paginação da resposta', async () => {
    const payload = {
      vendas: [{ id: 'venda-1', total: 25 }],
      fechamento: 50,
      pagination: { page: 2, limit: 50, total: 101, totalPages: 3, hasNextPage: true },
    };
    fetchMock.mockResolvedValue({ ok: true, text: jest.fn(async () => JSON.stringify(payload)) } as unknown as Response);
    const result = await listVendas('token-123', { page: 2, limit: 10, dataInicial: '2026-08-20', customerName: 'Ana' });
    expect(result.sales).toHaveLength(1);
    expect(result.sales[0]).toMatchObject({ id: 'venda-1', total: 25 });
    expect(result.closing).toBe(50);
    expect(result.pagination).toEqual(payload.pagination);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [requestUrl, requestOptions] = fetchMock.mock.calls[0];
    const parsedUrl = new URL(String(requestUrl));
    expect(parsedUrl.pathname).toBe('/vendas');
    expect(parsedUrl.searchParams.get('page')).toBe('2');
    expect(parsedUrl.searchParams.get('limit')).toBe('10');
    expect(parsedUrl.searchParams.get('customerName')).toBe('Ana');
    expect(requestOptions).toEqual({ method: 'GET', headers: expect.objectContaining({ Authorization: 'Bearer token-123', Accept: 'application/json' }) });
  });

  it('deriva a paginação antiga a partir dos filtros e do cabeçalho X-Total-Count', async () => {
    const payload = { vendas: [{ id: 'venda-2', total: 30 }], fechamento: 30 };
    fetchMock.mockResolvedValue({
      ok: true,
      text: jest.fn(async () => JSON.stringify(payload)),
      headers: { get: jest.fn((name: string) => name === 'X-Total-Count' ? '101' : null) },
    } as unknown as Response);

    const result = await listVendas('token-123', { page: 2, limit: 25 });

    expect(result.pagination).toEqual({ page: 2, limit: 25, total: 101, totalPages: 5, hasNextPage: true });
  });

  it('usa o fallback quando os campos da paginação chegam como strings', async () => {
    const payload = {
      vendas: [{ id: 'venda-3', total: 30 }],
      fechamento: 30,
      pagination: { page: '2', limit: '25', total: '101', totalPages: '5', hasNextPage: true },
    };
    fetchMock.mockResolvedValue({
      ok: true,
      text: jest.fn(async () => JSON.stringify(payload)),
      headers: { get: jest.fn((name: string) => name === 'X-Total-Count' ? '101' : null) },
    } as unknown as Response);

    const result = await listVendas('token-123', { page: 1, limit: 50 });

    expect(result.pagination).toEqual({ page: 1, limit: 50, total: 101, totalPages: 3, hasNextPage: true });
  });

  it('propaga erro HTTP sem engolir a falha', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: jest.fn(async () => JSON.stringify({ message: 'Falha ao listar vendas' })) } as unknown as Response);
    await expect(listVendas('token-123', {})).rejects.toThrow('Falha ao listar vendas');
    expect(consoleError).toHaveBeenCalledWith('API listVendas error:', expect.stringContaining('/vendas'), 'Falha ao listar vendas');
  });

  it('busca o estabelecimento autenticado com a categoria atual', async () => {
    const establishment = { id: 'establishment-1', name: 'Tozzo Burger', category: null };
    fetchMock.mockResolvedValue({
      ok: true,
      text: jest.fn(async () => JSON.stringify(establishment)),
    } as unknown as Response);

    await expect(getEstablishment('token-123')).resolves.toEqual(establishment);

    const [requestUrl, requestOptions] = fetchMock.mock.calls[0];
    expect(new URL(String(requestUrl)).pathname).toBe('/estabelecimentos');
    expect(requestOptions).toEqual({
      method: 'GET',
      headers: expect.objectContaining({
        Authorization: 'Bearer token-123',
        Accept: 'application/json',
      }),
    });
  });

  it('patches the authenticated establishment category with the English API field', async () => {
    const updated = { id: 'establishment-1', category: 'HAMBURGUERIA' };
    fetchMock.mockResolvedValue({
      ok: true,
      text: jest.fn(async () => JSON.stringify(updated)),
    } as unknown as Response);

    await expect(updateEstablishmentCategory('token-123', 'establishment-1', 'HAMBURGUERIA'))
      .resolves.toEqual(updated);

    const [requestUrl, requestOptions] = fetchMock.mock.calls[0];
    expect(new URL(String(requestUrl)).pathname).toBe('/establishments/establishment-1');
    expect(requestOptions).toEqual(expect.objectContaining({
      method: 'PATCH',
      headers: expect.objectContaining({
        Authorization: 'Bearer token-123',
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({ category: 'HAMBURGUERIA' }),
    }));
  });

  it('creates one product type using the documented English payload', async () => {
    const created = { id: 'type-1', description: 'Lanches', color: '#9E9E9E' };
    fetchMock.mockResolvedValue({
      ok: true,
      text: jest.fn(async () => JSON.stringify(created)),
    } as unknown as Response);

    await expect(createProductType('token-123', {
      description: 'Lanches',
      color: '#9E9E9E',
    })).resolves.toEqual(created);

    const [requestUrl, requestOptions] = fetchMock.mock.calls[0];
    expect(new URL(String(requestUrl)).pathname).toBe('/tipos');
    expect(requestOptions).toEqual(expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer token-123',
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({ description: 'Lanches', color: '#9E9E9E' }),
    }));
  });
});
