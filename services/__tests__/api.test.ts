import { listVendas } from '../api';

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
    const result = await listVendas('token-123', { page: 2, limit: 10, dataInicial: '2026-08-20', cliente: 'Ana' });
    expect(result).toEqual(payload);
    expect(result.pagination).toEqual(payload.pagination);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [requestUrl, requestOptions] = fetchMock.mock.calls[0];
    const parsedUrl = new URL(String(requestUrl));
    expect(parsedUrl.pathname).toBe('/vendas');
    expect(parsedUrl.searchParams.get('page')).toBe('2');
    expect(parsedUrl.searchParams.get('limit')).toBe('10');
    expect(parsedUrl.searchParams.get('cliente')).toBe('Ana');
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
});
