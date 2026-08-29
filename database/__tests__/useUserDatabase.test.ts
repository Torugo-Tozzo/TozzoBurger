jest.mock('react-native', () => {
  const databaseBridge = require('@nozbe/watermelondb/adapters/sqlite/sqlite-node/DatabaseBridge').default;
  const bridgeMethods = [
    'initialize',
    'setUpWithSchema',
    'setUpWithMigrations',
    'find',
    'query',
    'queryIds',
    'unsafeQueryRaw',
    'count',
    'batch',
    'unsafeResetDatabase',
    'getLocal',
  ];
  const asyncDatabaseBridge = bridgeMethods.reduce((bridge, method) => {
    bridge[method] = (...args: unknown[]) =>
      new Promise((resolve, reject) => {
        databaseBridge[method](...args, resolve, reject);
      });
    return bridge;
  }, {} as Record<string, (...args: unknown[]) => Promise<unknown>>);

  return {
    NativeModules: { WMDatabaseBridge: asyncDatabaseBridge },
    Platform: { OS: 'ios' },
  };
});

let mockDatabase: import('@nozbe/watermelondb').Database;

jest.mock('../watermelon/database', () => ({
  get database() {
    return mockDatabase;
  },
}));

import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import migrations from '../watermelon/migrations';
import Order from '../watermelon/models/Order';
import OrderItem from '../watermelon/models/OrderItem';
import Printer from '../watermelon/models/Printer';
import Product from '../watermelon/models/Product';
import ProductType from '../watermelon/models/ProductType';
import Sale from '../watermelon/models/Sale';
import SaleItem from '../watermelon/models/SaleItem';
import User from '../watermelon/models/User';
import schema from '../watermelon/schema';
import { useUserDatabase } from '../useUserDatabase';

const modelClasses = [Product, ProductType, Order, OrderItem, Sale, SaleItem, User, Printer];

function makeDatabase() {
  const adapter = new SQLiteAdapter({
    schema,
    migrations,
    dbName: ':memory:',
    jsi: true,
    onSetUpError: (error) => {
      throw error;
    },
  });

  return new Database({ adapter, modelClasses });
}

describe('useUserDatabase', () => {
  beforeEach(() => {
    mockDatabase = makeDatabase();
  });

  it('create() keeps the insertedRowId return shape and persists through Watermelon Model API', async () => {
    const { create, show } = useUserDatabase();

    const result = await create({
      name: 'Dono',
      establishmentId: 7,
      establishmentName: 'Trailer',
    });

    expect(result).toEqual({ insertedRowId: 1 });
    await expect(show(1)).resolves.toMatchObject({
      id: 1,
      name: 'Dono',
      establishmentId: 7,
      establishmentName: 'Trailer',
    });
  });

  it('show() returns null for a missing user and list() remains name-ordered', async () => {
    const { create, show, list } = useUserDatabase();
    await create({ name: 'Zé', establishmentId: 7, establishmentName: 'Trailer' });
    await create({ name: 'Ana', establishmentId: 7, establishmentName: 'Trailer' });

    await expect(show(99)).resolves.toBeNull();
    await expect(list()).resolves.toEqual([
      expect.objectContaining({ id: 2, name: 'Ana' }),
      expect.objectContaining({ id: 1, name: 'Zé' }),
    ]);
  });

  it('update() changes the same user fields as the legacy hook', async () => {
    const { create, show, update } = useUserDatabase();
    await create({ name: 'Dono', establishmentId: 7, establishmentName: 'Trailer' });

    await update({ id: 1, name: 'Gerente', establishmentId: 8, establishmentName: 'Loja' });

    await expect(show(1)).resolves.toMatchObject({
      id: 1,
      name: 'Gerente',
      establishmentId: 8,
      establishmentName: 'Loja',
    });
  });

  it('defaults an omitted role to EMPLOYEE', async () => {
    const { create, show } = useUserDatabase();

    await create({ name: 'Caixa', establishmentId: 7, establishmentName: 'Trailer' });

    await expect(show(1)).resolves.toMatchObject({ role: 'EMPLOYEE' });
  });
});
