import { Database } from '@nozbe/watermelondb';
import type { Model } from '@nozbe/watermelondb';
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

const localDataTables = ['products', 'product_types', 'printers'] as const;

/**
 * Removes the Watermelon records owned by the establishment-scoped hooks.
 * Orders, sales, and users intentionally remain untouched until their hooks
 * move to Watermelon in later migration tasks.
 */
export async function resetWatermelonLocalData(targetDatabase: Database = database) {
  await targetDatabase.write(async () => {
    const recordsToDelete: Model[] = [];

    for (const tableName of localDataTables) {
      const records = await targetDatabase.get<Model>(tableName).query().fetch();
      recordsToDelete.push(...records.map((record) => record.prepareDestroyPermanently()));
    }

    if (recordsToDelete.length > 0) {
      await targetDatabase.batch(...recordsToDelete);
    }
  });
}

export default database;
