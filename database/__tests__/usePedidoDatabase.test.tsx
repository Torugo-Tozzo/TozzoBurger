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

jest.mock('../tableWatermark', () => ({
  markChanged: jest.fn(),
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Database, Q } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

import { useAuth } from '../../context/AuthContext';
import { markChanged } from '../tableWatermark';
import { useOrderDatabase } from '../useOrderDatabase';
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

const modelClasses = [Product, ProductType, Order, OrderItem, Sale, SaleItem, User, Printer];
const mockMarkChanged = markChanged as jest.Mock;
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

function setCurrentEstablishment(establishmentId: string | number | null) {
  mockUseAuth.mockReturnValue({
    user: { establishmentId },
  } as ReturnType<typeof useAuth>);
}

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

async function seedProduct(
  database: Database,
  data: { id: string; name: string; price: number; establishmentId: string },
) {
  const now = Date.now();
  const preparedProduct = database.get<Product>('products').prepareCreateFromDirtyRaw({
    id: data.id,
    _status: 'synced',
    _changed: '',
    name: data.name,
    price: data.price,
    product_type_id: null,
    source_product_id: null,
    ingredients: null,
    establishment_id: data.establishmentId,
    created_at: now,
    updated_at: now,
  });

  await database.write(() => database.batch(preparedProduct));
  return preparedProduct;
}

function renderOrderDatabase() {
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

describe('useOrderDatabase', () => {
  beforeEach(() => {
    mockDatabase = makeDatabase();
    mockMarkChanged.mockReset();
    setCurrentEstablishment('establishment-1');
  });

  it('creates an open order and requested items by default', async () => {
    await seedProduct(mockDatabase, {
      id: 'product-1',
      name: 'X-Salada',
      price: 25.5,
      establishmentId: 'establishment-1',
    });

    const { createOrder, getOrderById } = renderOrderDatabase();
    const { orderId } = await createOrder([{ productId: 'product-1', quantity: 2 }], 'Ana');

    await expect(mockDatabase.get<Order>('orders').find(orderId)).resolves.toMatchObject({
      id: orderId,
      total: 51,
      customerName: 'Ana',
      isOpen: true,
      establishmentId: 'establishment-1',
      syncStatus: 'created',
    });

    const items = await mockDatabase.get<OrderItem>('order_items').query(Q.where('order_id', orderId)).fetch();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      orderId,
      productId: 'product-1',
      quantity: 2,
      status: 'REQUESTED',
    });
    await expect(getOrderById(orderId)).resolves.toMatchObject({
      id: orderId,
      isOpen: true,
      items: [expect.objectContaining({ status: 'REQUESTED' })],
    });
    expect(mockMarkChanged).toHaveBeenCalledWith('orders');
  });

  it('allows item status changes, including a direct requested-to-delivered transition', async () => {
    await seedProduct(mockDatabase, {
      id: 'product-1',
      name: 'X-Salada',
      price: 25.5,
      establishmentId: 'establishment-1',
    });

    const { createOrder, getOrderById, updateOrder } = renderOrderDatabase();
    const { orderId } = await createOrder([{ productId: 'product-1', quantity: 1 }]);

    await updateOrder(orderId, [{ productId: 'product-1', quantity: 1, status: 'IN_PREPARATION' }]);
    await expect(getOrderById(orderId)).resolves.toMatchObject({
      items: [expect.objectContaining({ status: 'IN_PREPARATION' })],
    });

    await updateOrder(orderId, [{ productId: 'product-1', quantity: 1, status: 'DELIVERED' }]);
    await expect(getOrderById(orderId)).resolves.toMatchObject({
      items: [expect.objectContaining({ status: 'DELIVERED' })],
    });
  });

  it('closes an order by setting isOpen false and removes it from open lists immediately', async () => {
    await seedProduct(mockDatabase, {
      id: 'product-1',
      name: 'X-Salada',
      price: 25.5,
      establishmentId: 'establishment-1',
    });

    const { createOrder, listRecentOrders, updateOrder } = renderOrderDatabase();
    const { orderId } = await createOrder([{ productId: 'product-1', quantity: 1 }]);

    await expect(listRecentOrders()).resolves.toEqual(
      expect.objectContaining({
        [new Date().toLocaleDateString()]: [expect.objectContaining({ id: orderId, isOpen: true })],
      }),
    );

    await updateOrder(orderId, undefined, undefined, false);

    await expect(mockDatabase.get<Order>('orders').find(orderId)).resolves.toMatchObject({ isOpen: false });
    await expect(listRecentOrders()).resolves.toEqual({});
  });

  it('keeps every order read and mutation scoped to the authenticated establishment', async () => {
    await seedProduct(mockDatabase, {
      id: 'product-a',
      name: 'Produto A',
      price: 10,
      establishmentId: 'establishment-a',
    });
    await seedProduct(mockDatabase, {
      id: 'product-b',
      name: 'Produto B',
      price: 20,
      establishmentId: 'establishment-b',
    });

    setCurrentEstablishment('establishment-a');
    const orderDatabaseA = renderOrderDatabase();
    const { orderId: orderA } = await orderDatabaseA.createOrder(
      [{ productId: 'product-a', quantity: 1 }],
      'Cliente A',
      true,
      'user-a',
    );

    setCurrentEstablishment('establishment-b');
    const orderDatabaseB = renderOrderDatabase();
    const { orderId: orderB } = await orderDatabaseB.createOrder(
      [{ productId: 'product-b', quantity: 1 }],
      'Cliente B',
      true,
      'user-b',
    );

    await expect(orderDatabaseB.listRecentOrders()).resolves.toEqual(
      expect.objectContaining({
        [new Date().toLocaleDateString()]: [expect.objectContaining({ id: orderB })],
      }),
    );
    await expect(orderDatabaseB.listRecentOrdersByUser('user-b')).resolves.toEqual(
      expect.objectContaining({
        [new Date().toLocaleDateString()]: [expect.objectContaining({ id: orderB })],
      }),
    );
    await expect(orderDatabaseB.countOpenOrders('user-b')).resolves.toBe(1);
    await expect(orderDatabaseB.getProductsByOrderId(orderA)).rejects.toThrow(/não encontrado/);

    await orderDatabaseB.updateOrder(orderA, undefined, 'Acesso indevido', false);
    await orderDatabaseB.removeOrder(orderA);

    setCurrentEstablishment('establishment-a');
    await expect(orderDatabaseA.getOrderById(orderA)).resolves.toMatchObject({
      customerName: 'Cliente A',
      isOpen: true,
    });
    await expect(orderDatabaseA.listRecentOrders()).resolves.toEqual(
      expect.objectContaining({
        [new Date().toLocaleDateString()]: [expect.objectContaining({ id: orderA })],
      }),
    );
  });

  it('creates a synced order and defaults synced items without a status to requested', async () => {
    await seedProduct(mockDatabase, {
      id: 'product-1',
      name: 'X-Salada',
      price: 10,
      establishmentId: 'establishment-1',
    });

    const { createFromSync } = renderOrderDatabase();

    await expect(createFromSync({
      id: 'synced-order-1',
      total: 10,
      openedAt: '2026-08-27T10:00:00.000Z',
      customerName: 'Sync',
      isOpen: true,
      establishmentId: 'establishment-1',
      sellerId: 'seller-1',
      updated_at: 1234,
      items: [{ productId: 'product-1', quantity: 1 }],
    })).resolves.toEqual({ orderId: 'synced-order-1' });

    await expect(mockDatabase.get<Order>('orders').find('synced-order-1')).resolves.toMatchObject({
      isOpen: true,
      establishmentId: 'establishment-1',
      updatedAt: new Date(1234),
      syncStatus: 'synced',
    });
    await expect(mockDatabase.get<OrderItem>('order_items').query(Q.where('order_id', 'synced-order-1')).fetch()).resolves.toEqual([
      expect.objectContaining({ status: 'REQUESTED', quantity: 1 }),
    ]);
  });

  it('rejects synced orders from another establishment instead of persisting them locally', async () => {
    const { createFromSync } = renderOrderDatabase();

    await expect(createFromSync({
      id: 'foreign-order',
      total: 10,
      openedAt: '2026-08-27T10:00:00.000Z',
      isOpen: true,
      establishmentId: 'establishment-other',
      sellerId: 'seller-other',
      updated_at: 1,
    })).rejects.toThrow(/establishment/i);

    await expect(mockDatabase.get<Order>('orders').query().fetch()).resolves.toEqual([]);
  });
});
