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

jest.mock('@nozbe/watermelondb/adapters/sqlite', () => ({
  __esModule: true,
  default: class MockSQLiteAdapter {
    schema;

    constructor(options: { schema: unknown }) {
      this.schema = options.schema;
    }
  },
}));

import { Database } from '@nozbe/watermelondb';

import migrations from '../watermelon/migrations';
import { resetWatermelonLocalData } from '../watermelon/database';
import Order from '../watermelon/models/Order';
import OrderItem from '../watermelon/models/OrderItem';
import Printer from '../watermelon/models/Printer';
import Product from '../watermelon/models/Product';
import ProductType from '../watermelon/models/ProductType';
import Sale from '../watermelon/models/Sale';
import SaleItem from '../watermelon/models/SaleItem';
import User from '../watermelon/models/User';
import schema from '../watermelon/schema';

const modelClasses = [Product, ProductType, Order, OrderItem, Sale, SaleItem, User, Printer];

function makeDatabase() {
  const { default: SQLiteAdapter } = jest.requireActual<typeof import('@nozbe/watermelondb/adapters/sqlite')>(
    '@nozbe/watermelondb/adapters/sqlite',
  );
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

describe('resetWatermelonLocalData', () => {
  it('resets products, product types, and printers without clearing unrelated tables', async () => {
    const database = makeDatabase();
    const productTypes = database.get<ProductType>('product_types');
    const products = database.get<Product>('products');
    const users = database.get<User>('users');
    const printers = database.get<Printer>('printers');
    const now = new Date('2026-08-27T12:00:00.000Z');

    await database.write(async () => {
      const productType = await productTypes.create((record) => {
        record.description = 'Lanches';
        record.isActive = true;
        record.color = '#2f84d3';
        record.createdAt = now;
        record.updatedAt = now;
      });

      await products.create((record) => {
        record.name = 'Produto local';
        record.price = 25;
        record.productTypeId = productType.id;
        record.sourceProductId = null;
        record.ingredients = null;
        record.establishmentId = 'establishment-a';
        record.createdAt = now;
        record.updatedAt = now;
      });

      await users.create((record) => {
        record.name = 'Usuário local';
        record.email = null;
        record.establishmentId = 'establishment-a';
        record.establishmentName = 'Loja A';
        record.role = 'EMPLOYEE';
      });

      await printers.create((record) => {
        record.uuid = 'printer-a';
        record.name = 'Caixa A';
      });
    });

    await resetWatermelonLocalData(database);

    await expect(products.query().fetchCount()).resolves.toBe(0);
    await expect(productTypes.query().fetchCount()).resolves.toBe(0);
    await expect(printers.query().fetchCount()).resolves.toBe(0);
    await expect(users.query().fetchCount()).resolves.toBe(1);
  });
});
