jest.mock('@/services/api', () => ({
  sincronizar: jest.fn(async () => ({})),
  getChanges: jest.fn(),
}));

jest.mock('../tableWatermark', () => ({
  markChanged: jest.fn(),
}));

jest.mock('../utils/uuid', () => ({
  generateUUID: jest.fn(() => 'generated-uuid'),
}));

import * as api from '@/services/api';
import { markChanged } from '../tableWatermark';
import { sincronizarComServidor } from '../useSyncDatabase';

const mockGetChanges = api.getChanges as jest.Mock;
const mockMarkChanged = markChanged as jest.Mock;

function makeFakeDb() {
  return {
    getFirstAsync: jest.fn(async () => null),
    getAllAsync: jest.fn(async () => []),
    runAsync: jest.fn(async () => ({})),
    execAsync: jest.fn(async () => undefined),
  };
}

describe('sincronizarComServidor — table watermark', () => {
  beforeEach(() => {
    mockMarkChanged.mockReset();
  });

  it('marks products changed when the server sends new products', async () => {
    mockGetChanges.mockResolvedValue({
      products: [{ id: 'p1', name: 'X', price: 10, updated_at: Date.now() }],
      orders: [],
      sales: [],
      productTypes: [],
    });

    await sincronizarComServidor(makeFakeDb() as any, 'token');

    expect(mockMarkChanged).toHaveBeenCalledWith('products');
    expect(mockMarkChanged).not.toHaveBeenCalledWith('orders');
    expect(mockMarkChanged).not.toHaveBeenCalledWith('sales');
  });

  it('marks products changed when the server sends new productTypes, even with no products', async () => {
    mockGetChanges.mockResolvedValue({
      products: [],
      orders: [],
      sales: [],
      productTypes: [{ id: 1, description: 'Bebida', updated_at: Date.now() }],
    });

    await sincronizarComServidor(makeFakeDb() as any, 'token');

    expect(mockMarkChanged).toHaveBeenCalledWith('products');
  });

  it('marks orders changed when the server sends new orders', async () => {
    mockGetChanges.mockResolvedValue({
      products: [],
      orders: [{ id: 'ped1', status: 'ABERTO', updated_at: Date.now() }],
      sales: [],
      productTypes: [],
    });

    await sincronizarComServidor(makeFakeDb() as any, 'token');

    expect(mockMarkChanged).toHaveBeenCalledWith('orders');
    expect(mockMarkChanged).not.toHaveBeenCalledWith('products');
  });

  it('marks sales changed when the server sends new sales', async () => {
    mockGetChanges.mockResolvedValue({
      products: [],
      orders: [],
      sales: [{ id: 'ven1', updated_at: Date.now() }],
      productTypes: [],
    });

    await sincronizarComServidor(makeFakeDb() as any, 'token');

    expect(mockMarkChanged).toHaveBeenCalledWith('sales');
    expect(mockMarkChanged).not.toHaveBeenCalledWith('products');
  });

  it('marks nothing changed when the server has nothing new', async () => {
    mockGetChanges.mockResolvedValue({ products: [], orders: [], sales: [], productTypes: [] });

    await sincronizarComServidor(makeFakeDb() as any, 'token');

    expect(mockMarkChanged).not.toHaveBeenCalled();
  });
});
