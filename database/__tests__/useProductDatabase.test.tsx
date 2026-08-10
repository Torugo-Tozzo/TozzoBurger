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
import { useProductDatabase } from '../useProductDatabase';
import { markChanged } from '../tableWatermark';

const mockUseSQLiteContext = useSQLiteContext as jest.Mock;
const mockMarkChanged = markChanged as jest.Mock;

function makeStatement(executeImpl?: () => any) {
  return {
    executeAsync: jest.fn(executeImpl ?? (async () => ({}))),
    finalizeAsync: jest.fn(async () => {}),
  };
}

function renderProductDbHook() {
  let result!: ReturnType<typeof useProductDatabase>;
  function Harness() {
    result = useProductDatabase();
    return null;
  }
  act(() => {
    TestRenderer.create(<Harness />);
  });
  return result;
}

describe('useProductDatabase', () => {
  beforeEach(() => {
    mockUseSQLiteContext.mockReset();
    mockMarkChanged.mockReset();
  });

  it('create() inserts with a generated id and pending sync_status, always finalizing the statement', async () => {
    const statement = makeStatement();
    const db = {
      prepareAsync: jest.fn(async () => statement),
    };
    mockUseSQLiteContext.mockReturnValue(db);

    const { create } = renderProductDbHook();
    const result = await create({
      nome: 'X-Salada',
      preco: 25.5,
      tipoProdutoId: 1,
    } as any);

    expect(result).toEqual({ id: 'generated-uuid' });
    expect(db.prepareAsync).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO TB_PRODUTOS'));
    expect(statement.executeAsync).toHaveBeenCalledWith(
      expect.objectContaining({ $id: 'generated-uuid', $nome: 'X-Salada', $sync_status: 'pending' })
    );
    expect(statement.finalizeAsync).toHaveBeenCalledTimes(1);
  });

  it('create() still finalizes the statement when executeAsync throws', async () => {
    const statement = makeStatement(() => {
      throw new Error('insert failed');
    });
    const db = {
      prepareAsync: jest.fn(async () => statement),
    };
    mockUseSQLiteContext.mockReturnValue(db);

    const { create } = renderProductDbHook();
    await expect(create({ nome: 'X', preco: 1, tipoProdutoId: 1 } as any)).rejects.toThrow('insert failed');
    expect(statement.finalizeAsync).toHaveBeenCalledTimes(1);
  });

  it('remove() soft-deletes: sets deleted_at instead of removing the row', async () => {
    const db = {
      runAsync: jest.fn(async () => ({})),
    };
    mockUseSQLiteContext.mockReturnValue(db);

    const { remove } = renderProductDbHook();
    await remove('produto-1');

    expect(db.runAsync).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE TB_PRODUTOS SET deleted_at'),
      expect.arrayContaining([expect.any(Number), expect.any(Number), 'pending', 'produto-1'])
    );
  });

  it('searchByName() only returns rows with deleted_at IS NULL', async () => {
    const db = {
      getAllAsync: jest.fn(async () => []),
    };
    mockUseSQLiteContext.mockReturnValue(db);

    const { searchByName } = renderProductDbHook();
    await searchByName('burger');

    expect(db.getAllAsync).toHaveBeenCalledWith(
      expect.stringContaining('P.deleted_at IS NULL'),
      '%burger%'
    );
  });

  it('create() marks produtos changed', async () => {
    const statement = makeStatement();
    const db = { prepareAsync: jest.fn(async () => statement) };
    mockUseSQLiteContext.mockReturnValue(db);

    const { create } = renderProductDbHook();
    await create({ nome: 'X-Salada', preco: 25.5, tipoProdutoId: 1 } as any);

    expect(mockMarkChanged).toHaveBeenCalledWith('produtos');
  });

  it('createFromSync() marks produtos changed', async () => {
    const statement = makeStatement();
    const db = { prepareAsync: jest.fn(async () => statement) };
    mockUseSQLiteContext.mockReturnValue(db);

    const { createFromSync } = renderProductDbHook();
    await createFromSync({ id: 'p1', nome: 'X-Salada', preco: 25.5, tipoProdutoId: 1 } as any);

    expect(mockMarkChanged).toHaveBeenCalledWith('produtos');
  });

  it('update() marks produtos changed', async () => {
    const statement = makeStatement();
    const db = { prepareAsync: jest.fn(async () => statement) };
    mockUseSQLiteContext.mockReturnValue(db);

    const { update } = renderProductDbHook();
    await update({ id: 'p1', nome: 'X-Salada', preco: 30, tipoProdutoId: 1 } as any);

    expect(mockMarkChanged).toHaveBeenCalledWith('produtos');
  });

  it('remove() marks produtos changed', async () => {
    const db = { runAsync: jest.fn(async () => ({})) };
    mockUseSQLiteContext.mockReturnValue(db);

    const { remove } = renderProductDbHook();
    await remove('p1');

    expect(mockMarkChanged).toHaveBeenCalledWith('produtos');
  });
});
