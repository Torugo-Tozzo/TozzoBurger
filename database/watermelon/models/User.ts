import { Model } from '@nozbe/watermelondb';
import { children, field } from '@nozbe/watermelondb/decorators';
import type Query from '@nozbe/watermelondb/Query';

import type Order from './Order';
import type Sale from './Sale';

export default class User extends Model {
  static table = 'users';

  static associations = {
    orders: { type: 'has_many' as const, foreignKey: 'seller_id' },
    sales: { type: 'has_many' as const, foreignKey: 'seller_id' },
  };

  @field('name') name!: string;
  @field('email') email!: string | null;
  @field('establishment_id') establishmentId!: string;
  @field('establishment_name') establishmentName!: string | null;
  @field('role') role!: string | null;

  @children('orders') orders!: Query<Order>;
  @children('sales') sales!: Query<Sale>;
}
