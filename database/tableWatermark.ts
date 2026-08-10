export type Table = 'produtos' | 'pedidos' | 'vendas';

const changedAt: Record<Table, number> = {
  produtos: 0,
  pedidos: 0,
  vendas: 0,
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
