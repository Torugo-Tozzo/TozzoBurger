import { addColumns, schemaMigrations } from '@nozbe/watermelondb/Schema/migrations';

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
  ],
});
