import { Model } from '@nozbe/watermelondb';
import { date, field, relation } from '@nozbe/watermelondb/decorators';
import type Relation from '@nozbe/watermelondb/Relation';

import type Order from './Order';
import type Product from './Product';

export type OrderItemStatus = 'REQUESTED' | 'IN_PREPARATION' | 'DELIVERED';

export default class OrderItem extends Model {
  static table = 'order_items';

  static associations = {
    orders: { type: 'belongs_to' as const, key: 'order_id' },
    products: { type: 'belongs_to' as const, key: 'product_id' },
  };

  @field('quantity') quantity!: number;
  @field('status') status!: OrderItemStatus;
  @field('order_id') orderId!: string;
  @relation('orders', 'order_id') order!: Relation<Order>;
  @field('product_id') productId!: string;
  @relation('products', 'product_id') product!: Relation<Product>;
  @field('unit_price_at_order') unitPriceAtOrder!: number;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
