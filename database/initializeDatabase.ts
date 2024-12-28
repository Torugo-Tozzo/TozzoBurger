import { type SQLiteDatabase } from "expo-sqlite"

export async function initializeDatabase(database: SQLiteDatabase) {

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS TB_PRODUTOS (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      tipoProdutoId INTEGER NULL,
      preco REAL NOT NULL,
      origemProdutoId INTEGER NULL,
      ingredientes TEXT NULL
    );
  `)

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS TB_TP_PRODUTO (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      descricao TEXT NOT NULL
    );
  `)

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS TB_VENDAS (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      total REAL NOT NULL,
      horario TEXT NOT NULL,
      cliente TEXT NULL
    );
  `)

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS RL_VENDA_PRODUTO (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendaId INTEGER NOT NULL,
      produtoId INTEGER NOT NULL,
      quantidade INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (vendaId) REFERENCES TB_VENDAS (id),
      FOREIGN KEY (produtoId) REFERENCES TB_PRODUTOS (id)
    );
  `)

  await database.execAsync(`
    CREATE TABLE IF NOT EXISTS TB_IMPRESSORAS (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid TEXT NOT NULL,
      nome TEXT NOT NULL
    );
  `);

  await seedTipoProduto(database);
}

async function seedTipoProduto(database: SQLiteDatabase) {
  const tipos = [
    { id: 1, descricao: "Industrial" },
    { id: 2, descricao: "Artesanal" },
    { id: 3, descricao: "Frango" },
    { id: 4, descricao: "HotDog" },
    { id: 5, descricao: "Bebida" },
    { id: 6, descricao: "Batata Frita" },
    { id: 7, descricao: "Adicional" },
    { id: 8, descricao: "Outro" }
  ];

  for (const tipo of tipos) {
    await database.execAsync(`
      INSERT OR IGNORE INTO TB_TP_PRODUTO (id, descricao)
      VALUES (${tipo.id}, '${tipo.descricao}');
    `);
  }
}

async function seedProdutos(database: SQLiteDatabase) {
  const produtos = [
    { id: 1, nome: "Produto A", tipoProdutoId: 1, preco: 10.0, origemProdutoId: null },
    { id: 2, nome: "Produto B", tipoProdutoId: 2, preco: 15.0, origemProdutoId: null },
    { id: 3, nome: "Produto C", tipoProdutoId: 3, preco: 20.0, origemProdutoId: null },
    { id: 4, nome: "Produto D", tipoProdutoId: 4, preco: 25.0, origemProdutoId: null },
    // Adicione mais produtos conforme necessário
  ];

  for (const produto of produtos) {
    await database.execAsync(`
      INSERT OR IGNORE INTO TB_PRODUTOS (id, nome, tipoProdutoId, preco, origemProdutoId)
      VALUES (${produto.id}, '${produto.nome}', ${produto.tipoProdutoId}, ${produto.preco}, ${produto.origemProdutoId ?? 'NULL'});
    `);
  }
}
