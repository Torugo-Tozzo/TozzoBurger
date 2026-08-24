import { initializeDatabase } from '../initializeDatabase';

type FakeTable = { columns: string[]; rows: Array<Record<string, unknown>> };

function createLegacyDatabase() {
  const tables: Record<string, FakeTable> = {
    TB_PRODUTOS: { columns: ['id', 'nome', 'tipoProdutoId', 'preco', 'origemProdutoId', 'ingredientes', 'updated_at', 'deleted_at', 'sync_status'], rows: [{ id: 'p1', nome: 'X-Salada', tipoProdutoId: 1, preco: 25, origemProdutoId: null, ingredientes: 'queijo', updated_at: 10, deleted_at: null, sync_status: 'pending' }] },
    TB_TP_PRODUTO: { columns: ['id', 'descricao', 'cor', 'ativo', 'updated_at', 'deleted_at', 'sync_status'], rows: [{ id: 1, descricao: 'Hambúrguer', cor: '#fff', ativo: 1, updated_at: 10, deleted_at: null, sync_status: 'synced' }] },
    TB_VENDAS: { columns: ['id', 'total', 'horario', 'cliente', 'excluida', 'origemVendaId', 'updated_at', 'deleted_at', 'sync_status', 'criado_por', 'criado_por_nome'], rows: [{ id: 's1', total: 25, horario: '2026-08-24T10:00:00.000Z', cliente: 'Ana', excluida: 0, origemVendaId: null, updated_at: 10, deleted_at: null, sync_status: 'pending', criado_por: 'u1', criado_por_nome: 'Caixa' }] },
    TB_PEDIDOS: { columns: ['id', 'total', 'horario', 'cliente', 'status', 'origemPedidoId', 'updated_at', 'deleted_at', 'sync_status', 'criado_por', 'criado_por_nome'], rows: [{ id: 'o1', total: 25, horario: '2026-08-24T10:00:00.000Z', cliente: 'Ana', status: 'ABERTO', origemPedidoId: null, updated_at: 10, deleted_at: null, sync_status: 'pending', criado_por: 'u1', criado_por_nome: 'Caixa' }] },
    RL_VENDA_PRODUTO: { columns: ['id', 'vendaId', 'produtoId', 'quantidade'], rows: [{ id: 'si1', vendaId: 's1', produtoId: 'p1', quantidade: 1 }] },
    RL_PEDIDO_PRODUTO: { columns: ['id', 'pedidoId', 'produtoId', 'quantidade'], rows: [{ id: 'oi1', pedidoId: 'o1', produtoId: 'p1', quantidade: 1 }] },
    TB_IMPRESSORAS: { columns: ['id', 'uuid', 'nome'], rows: [{ id: 1, uuid: 'printer-1', nome: 'Caixa' }] },
    TB_USUARIO: { columns: ['id', 'nome', 'email', 'estabelecimentoId', 'nomeEstabelecimento', 'role'], rows: [{ id: 1, nome: 'Dono', email: 'dono@example.test', estabelecimentoId: 7, nomeEstabelecimento: 'Trailer', role: 'DONO' }] },
    TB_ESTABELECIMENTO: { columns: ['id', 'nomeFantasia'], rows: [{ id: 7, nomeFantasia: 'Trailer' }] },
    TB_SCHEMA: { columns: ['version', 'estabelecimentoId', 'usuarioId', 'sincronizacaoAutomatica', 'lastSyncAt'], rows: [{ version: 1005, estabelecimentoId: 7, usuarioId: 1, sincronizacaoAutomatica: 0, lastSyncAt: 10 }] },
  };

  const database: any = {
    tables,
    async withTransactionAsync(callback: () => Promise<void>) { await callback(); },
    async getFirstAsync<T>(sql: string, params: unknown[] = []): Promise<T | null> {
      if (sql.includes('FROM TB_SCHEMA') && sql.includes('establishmentId')) {
        const schema = tables.TB_SCHEMA;
        if (!schema.columns.includes('establishmentId')) throw new Error('legacy schema columns');
        return schema.rows[0] as T;
      }
      if (sql.includes('sqlite_master')) {
        return (tables[String(params[1])] ? { name: String(params[1]) } : null) as T;
      }
      return null;
    },
    async getAllAsync<T>(sql: string): Promise<T[]> {
      const match = /PRAGMA table_info\(([^)]+)\)/.exec(sql);
      if (!match) return [];
      return tables[match[1]]?.columns.map((name) => ({ name })) as T[] ?? [];
    },
    async execAsync(sql: string) {
      let match = /^ALTER TABLE (\w+) RENAME TO (\w+)$/.exec(sql.trim());
      if (match) {
        tables[match[2]] = tables[match[1]];
        delete tables[match[1]];
        return;
      }
      match = /^ALTER TABLE (\w+) RENAME COLUMN (\w+) TO (\w+)$/.exec(sql.trim());
      if (match) {
        const table = tables[match[1]];
        const index = table.columns.indexOf(match[2]);
        if (index >= 0) table.columns[index] = match[3];
        for (const row of table.rows) {
          row[match[3]] = row[match[2]];
          delete row[match[2]];
        }
        return;
      }
      match = /^UPDATE (TB_USERS|TB_ORDERS) SET (role|status) = '([^']+)' WHERE \2 = '([^']+)'$/.exec(sql.trim());
      if (match) {
        for (const row of tables[match[1]].rows) if (row[match[2]] === match[4]) row[match[2]] = match[3];
        return;
      }
      match = /^UPDATE TB_SCHEMA SET version = (\d+);$/.exec(sql.trim());
      if (match) tables.TB_SCHEMA.rows[0].version = Number(match[1]);
      match = /^ALTER TABLE (\w+) ADD COLUMN (\w+)/.exec(sql.trim());
      if (match && tables[match[1]] && !tables[match[1]].columns.includes(match[2])) tables[match[1]].columns.push(match[2]);
    },
    async runAsync() {},
  };
  return database;
}

describe('initializeDatabase legacy SQLite upgrade', () => {
  it('renames tables/columns in place and preserves queued rows and machine values', async () => {
    const database = createLegacyDatabase();

    await initializeDatabase(database);

    expect(database.tables.TB_PRODUCTS.rows[0]).toMatchObject({ id: 'p1', name: 'X-Salada', price: 25, sync_status: 'pending' });
    expect(database.tables.TB_ORDERS.rows[0]).toMatchObject({ id: 'o1', openedAt: '2026-08-24T10:00:00.000Z', status: 'OPEN', createdBy: 'u1' });
    expect(database.tables.TB_SALES.rows[0]).toMatchObject({ id: 's1', soldAt: '2026-08-24T10:00:00.000Z', customerName: 'Ana', createdBy: 'u1' });
    expect(database.tables.RL_ORDER_PRODUCT.rows[0]).toMatchObject({ orderId: 'o1', productId: 'p1', quantity: 1 });
    expect(database.tables.TB_USERS.rows[0]).toMatchObject({ name: 'Dono', establishmentId: 7, role: 'OWNER' });
    expect(database.tables.TB_SCHEMA.rows[0]).toMatchObject({ version: 1006, establishmentId: 7, userId: 1 });
    expect(database.tables.TB_PRODUTOS).toBeUndefined();
    expect(database.tables.TB_PEDIDOS).toBeUndefined();

    await initializeDatabase(database);
    expect(database.tables.TB_PRODUCTS.rows).toHaveLength(1);
    expect(database.tables.TB_ORDERS.rows).toHaveLength(1);
  });
});
