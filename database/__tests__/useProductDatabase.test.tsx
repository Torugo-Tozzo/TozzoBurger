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

import { Database, Q } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { markChanged } from '../tableWatermark';
import { useAuth } from '../../context/AuthContext';
import { useProductDatabase } from '../useProductDatabase';
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

async function seedProductType(
  database: Database,
  id: string,
  description: string,
  isActive = true,
) {
  const now = Date.now();
  const productTypes = database.get<ProductType>('product_types');
  const productType = productTypes.prepareCreateFromDirtyRaw({
    id,
    _status: 'synced',
    _changed: '',
    description,
    is_active: isActive,
    color: '#2f84d3',
    created_at: now,
    updated_at: now,
  });

  await database.write(async () => {
    await database.batch(productType);
  });

  return productType;
}

async function seedProduct(
  database: Database,
  data: { name: string; price: number; productTypeId: string; sourceProductId?: string | null },
) {
  const now = new Date();
  const products = database.get<Product>('products');

  return database.write(() => products.create((product) => {
    product.name = data.name;
    product.price = data.price;
    product.productTypeId = data.productTypeId;
    product.sourceProductId = data.sourceProductId ?? null;
    product.ingredients = null;
    product.establishmentId = 'establishment-1';
    product.createdAt = now;
    product.updatedAt = now;
  }));
}

describe('useProductDatabase', () => {
  beforeEach(() => {
    mockDatabase = makeDatabase();
    mockMarkChanged.mockReset();
    setCurrentEstablishment('establishment-1');
  });

  it('create() creates a product with a Watermelon id and marks the table changed', async () => {
    await seedProductType(mockDatabase, '1', 'Lanches');

    const { create } = useProductDatabase();
    const result = await create({
      name: 'X-Salada',
      price: 25.5,
      productTypeId: 1,
    });

    expect(result).toEqual({ id: expect.any(String) });
    await expect(mockDatabase.get<Product>('products').find(result.id)).resolves.toMatchObject({
      name: 'X-Salada',
      price: 25.5,
      productTypeId: '1',
      syncStatus: 'created',
    });
    expect(mockMarkChanged).toHaveBeenCalledWith('products');
  });

  it('createFromSync() preserves the incoming id and timestamp through the Model API', async () => {
    await seedProductType(mockDatabase, '1', 'Lanches');

    const { createFromSync } = useProductDatabase();
    await expect(createFromSync({
      id: 'p1',
      name: 'X-Salada',
      price: 25.5,
      productTypeId: 1,
      updated_at: 1234,
      sourceProductId: 'source-1',
      ingredients: 'queijo',
    })).resolves.toEqual({ id: 'p1' });

    await expect(mockDatabase.get<Product>('products').find('p1')).resolves.toMatchObject({
      id: 'p1',
      name: 'X-Salada',
      productTypeId: '1',
      sourceProductId: 'source-1',
      ingredients: 'queijo',
      updatedAt: new Date(1234),
      syncStatus: 'synced',
    });
    expect(mockMarkChanged).toHaveBeenCalledWith('products');
  });

  it('update() updates the same fields as the legacy hook and marks the table changed', async () => {
    await seedProductType(mockDatabase, '1', 'Lanches');
    const product = await seedProduct(mockDatabase, {
      name: 'X-Salada',
      price: 25.5,
      productTypeId: '1',
      sourceProductId: 'source-1',
    });

    const { update } = useProductDatabase();
    await update({ id: product.id, name: 'X-Bacon', price: 30, productTypeId: 1, ingredients: 'bacon' });

    await expect(mockDatabase.get<Product>('products').find(product.id)).resolves.toMatchObject({
      name: 'X-Bacon',
      price: 30,
      productTypeId: '1',
      ingredients: 'bacon',
      sourceProductId: 'source-1',
    });
    expect(mockMarkChanged).toHaveBeenCalledWith('products');
  });

  it('remove() marks the product as deleted and hides it from show/search queries', async () => {
    await seedProductType(mockDatabase, '1', 'Lanches');
    const product = await seedProduct(mockDatabase, {
      name: 'X-Salada',
      price: 25.5,
      productTypeId: '1',
    });

    const { remove, show } = useProductDatabase();
    await remove(product.id);

    expect(product.syncStatus).toBe('deleted');
    await expect(show(product.id)).resolves.toBeNull();
    await expect(mockDatabase.get<Product>('products').query(Q.where('id', product.id)).fetch()).resolves.toEqual([]);
    expect(mockMarkChanged).toHaveBeenCalledWith('products');
  });

  it('searchByName() returns only matching products with active product types', async () => {
    await seedProductType(mockDatabase, '1', 'Lanches', true);
    await seedProductType(mockDatabase, '2', 'Inativos', false);
    const active = await seedProduct(mockDatabase, { name: 'Burger Especial', price: 25, productTypeId: '1' });
    await seedProduct(mockDatabase, { name: 'Burger Inativo', price: 20, productTypeId: '2' });
    const deleted = await seedProduct(mockDatabase, { name: 'Burger Removido', price: 20, productTypeId: '1' });

    await mockDatabase.write(() => deleted.markAsDeleted());

    const { searchByName } = useProductDatabase();
    await expect(searchByName('burger')).resolves.toEqual([
      expect.objectContaining({ id: active.id, name: 'Burger Especial', productTypeId: 1 }),
    ]);
  });

  it('getProductTypes(), filterByProductType(), source search, show(), and showAdd() keep their public behavior', async () => {
    await seedProductType(mockDatabase, '1', 'Lanches', true);
    await seedProductType(mockDatabase, '2', 'Inativos', false);
    const product = await seedProduct(mockDatabase, {
      name: 'Burger Especial',
      price: 25,
      productTypeId: '1',
      sourceProductId: 'source-1',
    });

    const productDatabase = useProductDatabase();

    await expect(productDatabase.getProductTypes()).resolves.toEqual([
      { id: 1, description: 'Lanches' },
    ]);
    await expect(productDatabase.filterByProductType(1, 20, 0)).resolves.toEqual([
      expect.objectContaining({ id: product.id, productTypeId: 1 }),
    ]);
    await expect(productDatabase.searchBySourceProductId('source-1')).resolves.toEqual([
      expect.objectContaining({ id: product.id, sourceProductId: 'source-1' }),
    ]);
    await expect(productDatabase.show(product.id)).resolves.toEqual(
      expect.objectContaining({ id: product.id, name: 'Burger Especial' }),
    );
    await expect(productDatabase.showAdd(product.id)).resolves.toEqual(
      expect.objectContaining({ id: product.id, name: 'Burger Especial' }),
    );
  });

  it('isolates product queries when the authenticated establishment changes', async () => {
    await seedProductType(mockDatabase, '1', 'Lanches');

    setCurrentEstablishment('establishment-a');
    const establishmentADatabase = useProductDatabase();
    const created = await establishmentADatabase.create({
      name: 'Produto do A',
      price: 25,
      productTypeId: 1,
      sourceProductId: 'source-a',
    });

    setCurrentEstablishment('establishment-b');
    const establishmentBDatabase = useProductDatabase();

    await expect(establishmentBDatabase.searchByName('Produto do A')).resolves.toEqual([]);
    await expect(establishmentBDatabase.filterByProductType(1, 20, 0)).resolves.toEqual([]);
    await expect(establishmentBDatabase.searchBySourceProductId('source-a')).resolves.toEqual([]);
    await expect(establishmentBDatabase.show(created.id)).resolves.toBeNull();
    await expect(establishmentBDatabase.showAdd(created.id)).resolves.toBeNull();

    setCurrentEstablishment('establishment-a');
    await expect(useProductDatabase().show(created.id)).resolves.toEqual(
      expect.objectContaining({ id: created.id, name: 'Produto do A' }),
    );
  });
});
