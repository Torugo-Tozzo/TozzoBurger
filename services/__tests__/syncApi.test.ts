import { pullChanges, pushChanges, ApiHttpError } from '../api';

describe('Watermelon sync API client', () => {
  const fetchMock = jest.spyOn(global, 'fetch');
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

  afterEach(() => {
    fetchMock.mockReset();
    consoleError.mockClear();
  });

  afterAll(() => {
    fetchMock.mockRestore();
    consoleError.mockRestore();
  });

  it('sends the Watermelon pull cursor and schema version to /sync/pull', async () => {
    const response = {
      changes: {
        products: { created: [], updated: [], deleted: [] },
        product_types: { created: [], updated: [], deleted: [] },
        orders: { created: [], updated: [], deleted: [] },
        order_items: { created: [], updated: [], deleted: [] },
        sales: { created: [], updated: [], deleted: [] },
        sale_items: { created: [], updated: [], deleted: [] },
      },
      timestamp: 1_700_000_000_001,
    };
    fetchMock.mockResolvedValue({
      ok: true,
      text: jest.fn(async () => JSON.stringify(response)),
    } as unknown as Response);

    await expect(pullChanges('token-123', {
      lastPulledAt: 1_700_000_000_000,
      schemaVersion: 2,
    })).resolves.toEqual(response);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [requestUrl, requestOptions] = fetchMock.mock.calls[0];
    const parsedUrl = new URL(String(requestUrl));
    expect(parsedUrl.pathname).toBe('/sync/pull');
    expect(parsedUrl.searchParams.get('lastPulledAt')).toBe('1700000000000');
    expect(parsedUrl.searchParams.get('schemaVersion')).toBe('2');
    expect(requestOptions).toEqual({
      method: 'GET',
      headers: expect.objectContaining({
        Authorization: 'Bearer token-123',
        Accept: 'application/json',
      }),
    });
  });

  it('omits the first-sync cursor while still sending schemaVersion', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: jest.fn(async () => JSON.stringify({ changes: {}, timestamp: 1 })),
    } as unknown as Response);

    await pullChanges('token-123', { lastPulledAt: null, schemaVersion: 2 });

    const [requestUrl] = fetchMock.mock.calls[0];
    const parsedUrl = new URL(String(requestUrl));
    expect(parsedUrl.pathname).toBe('/sync/pull');
    expect(parsedUrl.searchParams.has('lastPulledAt')).toBe(false);
    expect(parsedUrl.searchParams.get('schemaVersion')).toBe('2');
  });

  it('posts the exact Watermelon push envelope to /sync/push', async () => {
    const payload = {
      changes: {
        products: { created: [], updated: [], deleted: [] },
        product_types: { created: [], updated: [], deleted: [] },
        orders: { created: [], updated: [], deleted: [] },
        order_items: { created: [], updated: [], deleted: [] },
        sales: { created: [], updated: [], deleted: [] },
        sale_items: { created: [], updated: [], deleted: [] },
      },
      lastPulledAt: 1_700_000_000_001,
    };
    const response = { ignored: [], ignored_order_deletes: [] };
    fetchMock.mockResolvedValue({
      ok: true,
      text: jest.fn(async () => JSON.stringify(response)),
    } as unknown as Response);

    await expect(pushChanges('token-123', payload)).resolves.toEqual(response);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [requestUrl, requestOptions] = fetchMock.mock.calls[0];
    expect(new URL(String(requestUrl)).pathname).toBe('/sync/push');
    expect(requestOptions).toEqual(expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer token-123',
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify(payload),
    }));
  });

  it('preserves the 409 SYNC_CONFLICT error for synchronize to handle', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      text: jest.fn(async () => JSON.stringify({
        code: 'SYNC_CONFLICT',
        message: 'server changed first',
        details: [{ table: 'orders', id: 'order-1' }],
      })),
    } as unknown as Response);

    await expect(pushChanges('token-123', {
      changes: {
        products: { created: [], updated: [], deleted: [] },
        product_types: { created: [], updated: [], deleted: [] },
        orders: { created: [], updated: [], deleted: [] },
        order_items: { created: [], updated: [], deleted: [] },
        sales: { created: [], updated: [], deleted: [] },
        sale_items: { created: [], updated: [], deleted: [] },
      },
      lastPulledAt: 1_700_000_000_001,
    })).rejects.toMatchObject({
      status: 409,
      code: 'SYNC_CONFLICT',
      details: [{ table: 'orders', id: 'order-1' }],
    });

    expect(consoleError).toHaveBeenCalledWith(
      'API sync push error:',
      expect.stringContaining('/sync/push'),
      expect.stringContaining('server changed first'),
    );
    expect(consoleError.mock.calls.some((call) => call[0] === 'Network/sync push request failed')).toBe(false);
    expect(new ApiHttpError(400, 'bad request')).toBeInstanceOf(Error);
  });
});
