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

import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

import schema from '../watermelon/schema';
import migrations from '../watermelon/migrations';
import Product from '../watermelon/models/Product';
import ProductType from '../watermelon/models/ProductType';
import Order from '../watermelon/models/Order';
import OrderItem from '../watermelon/models/OrderItem';
import Sale from '../watermelon/models/Sale';
import SaleItem from '../watermelon/models/SaleItem';
import User from '../watermelon/models/User';
import Printer from '../watermelon/models/Printer';

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

describe('WatermelonDB schema and models', () => {
  it('creates and reads one record from every table through the Model API', async () => {
    const database = makeDatabase();
    const productTypes = database.get<ProductType>('product_types');
    const products = database.get<Product>('products');
    const orders = database.get<Order>('orders');
    const orderItems = database.get<OrderItem>('order_items');
    const sales = database.get<Sale>('sales');
    const saleItems = database.get<SaleItem>('sale_items');
    const users = database.get<User>('users');
    const printers = database.get<Printer>('printers');
    const createdAt = new Date('2026-08-27T12:00:00.000Z');
    const openedAt = new Date('2026-08-27T12:01:00.000Z');
    const soldAt = new Date('2026-08-27T12:02:00.000Z');

    const created = await database.write(async () => {
      const productType = await productTypes.create((record) => {
        record.description = 'Lanches';
        record.isActive = true;
        record.color = '#2f84d3';
        record.createdAt = createdAt;
        record.updatedAt = createdAt;
      });

      const user = await users.create((record) => {
        record.name = 'Caixa';
        record.email = 'caixa@example.test';
        record.establishmentId = 'establishment-1';
        record.establishmentName = 'Tozzo Burger';
        record.role = 'EMPLOYEE';
      });

      const product = await products.create((record) => {
        record.name = 'X-Salada';
        record.price = 25.5;
        record.productTypeId = productType.id;
        record.productType.id = productType.id;
        record.sourceProductId = 'source-product-17';
        record.ingredients = 'pão, carne, queijo';
        record.establishmentId = 'establishment-1';
        record.createdAt = createdAt;
        record.updatedAt = createdAt;
      });

      const order = await orders.create((record) => {
        record.total = 51;
        record.openedAt = openedAt;
        record.customerName = 'Ana';
        record.isOpen = true;
        record.establishmentId = 'establishment-1';
        record.sellerId = user.id;
        record.seller.set(user);
        record.createdAt = openedAt;
        record.updatedAt = openedAt;
      });

      const orderItem = await orderItems.create((record) => {
        record.quantity = 2;
        record.status = 'REQUESTED';
        record.orderId = order.id;
        record.order.id = order.id;
        record.productId = product.id;
        record.product.id = product.id;
        record.unitPriceAtOrder = 25.5;
        record.createdAt = openedAt;
        record.updatedAt = openedAt;
      });

      const sale = await sales.create((record) => {
        record.total = 51;
        record.soldAt = soldAt;
        record.customerName = 'Ana';
        record.isCancelled = false;
        record.establishmentId = 'establishment-1';
        record.sellerId = user.id;
        record.seller.set(user);
        record.orderId = order.id;
        record.order.set(order);
        record.createdAt = soldAt;
        record.updatedAt = soldAt;
      });

      const saleItem = await saleItems.create((record) => {
        record.quantity = 2;
        record.saleId = sale.id;
        record.sale.id = sale.id;
        record.productId = product.id;
        record.product.id = product.id;
        record.unitPriceAtSale = 25.5;
        record.createdAt = soldAt;
        record.updatedAt = soldAt;
      });

      const printer = await printers.create((record) => {
        record.uuid = 'printer-1';
        record.name = 'Caixa';
      });

      return { productType, user, product, order, orderItem, sale, saleItem, printer };
    });

    const { productType, user, product, order, orderItem, sale, saleItem, printer } = created;

    const readProductType = await productTypes.find(productType.id);
    const readProduct = await products.find(product.id);
    const readOrder = await orders.find(order.id);
    const readOrderItem = await orderItems.find(orderItem.id);
    const readSale = await sales.find(sale.id);
    const readSaleItem = await saleItems.find(saleItem.id);
    const readUser = await users.find(user.id);
    const readPrinter = await printers.find(printer.id);

    expect(readProductType).toMatchObject({
      description: 'Lanches',
      isActive: true,
      color: '#2f84d3',
      createdAt,
      updatedAt: createdAt,
    });
    expect(readProduct).toMatchObject({
      name: 'X-Salada',
      price: 25.5,
      productTypeId: productType.id,
      sourceProductId: 'source-product-17',
      ingredients: 'pão, carne, queijo',
      establishmentId: 'establishment-1',
      createdAt,
      updatedAt: createdAt,
    });
    expect(readOrder).toMatchObject({
      total: 51,
      openedAt,
      customerName: 'Ana',
      isOpen: true,
      establishmentId: 'establishment-1',
      sellerId: user.id,
      createdAt: openedAt,
      updatedAt: openedAt,
    });
    expect(readOrderItem).toMatchObject({
      quantity: 2,
      status: 'REQUESTED',
      orderId: order.id,
      productId: product.id,
      unitPriceAtOrder: 25.5,
      createdAt: openedAt,
      updatedAt: openedAt,
    });
    expect(readSale).toMatchObject({
      total: 51,
      soldAt,
      customerName: 'Ana',
      isCancelled: false,
      establishmentId: 'establishment-1',
      sellerId: user.id,
      orderId: order.id,
      createdAt: soldAt,
      updatedAt: soldAt,
    });
    expect(readSaleItem).toMatchObject({
      quantity: 2,
      saleId: sale.id,
      productId: product.id,
      unitPriceAtSale: 25.5,
      createdAt: soldAt,
      updatedAt: soldAt,
    });
    expect(readUser).toMatchObject({
      name: 'Caixa',
      email: 'caixa@example.test',
      establishmentId: 'establishment-1',
      establishmentName: 'Tozzo Burger',
      role: 'EMPLOYEE',
    });
    expect(readPrinter).toMatchObject({ uuid: 'printer-1', name: 'Caixa' });

    await expect(readProduct.productType.fetch()).resolves.toBe(readProductType);
    await expect(readProductType.products.fetch()).resolves.toEqual([readProduct]);
    await expect(readOrder.seller.fetch()).resolves.toBe(readUser);
    await expect(readOrder.items.fetch()).resolves.toEqual([readOrderItem]);
    await expect(readOrderItem.order.fetch()).resolves.toBe(readOrder);
    await expect(readOrderItem.product.fetch()).resolves.toBe(readProduct);
    await expect(readSale.seller.fetch()).resolves.toBe(readUser);
    await expect(readSale.order.fetch()).resolves.toBe(readOrder);
    await expect(readSale.items.fetch()).resolves.toEqual([readSaleItem]);
    await expect(readSaleItem.sale.fetch()).resolves.toBe(readSale);
    await expect(readSaleItem.product.fetch()).resolves.toBe(readProduct);
    await expect(readUser.orders.fetch()).resolves.toEqual([readOrder]);
    await expect(readUser.sales.fetch()).resolves.toEqual([readSale]);
    await expect(readProduct.orderItems.fetch()).resolves.toEqual([readOrderItem]);
    await expect(readProduct.saleItems.fetch()).resolves.toEqual([readSaleItem]);
  });
});
