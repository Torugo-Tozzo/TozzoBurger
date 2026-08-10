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

  it('marks produtos changed when the server sends new produtos', async () => {
    mockGetChanges.mockResolvedValue({
      produtos: [{ id: 'p1', nome: 'X', preco: 10, updated_at: Date.now() }],
      pedidos: [],
      vendas: [],
      tiposProduto: [],
    });

    await sincronizarComServidor(makeFakeDb() as any, 'token');

    expect(mockMarkChanged).toHaveBeenCalledWith('produtos');
    expect(mockMarkChanged).not.toHaveBeenCalledWith('pedidos');
    expect(mockMarkChanged).not.toHaveBeenCalledWith('vendas');
  });

  it('marks produtos changed when the server sends new tiposProduto, even with no produtos', async () => {
    mockGetChanges.mockResolvedValue({
      produtos: [],
      pedidos: [],
      vendas: [],
      tiposProduto: [{ id: 1, descricao: 'Bebida', updated_at: Date.now() }],
    });

    await sincronizarComServidor(makeFakeDb() as any, 'token');

    expect(mockMarkChanged).toHaveBeenCalledWith('produtos');
  });

  it('marks pedidos changed when the server sends new pedidos', async () => {
    mockGetChanges.mockResolvedValue({
      produtos: [],
      pedidos: [{ id: 'ped1', status: 'ABERTO', updated_at: Date.now() }],
      vendas: [],
      tiposProduto: [],
    });

    await sincronizarComServidor(makeFakeDb() as any, 'token');

    expect(mockMarkChanged).toHaveBeenCalledWith('pedidos');
    expect(mockMarkChanged).not.toHaveBeenCalledWith('produtos');
  });

  it('marks vendas changed when the server sends new vendas', async () => {
    mockGetChanges.mockResolvedValue({
      produtos: [],
      pedidos: [],
      vendas: [{ id: 'ven1', updated_at: Date.now() }],
      tiposProduto: [],
    });

    await sincronizarComServidor(makeFakeDb() as any, 'token');

    expect(mockMarkChanged).toHaveBeenCalledWith('vendas');
    expect(mockMarkChanged).not.toHaveBeenCalledWith('produtos');
  });

  it('marks nothing changed when the server has nothing new', async () => {
    mockGetChanges.mockResolvedValue({ produtos: [], pedidos: [], vendas: [], tiposProduto: [] });

    await sincronizarComServidor(makeFakeDb() as any, 'token');

    expect(mockMarkChanged).not.toHaveBeenCalled();
  });
});
