import { type SQLiteDatabase } from "expo-sqlite"

const SCHEMA_VERSION = 1006;

const TABLE_RENAMES = [
  ['TB_PRODUTOS', 'TB_PRODUCTS'],
  ['TB_TP_PRODUTO', 'TB_PRODUCT_TYPES'],
  ['TB_VENDAS', 'TB_SALES'],
  ['TB_PEDIDOS', 'TB_ORDERS'],
  ['RL_VENDA_PRODUTO', 'RL_SALE_PRODUCT'],
  ['RL_PEDIDO_PRODUTO', 'RL_ORDER_PRODUCT'],
  ['TB_IMPRESSORAS', 'TB_PRINTERS'],
  ['TB_USUARIO', 'TB_USERS'],
  ['TB_ESTABELECIMENTO', 'TB_ESTABLISHMENTS'],
] as const;

const COLUMN_RENAMES = [
  ['TB_PRODUCTS', 'nome', 'name'],
  ['TB_PRODUCTS', 'tipoProdutoId', 'productTypeId'],
  ['TB_PRODUCTS', 'preco', 'price'],
  ['TB_PRODUCTS', 'origemProdutoId', 'sourceProductId'],
  ['TB_PRODUCTS', 'ingredientes', 'ingredients'],
  ['TB_PRODUCT_TYPES', 'descricao', 'description'],
  ['TB_PRODUCT_TYPES', 'ativo', 'isActive'],
  ['TB_SALES', 'horario', 'soldAt'],
  ['TB_SALES', 'cliente', 'customerName'],
  ['TB_SALES', 'excluida', 'isCancelled'],
  ['TB_SALES', 'origemVendaId', 'sourceSaleId'],
  ['TB_SALES', 'criado_por', 'createdBy'],
  ['TB_SALES', 'criado_por_nome', 'createdByName'],
  ['TB_ORDERS', 'horario', 'openedAt'],
  ['TB_ORDERS', 'cliente', 'customerName'],
  ['TB_ORDERS', 'origemPedidoId', 'sourceOrderId'],
  ['TB_ORDERS', 'criado_por', 'createdBy'],
  ['TB_ORDERS', 'criado_por_nome', 'createdByName'],
  ['RL_SALE_PRODUCT', 'vendaId', 'saleId'],
  ['RL_SALE_PRODUCT', 'produtoId', 'productId'],
  ['RL_SALE_PRODUCT', 'quantidade', 'quantity'],
  ['RL_ORDER_PRODUCT', 'pedidoId', 'orderId'],
  ['RL_ORDER_PRODUCT', 'produtoId', 'productId'],
  ['RL_ORDER_PRODUCT', 'quantidade', 'quantity'],
  ['TB_PRINTERS', 'nome', 'name'],
  ['TB_USERS', 'nome', 'name'],
  ['TB_USERS', 'estabelecimentoId', 'establishmentId'],
  ['TB_USERS', 'nomeEstabelecimento', 'establishmentName'],
  ['TB_ESTABLISHMENTS', 'nomeFantasia', 'tradeName'],
] as const;

async function tableExists(database: SQLiteDatabase, table: string): Promise<boolean> {
  const row = await database.getFirstAsync<{ name?: string }>(
    'SELECT name FROM sqlite_master WHERE type = ? AND name = ?',
    ['table', table],
  );
  return row?.name === table;
}

async function columnExists(database: SQLiteDatabase, table: string, column: string): Promise<boolean> {
  const rows = await database.getAllAsync<{ name?: string }>(`PRAGMA table_info(${table})`);
  return rows.some((row) => row.name === column);
}

async function renameLegacySchema(database: SQLiteDatabase) {
  const run = async () => {
    for (const [legacy, current] of TABLE_RENAMES) {
      const hasLegacy = await tableExists(database, legacy);
      const hasCurrent = await tableExists(database, current);
      if (hasLegacy && hasCurrent) {
        throw new Error(`Ambiguous SQLite migration: both ${legacy} and ${current} exist`);
      }
      if (hasLegacy) await database.execAsync(`ALTER TABLE ${legacy} RENAME TO ${current}`);
    }

    for (const [table, legacy, current] of COLUMN_RENAMES) {
      if (await columnExists(database, table, legacy)) {
        if (await columnExists(database, table, current)) {
          throw new Error(`Ambiguous SQLite migration: both ${table}.${legacy} and ${table}.${current} exist`);
        }
        await database.execAsync(`ALTER TABLE ${table} RENAME COLUMN ${legacy} TO ${current}`);
      }
    }

    if (await tableExists(database, 'TB_SCHEMA')) {
      if (await columnExists(database, 'TB_SCHEMA', 'estabelecimentoId')) {
        await database.execAsync('ALTER TABLE TB_SCHEMA RENAME COLUMN estabelecimentoId TO establishmentId');
      }
      if (await columnExists(database, 'TB_SCHEMA', 'usuarioId')) {
        await database.execAsync('ALTER TABLE TB_SCHEMA RENAME COLUMN usuarioId TO userId');
      }
      if (await columnExists(database, 'TB_SCHEMA', 'sincronizacaoAutomatica')) {
        await database.execAsync('ALTER TABLE TB_SCHEMA RENAME COLUMN sincronizacaoAutomatica TO automaticSync');
      }
    }

    if (await tableExists(database, 'TB_USERS')) {
      await database.execAsync("UPDATE TB_USERS SET role = 'OWNER' WHERE role = 'DONO'");
      await database.execAsync("UPDATE TB_USERS SET role = 'MANAGER' WHERE role = 'GERENTE'");
      await database.execAsync("UPDATE TB_USERS SET role = 'EMPLOYEE' WHERE role = 'FUNCIONARIO'");
      await database.execAsync("UPDATE TB_USERS SET role = 'CUSTOMER' WHERE role = 'CLIENTE'");
    }
    if (await tableExists(database, 'TB_ORDERS')) {
      await database.execAsync("UPDATE TB_ORDERS SET status = 'OPEN' WHERE status = 'ABERTO'");
      await database.execAsync("UPDATE TB_ORDERS SET status = 'IN_PREPARATION' WHERE status = 'EM_PREPARO'");
      await database.execAsync("UPDATE TB_ORDERS SET status = 'DELIVERING' WHERE status = 'ENTREGANDO'");
      await database.execAsync("UPDATE TB_ORDERS SET status = 'CLOSED' WHERE status = 'FECHADO'");
    }
  };

  if (typeof database.withTransactionAsync === 'function') {
    await database.withTransactionAsync(run);
  } else {
    await run();
  }
}

export async function initializeDatabase(database: SQLiteDatabase) {
  let dbVersion = 0;

  try {
    const row = await database.getFirstAsync<{
      version?: number;
      establishmentId?: number | null;
      userId?: number | null;
      automaticSync?: number | boolean | null;
    }>(`SELECT version, establishmentId, userId, automaticSync FROM TB_SCHEMA LIMIT 1`);
    if (row && typeof row.version !== 'undefined') dbVersion = Number(row.version) || 0;
  } catch (err) {
    dbVersion = 0;
  }

  // Only run initialization/migrations if code schema version is newer than DB
  if (dbVersion >= SCHEMA_VERSION) {
    return;
  }

  await renameLegacySchema(database);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS TB_PRODUCTS (
      id VARCHAR(36) PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      productTypeId INTEGER NULL,
      price REAL NOT NULL,
      sourceProductId VARCHAR(36) NULL,
      ingredients TEXT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER NULL,
      sync_status TEXT DEFAULT 'synced'
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS TB_PRODUCT_TYPES (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      cor TEXT NOT NULL DEFAULT '#9E9E9E',
      isActive BOOLEAN NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER NULL,
      sync_status TEXT DEFAULT 'synced'
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS TB_SALES (
      id VARCHAR(36) PRIMARY KEY NOT NULL,
      total REAL NOT NULL,
      soldAt TEXT NOT NULL,
      customerName TEXT NULL,
      isCancelled BOOLEAN NULL,
      sourceSaleId VARCHAR(36) NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER NULL,
      sync_status TEXT DEFAULT 'synced',
      createdBy TEXT NULL,
      createdByName TEXT NULL
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS TB_ORDERS (
      id VARCHAR(36) PRIMARY KEY NOT NULL,
      total REAL NOT NULL,
      openedAt TEXT NOT NULL,
      customerName TEXT NULL,
      status TEXT NOT NULL,
      sourceOrderId VARCHAR(36) NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER NULL,
      sync_status TEXT DEFAULT 'synced',
      createdBy TEXT NULL,
      createdByName TEXT NULL
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS RL_ORDER_PRODUCT (
      id VARCHAR(36) PRIMARY KEY NOT NULL,
      orderId VARCHAR(36) NOT NULL,
      productId VARCHAR(36) NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (orderId) REFERENCES TB_ORDERS (id) ON DELETE CASCADE,
      FOREIGN KEY (productId) REFERENCES TB_PRODUCTS (id) ON DELETE CASCADE
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS RL_SALE_PRODUCT (
      id VARCHAR(36) PRIMARY KEY NOT NULL,
      saleId VARCHAR(36) NOT NULL,
      productId VARCHAR(36) NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (saleId) REFERENCES TB_SALES (id) ON DELETE CASCADE,
      FOREIGN KEY (productId) REFERENCES TB_PRODUCTS (id) ON DELETE CASCADE
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS TB_PRINTERS (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL,
      name TEXT NOT NULL
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS TB_USERS (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      establishmentId INTEGER NOT NULL,
      establishmentName TEXT NULL,
      role TEXT NULL DEFAULT 'EMPLOYEE'
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS TB_ESTABLISHMENTS (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tradeName TEXT NOT NULL
    );
  `);

  await seedProductType(database);

  try {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS TB_SCHEMA (
        version INTEGER NOT NULL,
        establishmentId INTEGER NULL,
        userId INTEGER NULL,
        automaticSync BOOLEAN NOT NULL DEFAULT 0,
        lastSyncAt INTEGER NULL
    );`);

    const existing = await database.getFirstAsync<{
      version?: number;
      establishmentId?: number | null;
      userId?: number | null;
      automaticSync?: number | boolean | null;
    }>(`SELECT version, establishmentId, userId, automaticSync FROM TB_SCHEMA LIMIT 1`).catch(() => null);

    if (existing && typeof existing.version !== 'undefined') {
      await database.execAsync(`UPDATE TB_SCHEMA SET version = ${SCHEMA_VERSION};`);
      try {
        await database.execAsync(`ALTER TABLE TB_SCHEMA ADD COLUMN lastSyncAt INTEGER NULL;`);
      } catch (err) {
        // ignore if column already exists
      }
      try {
        await database.execAsync(`ALTER TABLE TB_USERS ADD COLUMN role TEXT NULL DEFAULT 'EMPLOYEE';`);
      } catch (err) {
        // ignore if column already exists
      }
      try {
        await database.execAsync(`ALTER TABLE TB_ORDERS ADD COLUMN createdBy TEXT NULL;`);
      } catch (err) {
        // ignore if column already exists
      }
      try {
        await database.execAsync(`ALTER TABLE TB_SALES ADD COLUMN createdBy TEXT NULL;`);
      } catch (err) {
        // ignore if column already exists
      }
      try {
        await database.execAsync(`ALTER TABLE TB_ORDERS ADD COLUMN createdByName TEXT NULL;`);
      } catch (err) {
        // ignore if column already exists
      }
      try {
        await database.execAsync(`ALTER TABLE TB_SALES ADD COLUMN createdByName TEXT NULL;`);
      } catch (err) {
        // ignore if column already exists
      }
    } else {
      await database.execAsync(`INSERT INTO TB_SCHEMA (version, establishmentId, userId, automaticSync, lastSyncAt) VALUES (${SCHEMA_VERSION}, NULL, NULL, 0, NULL);`);
    }
  } catch (err) {
    console.warn('Failed to write TB_SCHEMA version:', err);
  }
}

async function seedProductType(database: SQLiteDatabase) {
  const tipos = [
    { id: 1, description: "Hambúrguer", cor: "#2f84d3ff" },
    { id: 2, description: "Hambúrguer Artesanal", cor: "#4ba04bff" },
    { id: 3, description: "Frango", cor: "#FFA000" },
    { id: 4, description: "HotDog", cor: "#FF7043" },
    { id: 5, description: "Bebida", cor: "#d21919ff" },
    { id: 6, description: "Batata Frita", cor: "#FBC02D" },
    { id: 7, description: "Adicional", cor: "#7B1FA2" },
    { id: 8, description: "Outro", cor: "#9E9E9E" },
    { id: 9, description: "Pizza", cor: "#E64A19" },
    { id: 10, description: "Sushi", cor: "#00695C" },
    { id: 11, description: "Prato Feito", cor: "#00897B" },
    { id: 12, description: "Salgado", cor: "#8D6E63" },
    { id: 13, description: "Doce", cor: "#F06292" },
    { id: 14, description: "Café", cor: "#5D4037" },
    { id: 15, description: "Porção", cor: "#FF8A65" },
    { id: 16, description: "Pastel", cor: "#FFB74D" },
    { id: 17, description: "Culinária Asiática", cor: "#AFB42B" },
    { id: 18, description: "Vegetariano", cor: "#388E3C" },
    { id: 19, description: "Combo", cor: "#1976D2" },
    { id: 20, description: "Sopa", cor: "#4FC3F7" },
    { id: 21, description: "Salada", cor: "#66BB6A" },
    { id: 22, description: "Sorvete", cor: "#BA68C8" },
    { id: 23, description: "Açaí", cor: "#5E35B1" }
  ];

  for (const tipo of tipos) {
    await database.runAsync(
      'INSERT OR IGNORE INTO TB_PRODUCT_TYPES (id, description, color, updated_at, sync_status) VALUES (?, ?, ?, ?, ?)',
      [tipo.id, tipo.description, tipo.cor, Date.now(), 'synced']
    );
  }
}

export { seedProductType };
/** @deprecated Use seedProductType. */
export const seedTipoProduto = seedProductType;
