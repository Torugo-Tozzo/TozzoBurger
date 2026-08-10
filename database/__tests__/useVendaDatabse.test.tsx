// database/__tests__/useVendaDatabse.test.tsx
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
import { useVendasDatabase } from '../useVendaDatabse';

const mockUseSQLiteContext = useSQLiteContext as jest.Mock;
const mockMarkChanged = markChanged as jest.Mock;

function makeStatement() {
  return {
    executeAsync: jest.fn(async () => ({})),
    finalizeAsync: jest.fn(async () => {}),
  };
}

function renderVendasDbHook() {
  let result!: ReturnType<typeof useVendasDatabase>;
  function Harness() {
    result = useVendasDatabase();
    return null;
  }
  act(() => {
    TestRenderer.create(<Harness />);
  });
  return result;
}

describe('useVendasDatabase — table watermark', () => {
  beforeEach(() => {
    mockMarkChanged.mockReset();
  });

  it('createVenda() marks vendas changed', async () => {
    const db = {
      prepareAsync: jest.fn(async () => makeStatement()),
      getFirstAsync: jest.fn(async () => ({ preco: 10 })),
    };
    mockUseSQLiteContext.mockReturnValue(db);

    const { createVenda } = renderVendasDbHook();
    await createVenda([{ produtoId: 'p1', quantidade: 1 }], 'Cliente Y');

    expect(mockMarkChanged).toHaveBeenCalledWith('vendas');
  });

  it('createFromSync() marks vendas changed', async () => {
    const db = { prepareAsync: jest.fn(async () => makeStatement()) };
    mockUseSQLiteContext.mockReturnValue(db);

    const { createFromSync } = renderVendasDbHook();
    await createFromSync({ id: 'ven-1', total: 10, horario: new Date().toISOString() } as any);

    expect(mockMarkChanged).toHaveBeenCalledWith('vendas');
  });

  it('removeVenda() marks vendas changed', async () => {
    const db = { prepareAsync: jest.fn(async () => makeStatement()) };
    mockUseSQLiteContext.mockReturnValue(db);

    const { removeVenda } = renderVendasDbHook();
    await removeVenda('ven-1');

    expect(mockMarkChanged).toHaveBeenCalledWith('vendas');
  });
});
