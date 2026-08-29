import { Model } from '@nozbe/watermelondb';
import { children, date, field } from '@nozbe/watermelondb/decorators';
import type Query from '@nozbe/watermelondb/Query';

import type Product from './Product';

export default class ProductType extends Model {
  static table = 'product_types';

  static associations = {
    products: { type: 'has_many' as const, foreignKey: 'product_type_id' },
  };

  @field('description') description!: string;
  @field('is_active') isActive!: boolean;
  @field('color') color!: string;
  @date('created_at') createdAt!: Date;
  @date('updated_at') updatedAt!: Date;

  @children('products') products!: Query<Product>;
}
