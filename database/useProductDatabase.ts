import { useSQLiteContext } from "expo-sqlite"

export type ProductDatabase = {
  id: number
  nome: string
  preco: number
  tipoProdutoId: number
  quantidade?: number | null
  origemProdutoId?: number | null
}

export function useProductDatabase() {
  const database = useSQLiteContext()

  async function create(data: Omit<ProductDatabase, "id">) {
    const statement = await database.prepareAsync(
      "INSERT INTO TB_PRODUTOS (nome, preco, tipoProdutoId, origemProdutoId) VALUES ($nome, $preco, $tipoProdutoId, $origemProdutoId)"
    )

    try {
      const result = await statement.executeAsync({
        $nome: data.nome,
        $preco: data.preco,
        $tipoProdutoId: data.tipoProdutoId,
        $origemProdutoId: data.origemProdutoId ?? null
      })

      const insertedRowId = result.lastInsertRowId.toLocaleString()

      return { insertedRowId }
    } catch (error) {
      throw error
    } finally {
      await statement.finalizeAsync()
    }
  }

  async function searchByName(name: string) {
    try {
      const query = "SELECT * FROM TB_PRODUTOS WHERE origemProdutoId IS NULL AND nome LIKE ?"

      const response = await database.getAllAsync<ProductDatabase>(
        query,
        `%${name}%`
      )

      return response
    } catch (error) {
      throw error
    }
  }

  async function update(data: ProductDatabase) {
    const statement = await database.prepareAsync(
      "UPDATE TB_PRODUTOS SET nome = $nome, preco = $preco, tipoProdutoId = $tipoProdutoId WHERE id = $id"
    )

    try {
      await statement.executeAsync({
        $id: data.id,
        $nome: data.nome,
        $preco: data.preco,
        $tipoProdutoId: data.tipoProdutoId
      })
    } catch (error) {
      throw error
    } finally {
      await statement.finalizeAsync()
    }
  }

  async function remove(id: number) {
    try {
      await database.execAsync("DELETE FROM TB_PRODUTOS WHERE id = " + id)
    } catch (error) {
      throw error
    }
  }

  async function show(id: number) {
    try {
      const query = "SELECT * FROM TB_PRODUTOS WHERE origemProdutoId IS NULL AND id = ?"

      const response = await database.getFirstAsync<ProductDatabase>(query, [
        id,
      ])

      return response
    } catch (error) {
      throw error
    }
  }

  async function getTipoProdutos() {
    try {
      const query = "SELECT id, descricao FROM TB_TP_PRODUTO WHERE origemProdutoId IS NULL"

      const response = await database.getAllAsync<{ id: number; descricao: string }>(
        query
      )

      return response
    } catch (error) {
      throw error
    }
  }

  async function filterByTipo(tipoProdutoId: number): Promise<ProductDatabase[]> {
    try {
      const query = "SELECT * FROM TB_PRODUTOS WHERE origemProdutoId IS NULL AND tipoProdutoId = ?"
  
      const response = await database.getAllAsync<ProductDatabase>(
        query,
        [tipoProdutoId]
      )
  
      return response
    } catch (error) {
      throw error
    }
  }

  async function searchOrigemProdutoId(produtoId: number) {
    try {
      const query = "SELECT * FROM TB_PRODUTO WHERE origemProdutoId = ?"

      const response = await database.getAllAsync<{ id: number; }>(
        query,
        [produtoId]
      )

      return response
    } catch (error) {
      throw error
    }
  }

  return { create, searchByName, update, remove, show, getTipoProdutos, filterByTipo, searchOrigemProdutoId }
}
