export type Table = 'products' | 'orders' | 'sales';

const changedAt: Record<Table, number> = {
  products: 0,
  orders: 0,
  sales: 0,
};

/**
 * Math.max(Date.now(), changedAt[table] + 1) garante estritamente crescente
 * mesmo se duas mudancas da mesma tabela carem no mesmo milissegundo.
 */
export function markChanged(table: Table): void {
  changedAt[table] = Math.max(Date.now(), changedAt[table] + 1);
}

export function getChangedAt(table: Table): number {
  return changedAt[table];
}
