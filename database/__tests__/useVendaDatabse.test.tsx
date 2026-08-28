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

jest.mock('expo-sqlite', () => ({
  useSQLiteContext: jest.fn(),
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

jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

import { Database, Q } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

import { useAuth } from '../../context/AuthContext';
import { markChanged } from '../tableWatermark';
import { useSaleDatabase } from '../useSaleDatabase';
import { buildLocalSalesQuery } from '../salesQuery';
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

function setCurrentEstablishment(establishmentId: string | number | null) {
  mockUseAuth.mockReturnValue({
    user: { establishmentId },
  } as ReturnType<typeof useAuth>);
}

async function seedProduct(
  database: Database,
  data: { id: string; name: string; price: number; establishmentId: string; productTypeId?: string },
) {
  const timestamp = new Date('2026-08-20T09:00:00.000Z').getTime();
  const product = database.get<Product>('products').prepareCreateFromDirtyRaw({
    id: data.id,
    _status: 'synced',
    _changed: '',
    name: data.name,
    price: data.price,
    product_type_id: data.productTypeId ?? null,
    source_product_id: null,
    ingredients: null,
    establishment_id: data.establishmentId,
    created_at: timestamp,
    updated_at: timestamp,
  });

  await database.write(() => database.batch(product));
  return product;
}

async function seedOrder(
  database: Database,
  data: {
    id: string;
    establishmentId: string;
    total: number;
    customerName?: string | null;
    sellerId?: string;
    openedAt?: Date;
    items: { productId: string; quantity: number; status: 'REQUESTED' | 'IN_PREPARATION' | 'DELIVERED'; unitPriceAtOrder: number }[];
  },
) {
  const timestamp = (data.openedAt ?? new Date('2026-08-20T10:00:00.000Z')).getTime();
  const order = database.get<Order>('orders').prepareCreateFromDirtyRaw({
    id: data.id,
    _status: 'synced',
    _changed: '',
    total: data.total,
    opened_at: timestamp,
    customer_name: data.customerName ?? null,
    is_open: true,
    establishment_id: data.establishmentId,
    seller_id: data.sellerId ?? '',
    created_at: timestamp,
    updated_at: timestamp,
  });
  const items = data.items.map((item) => database.get<OrderItem>('order_items').prepareCreateFromDirtyRaw({
    id: `${data.id}-${item.productId}-${item.quantity}`,
    _status: 'synced',
    _changed: '',
    quantity: item.quantity,
    status: item.status,
    order_id: data.id,
    product_id: item.productId,
    unit_price_at_order: item.unitPriceAtOrder,
    created_at: timestamp,
    updated_at: timestamp,
  }));

  await database.write(() => database.batch(order, ...items));
  return order;
}

async function seedSale(
  database: Database,
  data: {
    id: string;
    establishmentId: string;
    soldAt: Date;
    total: number;
    productId: string;
    quantity: number;
    unitPriceAtSale: number;
    customerName?: string | null;
  },
) {
  const timestamp = data.soldAt.getTime();
  const sale = database.get<Sale>('sales').prepareCreateFromDirtyRaw({
    id: data.id,
    _status: 'synced',
    _changed: '',
    total: data.total,
    sold_at: timestamp,
    customer_name: data.customerName ?? null,
    is_cancelled: false,
    establishment_id: data.establishmentId,
    seller_id: '',
    order_id: null,
    created_at: timestamp,
    updated_at: timestamp,
  });
  const item = database.get<SaleItem>('sale_items').prepareCreateFromDirtyRaw({
    id: `${data.id}-item`,
    _status: 'synced',
    _changed: '',
    quantity: data.quantity,
    sale_id: data.id,
    product_id: data.productId,
    unit_price_at_sale: data.unitPriceAtSale,
    created_at: timestamp,
    updated_at: timestamp,
  });

  await database.write(() => database.batch(sale, item));
  return sale;
}

describe('useSaleDatabase', () => {
  beforeEach(() => {
    mockDatabase = makeDatabase();
    mockMarkChanged.mockReset();
    setCurrentEstablishment('establishment-1');
  });

  it('creates a sale from an open order, closes the order, and copies items without status', async () => {
    await seedProduct(mockDatabase, {
      id: 'product-1',
      name: 'X-Salada',
      price: 25.5,
      establishmentId: 'establishment-1',
    });
    const order = await seedOrder(mockDatabase, {
      id: 'order-1',
      establishmentId: 'establishment-1',
      total: 51,
      customerName: 'Ana',
      sellerId: 'seller-1',
      items: [{
        productId: 'product-1',
        quantity: 2,
        status: 'DELIVERED',
        unitPriceAtOrder: 25.5,
      }],
    });

    const { createSaleFromOrder } = useSaleDatabase();
    const result = await createSaleFromOrder(order.id);

    await expect(mockDatabase.get<Order>('orders').find(order.id)).resolves.toMatchObject({
      isOpen: false,
    });
    const sale = await mockDatabase.get<Sale>('sales').find(result.saleId);
    expect(sale).toMatchObject({
      total: 51,
      customerName: 'Ana',
      establishmentId: 'establishment-1',
      sellerId: 'seller-1',
      orderId: order.id,
      isCancelled: false,
    });

    const items = await mockDatabase.get<SaleItem>('sale_items')
      .query(Q.where('sale_id', result.saleId))
      .fetch();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      saleId: result.saleId,
      productId: 'product-1',
      quantity: 2,
      unitPriceAtSale: 25.5,
    });
    expect((items[0] as unknown as { status?: unknown }).status).toBeUndefined();
    expect(mockMarkChanged).toHaveBeenCalledWith('sales');
    expect(mockMarkChanged).toHaveBeenCalledWith('orders');
  });

  it('creates a direct sale with product prices and returns its items through the Model API', async () => {
    await seedProduct(mockDatabase, {
      id: 'product-1',
      name: 'X-Bacon',
      price: 30,
      establishmentId: 'establishment-1',
    });

    const { createSale, getSaleById } = useSaleDatabase();
    const result = await createSale([{ productId: 'product-1', quantity: 2 }], 'Cliente Y', 'seller-1');

    await expect(getSaleById(result.saleId)).resolves.toMatchObject({
      id: result.saleId,
      total: 60,
      customerName: 'Cliente Y',
      establishmentId: 'establishment-1',
      items: [{
        productId: 'product-1',
        quantity: 2,
        unitPriceAtSale: 30,
      }],
    });
  });

  it('imports a synced sale with its incoming id and timestamps without adding item status', async () => {
    await seedProduct(mockDatabase, {
      id: 'product-1',
      name: 'X-Salada',
      price: 25,
      establishmentId: 'establishment-1',
    });

    const { createFromSync } = useSaleDatabase();
    await expect(createFromSync({
      id: 'synced-sale-1',
      total: 25,
      soldAt: '2026-08-20T12:00:00.000Z',
      customerName: 'Sync',
      isCancelled: false,
      establishmentId: 'establishment-1',
      updated_at: 1234,
      products: [{ id: 'synced-item-1', saleId: 'synced-sale-1', productId: 'product-1', quantity: 1 }],
    })).resolves.toEqual({ saleId: 'synced-sale-1' });

    await expect(mockDatabase.get<Sale>('sales').find('synced-sale-1')).resolves.toMatchObject({
      soldAt: new Date('2026-08-20T12:00:00.000Z'),
      updatedAt: new Date(1234),
      syncStatus: 'synced',
    });
    const [item] = await mockDatabase.get<SaleItem>('sale_items').query(Q.where('sale_id', 'synced-sale-1')).fetch();
    expect(item.id).toBe('synced-item-1');
    expect((item as unknown as { status?: unknown }).status).toBeUndefined();
    expect(mockMarkChanged).toHaveBeenCalledWith('sales');
  });

  it('does not read or mutate an order from another establishment', async () => {
    await seedOrder(mockDatabase, {
      id: 'foreign-order',
      establishmentId: 'establishment-other',
      total: 10,
      items: [],
    });

    const { createSaleFromOrder } = useSaleDatabase();

    await expect(createSaleFromOrder('foreign-order')).rejects.toThrow(/não encontrado|establishment/i);
    await expect(mockDatabase.get<Sale>('sales').query().fetch()).resolves.toEqual([]);
    await expect(mockDatabase.get<Order>('orders').find('foreign-order')).resolves.toMatchObject({ isOpen: true });
  });

  it('returns only local sales in a requested date period with pagination totals', async () => {
    await seedProduct(mockDatabase, {
      id: 'product-1',
      name: 'X-Salada',
      price: 25,
      establishmentId: 'establishment-1',
    });
    await seedSale(mockDatabase, {
      id: 'sale-in-period',
      establishmentId: 'establishment-1',
      soldAt: new Date('2026-08-20T12:00:00.000Z'),
      total: 50,
      productId: 'product-1',
      quantity: 2,
      unitPriceAtSale: 25,
    });
    await seedSale(mockDatabase, {
      id: 'sale-outside-period',
      establishmentId: 'establishment-1',
      soldAt: new Date('2026-08-22T12:00:00.000Z'),
      total: 25,
      productId: 'product-1',
      quantity: 1,
      unitPriceAtSale: 25,
    });
    await seedSale(mockDatabase, {
      id: 'sale-foreign',
      establishmentId: 'establishment-other',
      soldAt: new Date('2026-08-20T13:00:00.000Z'),
      total: 25,
      productId: 'product-1',
      quantity: 1,
      unitPriceAtSale: 25,
    });

    const { listRecentSales } = useSaleDatabase();
    await expect(listRecentSales({
      dataInicial: '2026-08-20',
      dataFinal: '2026-08-21',
      page: 1,
      limit: 10,
    })).resolves.toEqual({
      sales: [expect.objectContaining({
        id: 'sale-in-period',
        products: ['( 2x ) X-Salada'],
      })],
      closing: 50,
      pagination: {
        page: 1,
        limit: 10,
        total: 1,
        totalPages: 1,
        hasNextPage: false,
      },
    });
  });

  it('builds Watermelon clauses with establishment and date filters instead of SQL', () => {
    const query = buildLocalSalesQuery({
      dataInicial: '2026-08-20',
      dataFinal: '2026-08-21',
      customerName: 'Ana',
      totalMin: '10,50',
      totalMax: 99.9,
      page: 2,
      limit: 25,
    }, 'establishment-1');

    expect(query.page).toBe(2);
    expect(query.limit).toBe(25);
    expect(query.clauses).toHaveLength(7);
    expect(JSON.stringify(query.clauses)).toEqual(expect.stringContaining('establishment_id'));
    expect(JSON.stringify(query.clauses)).toEqual(expect.stringContaining('sold_at'));
    expect(JSON.stringify(query.clauses)).toEqual(expect.stringContaining('customer_name'));
    expect(JSON.stringify(query.clauses)).toEqual(expect.stringContaining('is_cancelled'));
  });

  it('matches local sale hours with the requested timezone offset', () => {
    const query = buildLocalSalesQuery({
      horaInicial: '20:00',
      horaFinal: '22:00',
      timezoneOffsetMinutes: 180,
    }, 'establishment-1');

    expect(query.matchesTime(new Date('2026-08-20T23:00:00.000Z'))).toBe(true);
    expect(query.matchesTime(new Date('2026-08-20T22:59:00.000Z'))).toBe(false);
    expect(query.matchesTime(new Date('2026-08-21T01:01:00.000Z'))).toBe(false);
  });

  it('uses the local Watermelon records for a day and a product sales report', async () => {
    await seedProduct(mockDatabase, {
      id: 'product-1',
      name: 'X-Salada',
      price: 25,
      productTypeId: '7',
      establishmentId: 'establishment-1',
    });
    await seedSale(mockDatabase, {
      id: 'sale-on-day',
      establishmentId: 'establishment-1',
      soldAt: new Date('2026-08-20T12:00:00.000Z'),
      total: 50,
      productId: 'product-1',
      quantity: 2,
      unitPriceAtSale: 25,
    });
    await seedSale(mockDatabase, {
      id: 'sale-next-day',
      establishmentId: 'establishment-1',
      soldAt: new Date('2026-08-21T12:00:00.000Z'),
      total: 25,
      productId: 'product-1',
      quantity: 1,
      unitPriceAtSale: 25,
    });

    const saleDatabase = useSaleDatabase();
    await expect(saleDatabase.listSalesByDay('2026-08-20')).resolves.toEqual([
      expect.objectContaining({ id: 'sale-on-day', products: ['( 2x ) X-Salada'] }),
    ]);
    await expect(saleDatabase.getSalesReportByPeriod('2026-08-20', '2026-08-20', '7')).resolves.toEqual([
      { id: 'product-1', name: 'X-Salada', price: 25, totalVendido: 2 },
    ]);
  });

  it('cancels only a sale in the authenticated establishment and hides it from local lists', async () => {
    await seedProduct(mockDatabase, {
      id: 'product-1',
      name: 'X-Salada',
      price: 25,
      establishmentId: 'establishment-1',
    });
    const sale = await seedSale(mockDatabase, {
      id: 'sale-1',
      establishmentId: 'establishment-1',
      soldAt: new Date('2026-08-20T12:00:00.000Z'),
      total: 25,
      productId: 'product-1',
      quantity: 1,
      unitPriceAtSale: 25,
    });

    const { removeSale, listRecentSales } = useSaleDatabase();
    await removeSale(sale.id);

    await expect(mockDatabase.get<Sale>('sales').find(sale.id)).resolves.toMatchObject({
      isCancelled: true,
    });
    await expect(listRecentSales({ page: 1, limit: 10 })).resolves.toMatchObject({
      sales: [],
      closing: 0,
      pagination: expect.objectContaining({ total: 0 }),
    });
    expect(mockMarkChanged).toHaveBeenCalledWith('sales');

    setCurrentEstablishment('establishment-other');
    await useSaleDatabase().removeSale(sale.id);
    await expect(mockDatabase.get<Sale>('sales').find(sale.id)).resolves.toMatchObject({
      isCancelled: true,
    });
  });
});
