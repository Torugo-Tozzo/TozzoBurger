import { useSQLiteContext } from "expo-sqlite"
import { ProductDatabase } from "./types/Produto"
import { generateUUID } from "./utils/uuid"

export function useProductDatabase() {
  const database = useSQLiteContext()

  async function create(data: Omit<ProductDatabase, "id" | "updated_at">) {
    const statement = await database.prepareAsync(
      "INSERT INTO TB_PRODUTOS (id, nome, preco, tipoProdutoId, origemProdutoId, ingredientes, updated_at, sync_status) VALUES ($id, $nome, $preco, $tipoProdutoId, $origemProdutoId, $ingredientes, $updated_at, $sync_status)"
    )

    try {
      const id = generateUUID()
      const result = await statement.executeAsync({
        $id: id,
        $nome: data.nome,
        $preco: data.preco,
        $tipoProdutoId: data.tipoProdutoId,
        $origemProdutoId: data.origemProdutoId ?? null,
        $ingredientes: data.ingredientes ?? null,
        $updated_at: Date.now(),
        $sync_status: 'pending',
      })

        console.log('[db] produto criado', { id })

        return { id }
    } catch (error) {
      throw error
    } finally {
      await statement.finalizeAsync()
    }
  }

  async function createFromSync(data: ProductDatabase) {
    const statement = await database.prepareAsync(
      "INSERT INTO TB_PRODUTOS (id, nome, preco, tipoProdutoId, origemProdutoId, ingredientes, updated_at, sync_status) VALUES ($id, $nome, $preco, $tipoProdutoId, $origemProdutoId, $ingredientes, $updated_at, $sync_status)"
    )

    try {
      await statement.executeAsync({
        $id: data.id,
        $nome: data.nome,
        $preco: data.preco,
        $tipoProdutoId: data.tipoProdutoId,
        $origemProdutoId: data.origemProdutoId ?? null,
        $ingredientes: data.ingredientes ?? null,
        $updated_at: (data as any).updated_at ?? Date.now(),
        $sync_status: 'synced',
      })

      return { id: data.id }
    } catch (error) {
      throw error
    } finally {
      await statement.finalizeAsync()
    }
  }

  async function searchByName(name: string, limit?: number, offset?: number) {
    try {
      if (limit !== undefined) {
        const query = `SELECT P.* FROM TB_PRODUTOS P JOIN TB_TP_PRODUTO T ON P.tipoProdutoId = T.id WHERE P.deleted_at IS NULL AND T.ativo = 1 AND P.nome LIKE ? ORDER BY P.nome ASC LIMIT ? OFFSET ?`

        const response = await database.getAllAsync<ProductDatabase>(query, [`%${name}%`, limit, offset ?? 0])

        return response
      }

      const query = `SELECT P.* FROM TB_PRODUTOS P JOIN TB_TP_PRODUTO T ON P.tipoProdutoId = T.id WHERE P.deleted_at IS NULL AND T.ativo = 1 AND P.nome LIKE ?`

      const response = await database.getAllAsync<ProductDatabase>(query, `%${name}%`)

      return response
    } catch (error) {
      throw error
    }
  }

  async function update(data: Omit<ProductDatabase, "updated_at">) {
    const statement = await database.prepareAsync(
      "UPDATE TB_PRODUTOS SET nome = $nome, preco = $preco, tipoProdutoId = $tipoProdutoId, ingredientes = $ingredientes, updated_at = $updated_at, sync_status = $sync_status WHERE id = $id"
    )

    try {
      await statement.executeAsync({
        $id: data.id,
        $nome: data.nome,
        $preco: data.preco,
        $tipoProdutoId: data.tipoProdutoId,
        $ingredientes: data.ingredientes ?? null,
        $updated_at: Date.now(),
        $sync_status: 'pending',
      })
    } catch (error) {
      throw error
    } finally {
      await statement.finalizeAsync()
    }
  }

  async function remove(id: string) {
    try {
      const now = Date.now();
      await database.runAsync(
        'UPDATE TB_PRODUTOS SET deleted_at = ?, updated_at = ?, sync_status = ? WHERE id = ?',
        [now, now, 'pending', id]
      );
    } catch (error) {
      throw error
    }
  }

  async function show(id: string) {
    try {
      const query = "SELECT * FROM TB_PRODUTOS WHERE id = ? AND deleted_at IS NULL"

      const response = await database.getFirstAsync<ProductDatabase>(query, [
        id,
      ])

      return response
    } catch (error) {
      throw error
    }
  }

  async function showAdd(id: string) {
    try {
      const query = "SELECT * FROM TB_PRODUTOS WHERE id = ? AND deleted_at IS NULL"

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
      const query = "SELECT id, descricao FROM TB_TP_PRODUTO WHERE deleted_at IS NULL AND ativo = 1"

      const response = await database.getAllAsync<{ id: number; descricao: string }>(
        query
      )

      return response
    } catch (error) {
      throw error
    }
  }

  async function filterByTipo(tipoProdutoId: number, limit: number, offset: number): Promise<ProductDatabase[]> {
    try {
      const query = `SELECT P.* FROM TB_PRODUTOS P JOIN TB_TP_PRODUTO T ON P.tipoProdutoId = T.id WHERE P.deleted_at IS NULL AND T.ativo = 1 AND P.tipoProdutoId = ? ORDER BY P.nome ASC LIMIT ? OFFSET ?`

      const response = await database.getAllAsync<ProductDatabase>(query, [tipoProdutoId, limit, offset])

      return response
    } catch (error) {
      throw error
    }
  }

  async function searchOrigemProdutoId(produtoId: string): Promise<ProductDatabase[]> {
    try {
      const query = `SELECT P.* FROM TB_PRODUTOS P JOIN TB_TP_PRODUTO T ON P.tipoProdutoId = T.id WHERE P.origemProdutoId = ? AND P.deleted_at IS NULL AND T.ativo = 1`

      const response = await database.getAllAsync<ProductDatabase>(query, [produtoId])

      return response
    } catch (error) {
      console.error("Erro ao buscar produtos de origem:", error)
      throw error
    }
  }

  return { 
    create, 
    createFromSync, 
    searchByName, 
    update, 
    remove, 
    show, 
    getTipoProdutos, 
    filterByTipo, 
    searchOrigemProdutoId, 
    showAdd 
  }
}
