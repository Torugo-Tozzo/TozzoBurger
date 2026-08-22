import { listVendas } from '../api';

describe('listVendas', () => {
  const fetchMock = jest.spyOn(global, 'fetch');
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

  afterEach(() => { fetchMock.mockReset(); consoleError.mockClear(); });
  afterAll(() => { fetchMock.mockRestore(); consoleError.mockRestore(); });

  it('faz GET autenticado, monta query params e retorna vendas e fechamento', async () => {
    const payload = { vendas: [{ id: 'venda-1', total: 25 }], fechamento: 25 };
    fetchMock.mockResolvedValue({ ok: true, text: jest.fn(async () => JSON.stringify(payload)) } as unknown as Response);
    const result = await listVendas('token-123', { page: 2, limit: 10, dataInicial: '2026-08-20', cliente: 'Ana' });
    expect(result).toEqual(payload);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [requestUrl, requestOptions] = fetchMock.mock.calls[0];
    const parsedUrl = new URL(String(requestUrl));
    expect(parsedUrl.pathname).toBe('/vendas');
    expect(parsedUrl.searchParams.get('page')).toBe('2');
    expect(parsedUrl.searchParams.get('limit')).toBe('10');
    expect(parsedUrl.searchParams.get('cliente')).toBe('Ana');
    expect(requestOptions).toEqual({ method: 'GET', headers: expect.objectContaining({ Authorization: 'Bearer token-123', Accept: 'application/json' }) });
  });

  it('propaga erro HTTP sem engolir a falha', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, text: jest.fn(async () => JSON.stringify({ message: 'Falha ao listar vendas' })) } as unknown as Response);
    await expect(listVendas('token-123', {})).rejects.toThrow('Falha ao listar vendas');
    expect(consoleError).toHaveBeenCalledWith('API listVendas error:', expect.stringContaining('/vendas'), 'Falha ao listar vendas');
  });
});
