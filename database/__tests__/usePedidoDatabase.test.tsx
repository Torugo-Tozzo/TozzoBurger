// database/__tests__/usePedidoDatabase.test.tsx
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('expo-sqlite', () => ({
  useSQLiteContext: jest.fn(),
}));

jest.mock('../utils/uuid', () => ({
  generateUUID: jest.fn(() => 'generated-uuid'),
}));

jest.mock('../tableWatermark', () => ({
  markChanged: jest.fn(),
}));

import { useSQLiteContext } from 'expo-sqlite';
import { markChanged } from '../tableWatermark';
import { usePedidosDatabase } from '../usePedidoDatabase';
import { STATUS_PEDIDO } from '../types/Pedido';

const mockUseSQLiteContext = useSQLiteContext as jest.Mock;
const mockMarkChanged = markChanged as jest.Mock;

function makeStatement() {
  return {
    executeAsync: jest.fn(async () => ({})),
    finalizeAsync: jest.fn(async () => {}),
  };
}

function renderPedidosDbHook() {
  let result!: ReturnType<typeof usePedidosDatabase>;
  function Harness() {
    result = usePedidosDatabase();
    return null;
  }
  act(() => {
    TestRenderer.create(<Harness />);
  });
  return result;
}

describe('usePedidosDatabase — table watermark', () => {
  beforeEach(() => {
    mockMarkChanged.mockReset();
  });

  it('createPedido() marks pedidos changed', async () => {
    const db = {
      prepareAsync: jest.fn(async () => makeStatement()),
      getFirstAsync: jest.fn(async () => ({ preco: 10 })),
    };
    mockUseSQLiteContext.mockReturnValue(db);

    const { createPedido } = renderPedidosDbHook();
    await createPedido([{ produtoId: 'p1', quantidade: 2 }], 'Cliente X');

    expect(mockMarkChanged).toHaveBeenCalledWith('pedidos');
  });

  it('createFromSync() marks pedidos changed', async () => {
    const db = { prepareAsync: jest.fn(async () => makeStatement()) };
    mockUseSQLiteContext.mockReturnValue(db);

    const { createFromSync } = renderPedidosDbHook();
    await createFromSync({
      id: 'ped-1',
      total: 10,
      horario: new Date().toISOString(),
      status: STATUS_PEDIDO.ABERTO,
    } as any);

    expect(mockMarkChanged).toHaveBeenCalledWith('pedidos');
  });

  it('updatePedido() marks pedidos changed', async () => {
    const db = {
      prepareAsync: jest.fn(async () => makeStatement()),
      getAllAsync: jest.fn(async () => []),
      getFirstAsync: jest.fn(async () => ({ preco: 10 })),
    };
    mockUseSQLiteContext.mockReturnValue(db);

    const { updatePedido } = renderPedidosDbHook();
    await updatePedido('ped-1', undefined, 'Novo Cliente');

    expect(mockMarkChanged).toHaveBeenCalledWith('pedidos');
  });

  it('removePedido() marks pedidos changed', async () => {
    const db = { prepareAsync: jest.fn(async () => makeStatement()) };
    mockUseSQLiteContext.mockReturnValue(db);

    const { removePedido } = renderPedidosDbHook();
    await removePedido('ped-1');

    expect(mockMarkChanged).toHaveBeenCalledWith('pedidos');
  });
});
