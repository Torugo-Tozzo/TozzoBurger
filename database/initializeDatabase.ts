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
  await seedProdutosPadrao(database);
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

async function seedProdutosPadrao(database: SQLiteDatabase) {
  const produtos = [
    { id: 1, nome: "X-Tudo", tipoProdutoId: 1, preco: 24, origemProdutoId: null, ingredientes: "Hamburger, presunto, mussarela, bacon, ovo, alface, tomate, salsicha, molho especial e batata palha." },
    { id: 2, nome: "Top Burguer", tipoProdutoId: 1, preco: 26, origemProdutoId: null, ingredientes: "2x hambúrgueres, presunto, mussarela, bacon, ovo, alface, tomate, salsicha, molho especial e batata palha." },
    { id: 3, nome: "Salada Burguer", tipoProdutoId: 1, preco: 17, origemProdutoId: null, ingredientes: "Hambúrguer, mussarela, alface, tomate e molho especial." },
    { id: 4, nome: "Bacon Burguer", tipoProdutoId: 1, preco: 22, origemProdutoId: null, ingredientes: "Hambúrguer, presunto, mussarela, bacon, alface, tomate, molho especial." },
    { id: 5, nome: "X-Burguer", tipoProdutoId: 1, preco: 15, origemProdutoId: null, ingredientes: "Hambúrguer, mussarela e molho especial." },
    { id: 6, nome: "Cheddar Burguer", tipoProdutoId: 1, preco: 19, origemProdutoId: null, ingredientes: "Hambúrguer, cheddar e molho especial." },
    { id: 7, nome: "Pancadão Burguer", tipoProdutoId: 1, preco: 32, origemProdutoId: null, ingredientes: "2x hambúrgueres, 2x presunto, 2x mussarela, 2x bacon, 2x ovo, alface, tomate, 2x salsicha, molho especial e batata palha." },
    { id: 8, nome: "Frango-Tudo", tipoProdutoId: 3, preco: 26, origemProdutoId: null, ingredientes: "Filé de frango, presunto, mussarela, bacon, ovo, alface, tomate, salsicha, molho especial e batata palha." },
    { id: 9, nome: "Top Frango", tipoProdutoId: 3, preco: 28, origemProdutoId: null, ingredientes: "2x filé de frango, presunto, mussarela, bacon, ovo, alface, tomate, salsicha, molho especial e batata palha." },
    { id: 10, nome: "Frango Salada", tipoProdutoId: 3, preco: 20, origemProdutoId: null, ingredientes: "Filé de frango, mussarela, alface, tomate e molho especial." },
    { id: 11, nome: "Frango Bacon", tipoProdutoId: 3, preco: 24, origemProdutoId: null, ingredientes: "Filé de frango, mussarela, presunto, bacon, alface, tomate e molho especial." },
    { id: 12, nome: "X-Frango", tipoProdutoId: 3, preco: 19, origemProdutoId: null, ingredientes: "Filé de frango, mussarela e molho especial." },
    { id: 13, nome: "Cheddar Frango", tipoProdutoId: 3, preco: 20, origemProdutoId: null, ingredientes: "Filé de frango, cheddar e molho especial." },
    { id: 14, nome: "Bacon Artesanal", tipoProdutoId: 2, preco: 28, origemProdutoId: null, ingredientes: "Hambúrguer artesanal 150g, Cheddar, Bacon, Cebola caramelizada, Alface, Tomate, Molho de alho." },
    { id: 15, nome: "Basic Artesanal", tipoProdutoId: 2, preco: 23, origemProdutoId: null, ingredientes: "Hambúrguer artesanal 150g, Bacon, Queijo, Cebola caramelizada, Molho de alho." },
    { id: 16, nome: "300 Duplo Artesanal", tipoProdutoId: 2, preco: 35, origemProdutoId: null, ingredientes: "2 Hambúrgueres artesanais 150g, Bacon, Queijo, Cebola caramelizada, Molho de alho." },
    { id: 17, nome: "Burger Artesanal", tipoProdutoId: 2, preco: 25, origemProdutoId: null, ingredientes: "Hambúrguer artesanal 150g, Bacon, Queijo, Alface, Tomate, Mostarda com mel." },
    { id: 18, nome: "Colombiano Artesanal", tipoProdutoId: 2, preco: 28, origemProdutoId: null, ingredientes: "Hambúrguer artesanal 150g, Bacon, Queijo, Alface, Tomate, Batata palha, Ovo, Mostarda com mel." },
    { id: 19, nome: "Basic Salada Artesanal", tipoProdutoId: 2, preco: 25, origemProdutoId: null, ingredientes: "Hambúrguer artesanal 150g, Queijo, Alface, Tomate, Cebola caramelizada." },
    { id: 20, nome: "Picante Artesanal", tipoProdutoId: 2, preco: 28, origemProdutoId: null, ingredientes: "Hambúrguer artesanal 150g, Queijo, Bacon, Alface, Tomate, Molho de alho, Ovo, Pimenta." },
    { id: 21, nome: "Catupiry Artesanal", tipoProdutoId: 2, preco: 28, origemProdutoId: null, ingredientes: "Hambúrguer artesanal 150g, Bacon, Rúcula, Catupiry, Molho de alho." },
    { id: 22, nome: "Barbecue Artesanal", tipoProdutoId: 2, preco: 30, origemProdutoId: null, ingredientes: "Hambúrguer artesanal 150g, Bacon, Queijo, Onion rings, Molho barbecue." },
    { id: 23, nome: "Dú Chef Artesanal", tipoProdutoId: 2, preco: 37, origemProdutoId: null, ingredientes: "2 Hambúrgueres artesanais 150g, Bacon, Cheddar, Cebola caramelizada, Rúcula, Creme de alho." },
    { id: 24, nome: "Meia Porção", tipoProdutoId: 6, preco: 15, origemProdutoId: null, ingredientes: null },
    { id: 25, nome: "Meia com Queijo", tipoProdutoId: 6, preco: 18, origemProdutoId: null, ingredientes: null },
    { id: 26, nome: "Meia com Queijo e Bacon", tipoProdutoId: 6, preco: 23, origemProdutoId: null, ingredientes: null },
    { id: 27, nome: "Porção Inteira", tipoProdutoId: 6, preco: 28, origemProdutoId: null, ingredientes: null },
    { id: 28, nome: "Inteira com Queijo", tipoProdutoId: 6, preco: 32, origemProdutoId: null, ingredientes: null },
    { id: 29, nome: "Meia Porção", tipoProdutoId: 6, preco: 36, origemProdutoId: null, ingredientes: null },
    { id: 30, nome: "Hot Dog Basic", tipoProdutoId: 4, preco: 12, origemProdutoId: null, ingredientes: "Salsicha, molho especial, batata palha, ketchup, maionese e mostarda." },
    { id: 31, nome: "Hot Dog Completo", tipoProdutoId: 4, preco: 14, origemProdutoId: null, ingredientes: "Salsicha, molho especial, batata palha, ketchup, maionese, mostarda, alface e milho." },
    { id: 32, nome: "Hot Dog Duplo", tipoProdutoId: 4, preco: 17, origemProdutoId: null, ingredientes: "2 salsichas, molho especial, batata palha, ketchup, maionese, mostarda, alface e milho." },
    { id: 33, nome: "Hot Dog Bacon", tipoProdutoId: 4, preco: 19, origemProdutoId: null, ingredientes: "Salsicha, molho especial, batata palha, ketchup, maionese, mostarda, alface, milho e bacon." },
    { id: 34, nome: "Império", tipoProdutoId: 5, preco: 5, origemProdutoId: null, ingredientes: null },
    { id: 35, nome: "Brahma", tipoProdutoId: 5, preco: 5, origemProdutoId: null, ingredientes: null },
    { id: 36, nome: "Heineken Lata", tipoProdutoId: 5, preco: 8, origemProdutoId: null, ingredientes: null },
    { id: 37, nome: "Amstel", tipoProdutoId: 5, preco: 5, origemProdutoId: null, ingredientes: null },
    { id: 38, nome: "Suco Life", tipoProdutoId: 5, preco: 6, origemProdutoId: null, ingredientes: null },
    { id: 39, nome: "H2O", tipoProdutoId: 5, preco: 6, origemProdutoId: null, ingredientes: null },
    { id: 40, nome: "Coca Lata", tipoProdutoId: 5, preco: 5, origemProdutoId: null, ingredientes: null },
    { id: 41, nome: "Coca Litro", tipoProdutoId: 5, preco: 8, origemProdutoId: null, ingredientes: null },
    { id: 42, nome: "Coca 2 Litros", tipoProdutoId: 5, preco: 12, origemProdutoId: null, ingredientes: null },
    { id: 43, nome: "Coca Zero", tipoProdutoId: 5, preco: 5, origemProdutoId: null, ingredientes: null },
    { id: 44, nome: "Guaraná Lata", tipoProdutoId: 5, preco: 5, origemProdutoId: null, ingredientes: null },
    { id: 45, nome: "Guaraná Litro", tipoProdutoId: 5, preco: 8, origemProdutoId: null, ingredientes: null },
    { id: 46, nome: "Água sem Gás", tipoProdutoId: 5, preco: 3, origemProdutoId: null, ingredientes: null },
    { id: 47, nome: "Água com Gás", tipoProdutoId: 5, preco: 3.5, origemProdutoId: null, ingredientes: null },
    { id: 48, nome: "Cebola Caramelizada", tipoProdutoId: 7, preco: 4, origemProdutoId: null },
    { id: 49, nome: "Ovo Frito", tipoProdutoId: 7, preco: 2, origemProdutoId: null },
    { id: 50, nome: "Cheddar", tipoProdutoId: 7, preco: 4, origemProdutoId: null },
    { id: 51, nome: "Catupiry", tipoProdutoId: 7, preco: 4, origemProdutoId: null },
    { id: 52, nome: "Bacon", tipoProdutoId: 7, preco: 4, origemProdutoId: null },
    { id: 53, nome: "Onion Rings", tipoProdutoId: 7, preco: 5, origemProdutoId: null }
    // Adicione mais produtos conforme necessário
  ];

  for (const produto of produtos) {
    await database.execAsync(`
      INSERT OR IGNORE INTO TB_PRODUTOS (id, nome, tipoProdutoId, preco, origemProdutoId, ingredientes)
      VALUES (${produto.id}, '${produto.nome}', ${produto.tipoProdutoId}, ${produto.preco}, ${produto.origemProdutoId ?? 'NULL'}, ${produto.ingredientes ? `'${produto.ingredientes}'` : 'NULL'});
    `);
  }
}
