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
    bridge[method] = (...args: unknown[]) => new Promise((resolve, reject) => {
      databaseBridge[method](...args, resolve, reject);
    });
    return bridge;
  }, {} as Record<string, (...args: unknown[]) => Promise<unknown>>);

  return {
    NativeModules: { WMDatabaseBridge: asyncDatabaseBridge },
    Platform: { OS: 'ios' },
  };
});

import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import migrations from '../watermelon/migrations';
import Order from '../watermelon/models/Order';
import OrderItem from '../watermelon/models/OrderItem';
import Printer from '../watermelon/models/Printer';
import PrintLog from '../watermelon/models/PrintLog';
import Product from '../watermelon/models/Product';
import ProductType from '../watermelon/models/ProductType';
import Sale from '../watermelon/models/Sale';
import SaleItem from '../watermelon/models/SaleItem';
import User from '../watermelon/models/User';
import schema from '../watermelon/schema';

const modelClasses = [Product, ProductType, Order, OrderItem, Sale, SaleItem, User, Printer, PrintLog];

function makeDatabase() {
  const adapter = new SQLiteAdapter({
    schema,
    migrations,
    dbName: ':memory:',
    jsi: true,
    onSetUpError: (error) => { throw error; },
  });
  return new Database({ adapter, modelClasses });
}

describe('PrintLog local table', () => {
  it('cria e le uma linha de print_logs com printed_at em epoch ms', async () => {
    const database = makeDatabase();
    const now = new Date();

    const created = await database.write(() => database.get<PrintLog>('print_logs').create((record) => {
      record.establishmentId = 'estab-1';
      record.deviceId = 'device-1';
      record.printedAt = now;
    }));

    const rows = await database.get<PrintLog>('print_logs').query().fetch();
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(created.id);
    expect(rows[0].deviceId).toBe('device-1');
    expect(rows[0].establishmentId).toBe('estab-1');
    expect(rows[0].printedAt.getTime()).toBe(now.getTime());
    expect((rows[0]._raw as unknown as { printed_at: number }).printed_at).toBe(now.getTime());
  });
});
