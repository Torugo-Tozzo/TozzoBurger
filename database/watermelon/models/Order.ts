import { Model } from '@nozbe/watermelondb';
import { children, date, field, relation } from '@nozbe/watermelondb/decorators';
import type Query from '@nozbe/watermelondb/Query';
import type Relation from '@nozbe/watermelondb/Relation';

import type OrderItem from './OrderItem';
import type User from './User';

export default class Order extends Model {
  static table = 'orders';

  static associations = {
    order_items: { type: 'has_many' as const, foreignKey: 'order_id' },
    users: { type: 'belongs_to' as const, key: 'seller_id' },
  };

  @field('total') total!: number;
  @date('opened_at') openedAt!: Date;
  @field('customer_name') customerName!: string | null;
  @field('is_open') isOpen!: boolean;
  @field('establishment_id') establishmentId!: string;
  @field('seller_id') sellerId!: string;
  @relation('users', 'seller_id') seller!: Relation<User>;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;

  @children('order_items') items!: Query<OrderItem>;
}
