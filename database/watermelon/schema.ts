import { appSchema, tableSchema } from '@nozbe/watermelondb';

const syncTimestamps = [
  { name: 'created_at', type: 'number' as const },
  { name: 'updated_at', type: 'number' as const },
];

export default appSchema({
  version: 3,
  tables: [
    tableSchema({
      name: 'products',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'price', type: 'number' },
        { name: 'product_type_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'source_product_id', type: 'string', isOptional: true },
        { name: 'ingredients', type: 'string', isOptional: true },
        { name: 'establishment_id', type: 'string', isIndexed: true },
        ...syncTimestamps,
      ],
    }),
    tableSchema({
      name: 'product_types',
      columns: [
        { name: 'description', type: 'string' },
        { name: 'is_active', type: 'boolean' },
        { name: 'color', type: 'string' },
        ...syncTimestamps,
      ],
    }),
    tableSchema({
      name: 'orders',
      columns: [
        { name: 'total', type: 'number' },
        { name: 'opened_at', type: 'number' },
        { name: 'customer_name', type: 'string', isOptional: true },
        { name: 'is_open', type: 'boolean', isIndexed: true },
        { name: 'establishment_id', type: 'string', isIndexed: true },
        { name: 'seller_id', type: 'string', isIndexed: true },
        ...syncTimestamps,
      ],
    }),
    tableSchema({
      name: 'order_items',
      columns: [
        { name: 'quantity', type: 'number' },
        { name: 'status', type: 'string' },
        { name: 'order_id', type: 'string', isIndexed: true },
        { name: 'product_id', type: 'string', isIndexed: true },
        { name: 'unit_price_at_order', type: 'number' },
        ...syncTimestamps,
      ],
    }),
    tableSchema({
      name: 'sales',
      columns: [
        { name: 'total', type: 'number' },
        { name: 'sold_at', type: 'number' },
        { name: 'customer_name', type: 'string', isOptional: true },
        { name: 'created_by_name', type: 'string', isOptional: true },
        { name: 'is_cancelled', type: 'boolean' },
        { name: 'establishment_id', type: 'string', isIndexed: true },
        { name: 'seller_id', type: 'string', isIndexed: true },
        { name: 'order_id', type: 'string', isOptional: true, isIndexed: true },
        ...syncTimestamps,
      ],
    }),
    tableSchema({
      name: 'sale_items',
      columns: [
        { name: 'quantity', type: 'number' },
        { name: 'sale_id', type: 'string', isIndexed: true },
        { name: 'product_id', type: 'string', isIndexed: true },
        { name: 'unit_price_at_sale', type: 'number' },
        ...syncTimestamps,
      ],
    }),
    tableSchema({
      name: 'print_logs',
      columns: [
        { name: 'device_id', type: 'string' },
        { name: 'printed_at', type: 'number' },
        { name: 'establishment_id', type: 'string', isIndexed: true },
        ...syncTimestamps,
      ],
    }),
    tableSchema({
      name: 'users',
      columns: [
        { name: 'name', type: 'string' },
        { name: 'email', type: 'string', isOptional: true },
        { name: 'establishment_id', type: 'string', isIndexed: true },
        { name: 'establishment_name', type: 'string', isOptional: true },
        { name: 'role', type: 'string', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'printers',
      columns: [
        { name: 'uuid', type: 'string' },
        { name: 'name', type: 'string' },
      ],
    }),
  ],
});
