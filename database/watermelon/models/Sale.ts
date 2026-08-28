import { Model } from '@nozbe/watermelondb';
import { children, date, field, relation } from '@nozbe/watermelondb/decorators';
import type Query from '@nozbe/watermelondb/Query';
import type Relation from '@nozbe/watermelondb/Relation';

import type Order from './Order';
import type SaleItem from './SaleItem';
import type User from './User';

export default class Sale extends Model {
  static table = 'sales';

  static associations = {
    sale_items: { type: 'has_many' as const, foreignKey: 'sale_id' },
    users: { type: 'belongs_to' as const, key: 'seller_id' },
    orders: { type: 'belongs_to' as const, key: 'order_id' },
  };

  @field('total') total!: number;
  @date('sold_at') soldAt!: Date;
  @field('customer_name') customerName!: string | null;
  @field('created_by_name') createdByName!: string | null;
  @field('is_cancelled') isCancelled!: boolean;
  @field('establishment_id') establishmentId!: string;
  @field('seller_id') sellerId!: string;
  @relation('users', 'seller_id') seller!: Relation<User>;
  @field('order_id') orderId!: string | null;
  @relation('orders', 'order_id') order!: Relation<Order>;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;

  @children('sale_items') items!: Query<SaleItem>;
}
