import { addColumns, createTable, schemaMigrations } from '@nozbe/watermelondb/Schema/migrations';

export default schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        addColumns({
          table: 'sales',
          columns: [{ name: 'created_by_name', type: 'string', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 3,
      steps: [
        createTable({
          name: 'print_logs',
          columns: [
            { name: 'device_id', type: 'string' },
            { name: 'printed_at', type: 'number' },
            { name: 'establishment_id', type: 'string', isIndexed: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
  ],
});
