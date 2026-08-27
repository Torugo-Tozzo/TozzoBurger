import { Model } from '@nozbe/watermelondb';
import { children, date, field, relation } from '@nozbe/watermelondb/decorators';
import type Query from '@nozbe/watermelondb/Query';
import type Relation from '@nozbe/watermelondb/Relation';

import type OrderItem from './OrderItem';
import type ProductType from './ProductType';
import type SaleItem from './SaleItem';

export default class Product extends Model {
  static table = 'products';

  static associations = {
    product_types: { type: 'belongs_to' as const, key: 'product_type_id' },
    order_items: { type: 'has_many' as const, foreignKey: 'product_id' },
    sale_items: { type: 'has_many' as const, foreignKey: 'product_id' },
  };

  @field('name') name!: string;
  @field('price') price!: number;
  @field('product_type_id') productTypeId!: string | null;
  @relation('product_types', 'product_type_id') productType!: Relation<ProductType>;
  @field('source_product_id') sourceProductId!: string | null;
  @field('ingredients') ingredients!: string | null;
  @field('establishment_id') establishmentId!: string;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;

  @children('order_items') orderItems!: Query<OrderItem>;
  @children('sale_items') saleItems!: Query<SaleItem>;
}
