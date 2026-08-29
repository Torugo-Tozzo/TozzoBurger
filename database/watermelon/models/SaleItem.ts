import { Model } from '@nozbe/watermelondb';
import { date, field, relation } from '@nozbe/watermelondb/decorators';
import type Relation from '@nozbe/watermelondb/Relation';

import type Product from './Product';
import type Sale from './Sale';

export default class SaleItem extends Model {
  static table = 'sale_items';

  static associations = {
    sales: { type: 'belongs_to' as const, key: 'sale_id' },
    products: { type: 'belongs_to' as const, key: 'product_id' },
  };

  @field('quantity') quantity!: number;
  @field('sale_id') saleId!: string;
  @relation('sales', 'sale_id') sale!: Relation<Sale>;
  @field('product_id') productId!: string;
  @relation('products', 'product_id') product!: Relation<Product>;
  @field('unit_price_at_sale') unitPriceAtSale!: number;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;
}
