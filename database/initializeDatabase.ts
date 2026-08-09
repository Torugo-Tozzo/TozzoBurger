import { type SQLiteDatabase } from "expo-sqlite"

export async function initializeDatabase(database: SQLiteDatabase) {
  const SCHEMA_VERSION = 1005; //when update the DB schema, increment this value
  let dbVersion = 0;

  try {
    const row = await database.getFirstAsync<{
      version?: number;
      estabelecimentoId?: number | null;
      usuarioId?: number | null;
      sincronizacaoAutomatica?: number | boolean | null;
    }>(`SELECT version, estabelecimentoId, usuarioId, sincronizacaoAutomatica FROM TB_SCHEMA LIMIT 1`);
    if (row && typeof row.version !== 'undefined') dbVersion = Number(row.version) || 0;
  } catch (err) {
    dbVersion = 0;
  }

  // Only run initialization/migrations if code schema version is newer than DB
  if (dbVersion >= SCHEMA_VERSION) {
    return;
  }

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS TB_PRODUTOS (
      id VARCHAR(36) PRIMARY KEY NOT NULL,
      nome TEXT NOT NULL,
      tipoProdutoId INTEGER NULL,
      preco REAL NOT NULL,
      origemProdutoId VARCHAR(36) NULL,
      ingredientes TEXT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER NULL,
      sync_status TEXT DEFAULT 'synced'
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS TB_TP_PRODUTO (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      descricao TEXT NOT NULL,
      cor TEXT NOT NULL DEFAULT '#9E9E9E',
      ativo BOOLEAN NOT NULL DEFAULT 1,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER NULL,
      sync_status TEXT DEFAULT 'synced'
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS TB_VENDAS (
      id VARCHAR(36) PRIMARY KEY NOT NULL,
      total REAL NOT NULL,
      horario TEXT NOT NULL,
      cliente TEXT NULL,
      excluida BOOLEAN NULL,
      origemVendaId VARCHAR(36) NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER NULL,
      sync_status TEXT DEFAULT 'synced',
      criado_por TEXT NULL,
      criado_por_nome TEXT NULL
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS TB_PEDIDOS (
      id VARCHAR(36) PRIMARY KEY NOT NULL,
      total REAL NOT NULL,
      horario TEXT NOT NULL,
      cliente TEXT NULL,
      status TEXT NOT NULL,
      origemPedidoId VARCHAR(36) NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER NULL,
      sync_status TEXT DEFAULT 'synced',
      criado_por TEXT NULL,
      criado_por_nome TEXT NULL
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS RL_PEDIDO_PRODUTO (
      id VARCHAR(36) PRIMARY KEY NOT NULL,
      pedidoId VARCHAR(36) NOT NULL,
      produtoId VARCHAR(36) NOT NULL,
      quantidade INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (pedidoId) REFERENCES TB_PEDIDOS (id) ON DELETE CASCADE,
      FOREIGN KEY (produtoId) REFERENCES TB_PRODUTOS (id) ON DELETE CASCADE
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS RL_VENDA_PRODUTO (
      id VARCHAR(36) PRIMARY KEY NOT NULL,
      vendaId VARCHAR(36) NOT NULL,
      produtoId VARCHAR(36) NOT NULL,
      quantidade INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (vendaId) REFERENCES TB_VENDAS (id) ON DELETE CASCADE,
      FOREIGN KEY (produtoId) REFERENCES TB_PRODUTOS (id) ON DELETE CASCADE
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS TB_IMPRESSORAS (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL,
      nome TEXT NOT NULL
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS TB_USUARIO (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      email TEXT UNIQUE,
      estabelecimentoId INTEGER NOT NULL,
      nomeEstabelecimento TEXT NULL,
      role TEXT NULL DEFAULT 'FUNCIONARIO'
    );
  `);

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS TB_ESTABELECIMENTO (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nomeFantasia TEXT NOT NULL
    );
  `);

  await seedTipoProduto(database);

  try {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS TB_SCHEMA (
        version INTEGER NOT NULL,
        estabelecimentoId INTEGER NULL,
        usuarioId INTEGER NULL,
        sincronizacaoAutomatica BOOLEAN NOT NULL DEFAULT 0,
        lastSyncAt INTEGER NULL
    );`);

    const existing = await database.getFirstAsync<{
      version?: number;
      estabelecimentoId?: number | null;
      usuarioId?: number | null;
      sincronizacaoAutomatica?: number | boolean | null;
    }>(`SELECT version, estabelecimentoId, usuarioId, sincronizacaoAutomatica FROM TB_SCHEMA LIMIT 1`).catch(() => null);

    if (existing && typeof existing.version !== 'undefined') {
      await database.execAsync(`UPDATE TB_SCHEMA SET version = ${SCHEMA_VERSION};`);
      try {
        await database.execAsync(`ALTER TABLE TB_SCHEMA ADD COLUMN lastSyncAt INTEGER NULL;`);
      } catch (err) {
        // ignore if column already exists
      }
      try {
        await database.execAsync(`ALTER TABLE TB_USUARIO ADD COLUMN role TEXT NULL DEFAULT 'FUNCIONARIO';`);
      } catch (err) {
        // ignore if column already exists
      }
      try {
        await database.execAsync(`ALTER TABLE TB_PEDIDOS ADD COLUMN criado_por TEXT NULL;`);
      } catch (err) {
        // ignore if column already exists
      }
      try {
        await database.execAsync(`ALTER TABLE TB_VENDAS ADD COLUMN criado_por TEXT NULL;`);
      } catch (err) {
        // ignore if column already exists
      }
      try {
        await database.execAsync(`ALTER TABLE TB_PEDIDOS ADD COLUMN criado_por_nome TEXT NULL;`);
      } catch (err) {
        // ignore if column already exists
      }
      try {
        await database.execAsync(`ALTER TABLE TB_VENDAS ADD COLUMN criado_por_nome TEXT NULL;`);
      } catch (err) {
        // ignore if column already exists
      }
    } else {
      await database.execAsync(`INSERT INTO TB_SCHEMA (version, estabelecimentoId, usuarioId, sincronizacaoAutomatica, lastSyncAt) VALUES (${SCHEMA_VERSION}, NULL, NULL, 0, NULL);`);
    }
  } catch (err) {
    console.warn('Failed to write TB_SCHEMA version:', err);
  }
}

async function seedTipoProduto(database: SQLiteDatabase) {
  const tipos = [
    { id: 1, descricao: "Hambúrguer", cor: "#2f84d3ff" },
    { id: 2, descricao: "Hambúrguer Artesanal", cor: "#4ba04bff" },
    { id: 3, descricao: "Frango", cor: "#FFA000" },
    { id: 4, descricao: "HotDog", cor: "#FF7043" },
    { id: 5, descricao: "Bebida", cor: "#d21919ff" },
    { id: 6, descricao: "Batata Frita", cor: "#FBC02D" },
    { id: 7, descricao: "Adicional", cor: "#7B1FA2" },
    { id: 8, descricao: "Outro", cor: "#9E9E9E" },
    { id: 9, descricao: "Pizza", cor: "#E64A19" },
    { id: 10, descricao: "Sushi", cor: "#00695C" },
    { id: 11, descricao: "Prato Feito", cor: "#00897B" },
    { id: 12, descricao: "Salgado", cor: "#8D6E63" },
    { id: 13, descricao: "Doce", cor: "#F06292" },
    { id: 14, descricao: "Café", cor: "#5D4037" },
    { id: 15, descricao: "Porção", cor: "#FF8A65" },
    { id: 16, descricao: "Pastel", cor: "#FFB74D" },
    { id: 17, descricao: "Culinária Asiática", cor: "#AFB42B" },
    { id: 18, descricao: "Vegetariano", cor: "#388E3C" },
    { id: 19, descricao: "Combo", cor: "#1976D2" },
    { id: 20, descricao: "Sopa", cor: "#4FC3F7" },
    { id: 21, descricao: "Salada", cor: "#66BB6A" },
    { id: 22, descricao: "Sorvete", cor: "#BA68C8" },
    { id: 23, descricao: "Açaí", cor: "#5E35B1" }
  ];

  for (const tipo of tipos) {
    await database.runAsync(
      'INSERT OR IGNORE INTO TB_TP_PRODUTO (id, descricao, cor) VALUES (?, ?, ?)',
      [tipo.id, tipo.descricao, tipo.cor]
    );
  }
}

export { seedTipoProduto };