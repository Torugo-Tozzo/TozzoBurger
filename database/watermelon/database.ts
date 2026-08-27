import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

import migrations from './migrations';
import Order from './models/Order';
import OrderItem from './models/OrderItem';
import Printer from './models/Printer';
import Product from './models/Product';
import ProductType from './models/ProductType';
import Sale from './models/Sale';
import SaleItem from './models/SaleItem';
import User from './models/User';
import schema from './schema';

export const modelClasses = [Product, ProductType, Order, OrderItem, Sale, SaleItem, User, Printer];

export function onSetUpError(error: Error) {
  console.error('[watermelon] database setup failed', error);
}

const adapter = new SQLiteAdapter({
  schema,
  migrations,
  jsi: true,
  dbName: 'tozzoburger',
  onSetUpError,
});

export const database = new Database({ adapter, modelClasses });

export default database;
