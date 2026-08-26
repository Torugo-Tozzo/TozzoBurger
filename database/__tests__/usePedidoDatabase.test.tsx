// database/__tests__/useOrderDatabase.test.tsx
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
import { useOrderDatabase } from '../useOrderDatabase';
import { ORDER_STATUS } from '../types/Order';

const mockUseSQLiteContext = useSQLiteContext as jest.Mock;
const mockMarkChanged = markChanged as jest.Mock;

function makeStatement() {
  return {
    executeAsync: jest.fn(async () => ({})),
    finalizeAsync: jest.fn(async () => {}),
  };
}

function renderPedidosDbHook() {
  let result!: ReturnType<typeof useOrderDatabase>;
  function Harness() {
    result = useOrderDatabase();
    return null;
  }
  act(() => {
    TestRenderer.create(<Harness />);
  });
  return result;
}

describe('useOrderDatabase — table watermark', () => {
  beforeEach(() => {
    mockMarkChanged.mockReset();
  });

  it('createPedido() marks orders changed', async () => {
    const db = {
      prepareAsync: jest.fn(async () => makeStatement()),
      getFirstAsync: jest.fn(async () => ({ price: 10 })),
    };
    mockUseSQLiteContext.mockReturnValue(db);

    const { createPedido } = renderPedidosDbHook();
    await createPedido([{ productId: 'p1', quantity: 2 }], 'Cliente X');

    expect(mockMarkChanged).toHaveBeenCalledWith('orders');
  });

  it('createFromSync() marks orders changed', async () => {
    const db = { prepareAsync: jest.fn(async () => makeStatement()) };
    mockUseSQLiteContext.mockReturnValue(db);

    const { createFromSync } = renderPedidosDbHook();
    await createFromSync({
      id: 'ped-1',
      total: 10,
      openedAt: new Date().toISOString(),
      status: ORDER_STATUS.ABERTO,
    } as any);

    expect(mockMarkChanged).toHaveBeenCalledWith('orders');
  });

  it('updatePedido() marks orders changed', async () => {
    const db = {
      prepareAsync: jest.fn(async () => makeStatement()),
      getAllAsync: jest.fn(async () => []),
      getFirstAsync: jest.fn(async () => ({ price: 10 })),
    };
    mockUseSQLiteContext.mockReturnValue(db);

    const { updatePedido } = renderPedidosDbHook();
    await updatePedido('ped-1', undefined, 'Novo Cliente');

    expect(mockMarkChanged).toHaveBeenCalledWith('orders');
  });

  it('removePedido() marks orders changed', async () => {
    const db = { prepareAsync: jest.fn(async () => makeStatement()) };
    mockUseSQLiteContext.mockReturnValue(db);

    const { removePedido } = renderPedidosDbHook();
    await removePedido('ped-1');

    expect(mockMarkChanged).toHaveBeenCalledWith('orders');
  });
});
