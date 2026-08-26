import { type SQLiteDatabase } from "expo-sqlite"

export async function seedProdutosPadrao(database: SQLiteDatabase) {
    const produtos = [
        { id: 1, name: "X-Tudo", productTypeId: 1, price: 24, sourceProductId: null, ingredients: "Hamburger, presunto, mussarela, bacon, ovo, alface, tomate, salsicha, molho especial e batata palha." },
        { id: 2, name: "Top Burguer", productTypeId: 1, price: 26, sourceProductId: null, ingredients: "2x hambúrgueres, presunto, mussarela, bacon, ovo, alface, tomate, salsicha, molho especial e batata palha." },
        { id: 3, name: "Salada Burguer", productTypeId: 1, price: 17, sourceProductId: null, ingredients: "Hambúrguer, mussarela, alface, tomate e molho especial." },
        { id: 4, name: "Bacon Burguer", productTypeId: 1, price: 22, sourceProductId: null, ingredients: "Hambúrguer, presunto, mussarela, bacon, alface, tomate, molho especial." },
        { id: 5, name: "X-Burguer", productTypeId: 1, price: 15, sourceProductId: null, ingredients: "Hambúrguer, mussarela e molho especial." },
        { id: 6, name: "Cheddar Burguer", productTypeId: 1, price: 19, sourceProductId: null, ingredients: "Hambúrguer, cheddar e molho especial." },
        { id: 7, name: "Pancadão Burguer", productTypeId: 1, price: 32, sourceProductId: null, ingredients: "2x hambúrgueres, 2x presunto, 2x mussarela, 2x bacon, 2x ovo, alface, tomate, 2x salsicha, molho especial e batata palha." },
        { id: 8, name: "Frango-Tudo", productTypeId: 3, price: 26, sourceProductId: null, ingredients: "Filé de frango, presunto, mussarela, bacon, ovo, alface, tomate, salsicha, molho especial e batata palha." },
        { id: 9, name: "Top Frango", productTypeId: 3, price: 28, sourceProductId: null, ingredients: "2x filé de frango, presunto, mussarela, bacon, ovo, alface, tomate, salsicha, molho especial e batata palha." },
        { id: 10, name: "Frango Salada", productTypeId: 3, price: 20, sourceProductId: null, ingredients: "Filé de frango, mussarela, alface, tomate e molho especial." },
        { id: 11, name: "Frango Bacon", productTypeId: 3, price: 24, sourceProductId: null, ingredients: "Filé de frango, mussarela, presunto, bacon, alface, tomate e molho especial." },
        { id: 12, name: "X-Frango", productTypeId: 3, price: 19, sourceProductId: null, ingredients: "Filé de frango, mussarela e molho especial." },
        { id: 13, name: "Cheddar Frango", productTypeId: 3, price: 20, sourceProductId: null, ingredients: "Filé de frango, cheddar e molho especial." },
        { id: 14, name: "Bacon Artesanal", productTypeId: 2, price: 28, sourceProductId: null, ingredients: "Hambúrguer artesanal 150g, Cheddar, Bacon, Cebola caramelizada, Alface, Tomate, Molho de alho." },
        { id: 15, name: "Basic Artesanal", productTypeId: 2, price: 23, sourceProductId: null, ingredients: "Hambúrguer artesanal 150g, Bacon, Queijo, Cebola caramelizada, Molho de alho." },
        { id: 16, name: "300 Duplo Artesanal", productTypeId: 2, price: 35, sourceProductId: null, ingredients: "2 Hambúrgueres artesanais 150g, Bacon, Queijo, Cebola caramelizada, Molho de alho." },
        { id: 17, name: "Burger Artesanal", productTypeId: 2, price: 25, sourceProductId: null, ingredients: "Hambúrguer artesanal 150g, Bacon, Queijo, Alface, Tomate, Mostarda com mel." },
        { id: 18, name: "Colombiano Artesanal", productTypeId: 2, price: 28, sourceProductId: null, ingredients: "Hambúrguer artesanal 150g, Bacon, Queijo, Alface, Tomate, Batata palha, Ovo, Mostarda com mel." },
        { id: 19, name: "Basic Salada Artesanal", productTypeId: 2, price: 25, sourceProductId: null, ingredients: "Hambúrguer artesanal 150g, Queijo, Alface, Tomate, Cebola caramelizada." },
        { id: 20, name: "Picante Artesanal", productTypeId: 2, price: 28, sourceProductId: null, ingredients: "Hambúrguer artesanal 150g, Queijo, Bacon, Alface, Tomate, Molho de alho, Ovo, Pimenta." },
        { id: 21, name: "Catupiry Artesanal", productTypeId: 2, price: 28, sourceProductId: null, ingredients: "Hambúrguer artesanal 150g, Bacon, Rúcula, Catupiry, Molho de alho." },
        { id: 22, name: "Barbecue Artesanal", productTypeId: 2, price: 30, sourceProductId: null, ingredients: "Hambúrguer artesanal 150g, Bacon, Queijo, Onion rings, Molho barbecue." },
        { id: 23, name: "Dú Chef Artesanal", productTypeId: 2, price: 37, sourceProductId: null, ingredients: "2 Hambúrgueres artesanais 150g, Bacon, Cheddar, Cebola caramelizada, Rúcula, Creme de alho." },
        { id: 24, name: "Meia Porção", productTypeId: 6, price: 15, sourceProductId: null, ingredients: null },
        { id: 25, name: "Meia com Queijo", productTypeId: 6, price: 18, sourceProductId: null, ingredients: null },
        { id: 26, name: "Meia com Queijo e Bacon", productTypeId: 6, price: 23, sourceProductId: null, ingredients: null },
        { id: 27, name: "Porção Inteira", productTypeId: 6, price: 28, sourceProductId: null, ingredients: null },
        { id: 28, name: "Inteira com Queijo", productTypeId: 6, price: 32, sourceProductId: null, ingredients: null },
        { id: 29, name: "Meia Porção", productTypeId: 6, price: 36, sourceProductId: null, ingredients: null },
        { id: 30, name: "Hot Dog Basic", productTypeId: 4, price: 12, sourceProductId: null, ingredients: "Salsicha, molho especial, batata palha, ketchup, maionese e mostarda." },
        { id: 31, name: "Hot Dog Completo", productTypeId: 4, price: 14, sourceProductId: null, ingredients: "Salsicha, molho especial, batata palha, ketchup, maionese, mostarda, alface e milho." },
        { id: 32, name: "Hot Dog Duplo", productTypeId: 4, price: 17, sourceProductId: null, ingredients: "2 salsichas, molho especial, batata palha, ketchup, maionese, mostarda, alface e milho." },
        { id: 33, name: "Hot Dog Bacon", productTypeId: 4, price: 19, sourceProductId: null, ingredients: "Salsicha, molho especial, batata palha, ketchup, maionese, mostarda, alface, milho e bacon." },
        { id: 34, name: "Império", productTypeId: 5, price: 5, sourceProductId: null, ingredients: null },
        { id: 35, name: "Brahma", productTypeId: 5, price: 5, sourceProductId: null, ingredients: null },
        { id: 36, name: "Heineken Lata", productTypeId: 5, price: 8, sourceProductId: null, ingredients: null },
        { id: 37, name: "Amstel", productTypeId: 5, price: 5, sourceProductId: null, ingredients: null },
        { id: 38, name: "Suco Life", productTypeId: 5, price: 6, sourceProductId: null, ingredients: null },
        { id: 39, name: "H2O", productTypeId: 5, price: 6, sourceProductId: null, ingredients: null },
        { id: 40, name: "Coca Lata", productTypeId: 5, price: 5, sourceProductId: null, ingredients: null },
        { id: 41, name: "Coca Litro", productTypeId: 5, price: 8, sourceProductId: null, ingredients: null },
        { id: 42, name: "Coca 2 Litros", productTypeId: 5, price: 12, sourceProductId: null, ingredients: null },
        { id: 43, name: "Coca Zero", productTypeId: 5, price: 5, sourceProductId: null, ingredients: null },
        { id: 44, name: "Guaraná Lata", productTypeId: 5, price: 5, sourceProductId: null, ingredients: null },
        { id: 45, name: "Guaraná Litro", productTypeId: 5, price: 8, sourceProductId: null, ingredients: null },
        { id: 46, name: "Água sem Gás", productTypeId: 5, price: 3, sourceProductId: null, ingredients: null },
        { id: 47, name: "Água com Gás", productTypeId: 5, price: 3.5, sourceProductId: null, ingredients: null },
        { id: 48, name: "Cebola Caramelizada", productTypeId: 7, price: 4, sourceProductId: null },
        { id: 49, name: "Ovo Frito", productTypeId: 7, price: 2, sourceProductId: null },
        { id: 50, name: "Cheddar", productTypeId: 7, price: 4, sourceProductId: null },
        { id: 51, name: "Catupiry", productTypeId: 7, price: 4, sourceProductId: null },
        { id: 52, name: "Bacon", productTypeId: 7, price: 4, sourceProductId: null },
        { id: 53, name: "Onion Rings", productTypeId: 7, price: 5, sourceProductId: null }
        // Adicione mais produtos conforme necessário
    ];
    for (const produto of produtos) {
        await database.execAsync(`
      INSERT OR IGNORE INTO TB_PRODUCTS (id, name, productTypeId, price, sourceProductId, ingredients)
      VALUES (${produto.id}, '${produto.name}', ${produto.productTypeId}, ${produto.price}, ${produto.sourceProductId ?? 'NULL'}, ${produto.ingredients ? `'${produto.ingredients}'` : 'NULL'});
    `);
    }
}