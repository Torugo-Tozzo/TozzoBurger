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

jest.mock('@/services/api', () => ({
  pullChanges: jest.fn(),
  pushChanges: jest.fn(),
}));

let mockDatabase: import('@nozbe/watermelondb').Database;

jest.mock('../watermelon/database', () => ({
  get database() {
    return mockDatabase;
  },
}));

jest.mock('../tableWatermark', () => ({
  markChanged: jest.fn(),
}));

import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import * as api from '@/services/api';
import { runWithLock } from '../syncGuard';
import { pullChanges, pushChanges, synchronizeWithServer } from '../watermelon/sync';
import migrations from '../watermelon/migrations';
import Order from '../watermelon/models/Order';
import OrderItem from '../watermelon/models/OrderItem';
import Product from '../watermelon/models/Product';
import ProductType from '../watermelon/models/ProductType';
import PrintLog from '../watermelon/models/PrintLog';
import Sale from '../watermelon/models/Sale';
import SaleItem from '../watermelon/models/SaleItem';
import User from '../watermelon/models/User';
import Printer from '../watermelon/models/Printer';
import schema from '../watermelon/schema';

const modelClasses = [Product, ProductType, Order, OrderItem, Sale, SaleItem, User, Printer, PrintLog];
const mockPullChanges = api.pullChanges as jest.Mock;
const mockPushChanges = api.pushChanges as jest.Mock;
const consoleLog = jest.spyOn(console, 'log').mockImplementation(() => undefined);
const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

type TestTableChanges = {
  created: Array<Record<string, unknown>>;
  updated: Array<Record<string, unknown>>;
  deleted: string[];
};

type TestChangeSet = {
  products: TestTableChanges;
  product_types: TestTableChanges;
  orders: TestTableChanges;
  order_items: TestTableChanges;
  sales: TestTableChanges;
  sale_items: TestTableChanges;
  print_logs: TestTableChanges;
};

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

function emptyChanges(): TestChangeSet {
  return {
    products: { created: [], updated: [], deleted: [] },
    product_types: { created: [], updated: [], deleted: [] },
    orders: { created: [], updated: [], deleted: [] },
    order_items: { created: [], updated: [], deleted: [] },
    sales: { created: [], updated: [], deleted: [] },
    sale_items: { created: [], updated: [], deleted: [] },
    print_logs: { created: [], updated: [], deleted: [] },
  };
}

describe('Watermelon sync transport', () => {
  afterAll(() => {
    consoleLog.mockRestore();
    consoleWarn.mockRestore();
  });

  beforeEach(() => {
    mockDatabase = makeDatabase();
    mockPullChanges.mockReset();
    mockPushChanges.mockReset();
    mockPullChanges.mockResolvedValue({ changes: emptyChanges(), timestamp: 1_700_000_000_010 });
    mockPushChanges.mockResolvedValue({ ignored: [], ignored_order_deletes: [] });
  });

  it('maps a server pull envelope and forwards the Watermelon cursor', async () => {
    const changes = emptyChanges();
    changes.products.created.push({
      id: 'product-1',
      name: 'Burger',
      price: 25,
      product_type_id: null,
      source_product_id: null,
      ingredients: null,
      establishment_id: 'establishment-a',
      created_at: 10,
      updated_at: 20,
    });
    mockPullChanges.mockResolvedValue({ changes, timestamp: 30 });

    const callback = pullChanges('token-123', 'establishment-a');
    const result = await callback({
      lastPulledAt: 20,
      schemaVersion: 2,
      migration: null,
    } as any);

    expect(result).toEqual({ changes, timestamp: 30 });
    expect(mockPullChanges).toHaveBeenCalledWith('token-123', {
      lastPulledAt: 20,
      schemaVersion: 2,
    });
  });

  it('posts apenas as sete tabelas sincronizadas, remove internos do Watermelon e relata itens ignorados', async () => {
    consoleWarn.mockClear();
    const changes = emptyChanges();
    changes.products.created.push({
      id: 'product-1',
      name: 'Burger',
      price: 25,
      establishment_id: 'establishment-a',
      _status: 'created',
      _changed: 'name,price',
    });
    (changes as any).users = { created: [{ id: 'user-1' }], updated: [], deleted: [] };
    mockPushChanges.mockResolvedValue({
      ignored: [{ type: 'product', entityId: 'product-1', reason: 'invalid' }],
      ignored_order_deletes: [{ type: 'order', entityId: 'order-1', reason: 'open order' }],
    });

    const callback = pushChanges('token-123', 'establishment-a');
    await expect(callback({ changes, lastPulledAt: 30 } as any)).resolves.toBeUndefined();

    expect(mockPushChanges).toHaveBeenCalledWith('token-123', {
      changes: {
        ...emptyChanges(),
        products: {
          created: [{
            id: 'product-1',
            name: 'Burger',
            price: 25,
            establishment_id: 'establishment-a',
          }],
          updated: [],
          deleted: [],
        },
      },
      lastPulledAt: 30,
    });
    expect(consoleWarn).toHaveBeenCalledWith(
      '[sync] server ignored push items',
      expect.objectContaining({
        ignored: expect.arrayContaining([expect.objectContaining({ entityId: 'product-1' })]),
        ignored_order_deletes: expect.arrayContaining([expect.objectContaining({ entityId: 'order-1' })]),
      }),
    );
  });

  it('does not swallow a push conflict', async () => {
    const conflict = Object.assign(new Error('server changed first'), {
      status: 409,
      code: 'SYNC_CONFLICT',
    });
    mockPushChanges.mockRejectedValue(conflict);

    await expect(pushChanges('token-123', 'establishment-a')({
      changes: emptyChanges(),
      lastPulledAt: 30,
    } as any)).rejects.toBe(conflict);
  });

  it('serializes concurrent native sync calls through the sync guard', async () => {
    let activePulls = 0;
    let maxActivePulls = 0;
    let notifyFirstPullStarted!: () => void;
    let releaseFirstPull!: () => void;
    const firstPullStarted = new Promise<void>((resolve) => {
      notifyFirstPullStarted = resolve;
    });
    const firstPullRelease = new Promise<void>((resolve) => {
      releaseFirstPull = resolve;
    });

    mockPullChanges.mockImplementation(async () => {
      activePulls += 1;
      maxActivePulls = Math.max(maxActivePulls, activePulls);
      notifyFirstPullStarted();
      await firstPullRelease;
      activePulls -= 1;
      return { changes: emptyChanges(), timestamp: 1_700_000_000_010 };
    });

    const first = runWithLock(() => synchronizeWithServer('token-123', 'establishment-a'));
    await firstPullStarted;
    const second = runWithLock(() => synchronizeWithServer('token-123', 'establishment-a'));
    releaseFirstPull();

    await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
    expect(maxActivePulls).toBe(1);
    expect(mockPullChanges).toHaveBeenCalledTimes(2);
  });

  it('rejects a pulled child row whose existing parent belongs to another establishment', async () => {
    const foreignOrder = mockDatabase.get<Order>('orders').prepareCreateFromDirtyRaw({
      id: 'foreign-order',
      _status: 'synced',
      _changed: '',
      total: 10,
      opened_at: 1_700_000_000_000,
      customer_name: null,
      is_open: true,
      establishment_id: 'establishment-b',
      seller_id: 'seller-b',
      created_at: 1_700_000_000_000,
      updated_at: 1_700_000_000_000,
    });
    await mockDatabase.write(() => mockDatabase.batch(foreignOrder));

    const changes = emptyChanges();
    changes.order_items.created.push({
      id: 'foreign-order-item',
      quantity: 1,
      status: 'REQUESTED',
      order_id: 'foreign-order',
      product_id: 'product-1',
      unit_price_at_order: 10,
      created_at: 1_700_000_000_010,
      updated_at: 1_700_000_000_010,
    });
    mockPullChanges.mockResolvedValue({ changes, timestamp: 1_700_000_000_020 });

    await expect(pullChanges('token-123', 'establishment-a')({
      lastPulledAt: 1_700_000_000_000,
      schemaVersion: 2,
      migration: null,
    } as any)).rejects.toThrow(/another establishment/i);
  });

  it('rejects a pulled scoped root row without scope when its local id is foreign', async () => {
    const foreignOrder = mockDatabase.get<Order>('orders').prepareCreateFromDirtyRaw({
      id: 'foreign-order',
      _status: 'synced',
      _changed: '',
      total: 10,
      opened_at: 1_700_000_000_000,
      customer_name: null,
      is_open: true,
      establishment_id: 'establishment-b',
      seller_id: 'seller-b',
      created_at: 1_700_000_000_000,
      updated_at: 1_700_000_000_000,
    });
    await mockDatabase.write(() => mockDatabase.batch(foreignOrder));

    const changes = emptyChanges();
    changes.orders.updated.push({
      id: 'foreign-order',
      total: 10,
      opened_at: 1_700_000_000_000,
      customer_name: null,
      is_open: false,
      seller_id: 'seller-b',
      created_at: 1_700_000_000_000,
      updated_at: 1_700_000_000_010,
    });
    mockPullChanges.mockResolvedValue({ changes, timestamp: 1_700_000_000_020 });

    await expect(pullChanges('token-123', 'establishment-a')({
      lastPulledAt: 1_700_000_000_000,
      schemaVersion: 2,
      migration: null,
    } as any)).rejects.toThrow(/another establishment/i);
  });

  it('applies remote is_open before pushing a new local order item', async () => {
    const now = 1_700_000_000_000;
    const products = mockDatabase.get<Product>('products');
    const orders = mockDatabase.get<Order>('orders');
    const orderItems = mockDatabase.get<OrderItem>('order_items');
    const product = products.prepareCreateFromDirtyRaw({
      id: 'product-1',
      _status: 'synced',
      _changed: '',
      name: 'Burger',
      price: 25,
      product_type_id: null,
      source_product_id: null,
      ingredients: null,
      establishment_id: 'establishment-a',
      created_at: now,
      updated_at: now,
    });
    const order = orders.prepareCreateFromDirtyRaw({
      id: 'order-1',
      _status: 'synced',
      _changed: '',
      total: 25,
      opened_at: now,
      customer_name: null,
      is_open: true,
      establishment_id: 'establishment-a',
      seller_id: 'seller-a',
      created_at: now,
      updated_at: now,
    });
    const newItem = orderItems.prepareCreateFromDirtyRaw({
      id: 'order-item-local',
      _status: 'created',
      _changed: '',
      quantity: 1,
      status: 'REQUESTED',
      order_id: 'order-1',
      product_id: 'product-1',
      unit_price_at_order: 25,
      created_at: now,
      updated_at: now,
    });

    await mockDatabase.write(() => mockDatabase.batch(product, order, newItem));

    const remoteOrder = {
      id: 'order-1',
      total: 25,
      opened_at: now,
      customer_name: null,
      is_open: false,
      establishment_id: 'establishment-a',
      seller_id: 'seller-a',
      created_at: now,
      updated_at: now + 10,
    };
    const changes = emptyChanges();
    changes.orders.updated.push(remoteOrder);
    mockPullChanges.mockResolvedValue({ changes, timestamp: now + 20 });

    let isOpenAtPush: boolean | undefined;
    mockPushChanges.mockImplementation(async (_token: string, payload: any) => {
      isOpenAtPush = (await orders.find('order-1')).isOpen;
      expect(payload.changes.order_items.created).toEqual([
        expect.objectContaining({ id: 'order-item-local', order_id: 'order-1' }),
      ]);
      return { ignored: [], ignored_order_deletes: [] };
    });

    await runWithLock(() => synchronizeWithServer('token-123', 'establishment-a'));

    expect(isOpenAtPush).toBe(false);
    await expect(orders.find('order-1')).resolves.toMatchObject({ isOpen: false });
  });
});
