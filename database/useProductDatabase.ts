import { useSQLiteContext } from "expo-sqlite"
import { Product } from "./types/Product"
import { generateUUID } from "./utils/uuid"
import { markChanged } from "./tableWatermark"

export function useProductDatabase() {
  const database = useSQLiteContext()

  async function create(data: Omit<Product, "id" | "updated_at">) {
    const statement = await database.prepareAsync(
      "INSERT INTO TB_PRODUCTS (id, name, price, productTypeId, sourceProductId, ingredients, updated_at, sync_status) VALUES ($id, $name, $price, $productTypeId, $sourceProductId, $ingredients, $updated_at, $sync_status)"
    )

    try {
      const id = generateUUID()
      const result = await statement.executeAsync({
        $id: id,
        $name: data.name,
        $price: data.price,
        $productTypeId: data.productTypeId,
        $sourceProductId: data.sourceProductId ?? null,
        $ingredients: data.ingredients ?? null,
        $updated_at: Date.now(),
        $sync_status: 'pending',
      })

        console.log('[db] produto criado', { id })

        markChanged('products')

        return { id }
    } catch (error) {
      throw error
    } finally {
      await statement.finalizeAsync()
    }
  }

  async function createFromSync(data: Product) {
    const statement = await database.prepareAsync(
      "INSERT INTO TB_PRODUCTS (id, name, price, productTypeId, sourceProductId, ingredients, updated_at, sync_status) VALUES ($id, $name, $price, $productTypeId, $sourceProductId, $ingredients, $updated_at, $sync_status)"
    )

    try {
      await statement.executeAsync({
        $id: data.id,
        $name: data.name,
        $price: data.price,
        $productTypeId: data.productTypeId,
        $sourceProductId: data.sourceProductId ?? null,
        $ingredients: data.ingredients ?? null,
        $updated_at: (data as any).updated_at ?? Date.now(),
        $sync_status: 'synced',
      })

      markChanged('products')

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
        const query = `SELECT P.* FROM TB_PRODUCTS P JOIN TB_PRODUCT_TYPES T ON P.productTypeId = T.id WHERE P.deleted_at IS NULL AND T.isActive = 1 AND P.name LIKE ? ORDER BY P.name ASC, P.id ASC LIMIT ? OFFSET ?`

        const response = await database.getAllAsync<Product>(query, [`%${name}%`, limit, offset ?? 0])

        return response
      }

      const query = `SELECT P.* FROM TB_PRODUCTS P JOIN TB_PRODUCT_TYPES T ON P.productTypeId = T.id WHERE P.deleted_at IS NULL AND T.isActive = 1 AND P.name LIKE ?`

      const response = await database.getAllAsync<Product>(query, `%${name}%`)

      return response
    } catch (error) {
      throw error
    }
  }

  async function update(data: Omit<Product, "updated_at">) {
    const statement = await database.prepareAsync(
      "UPDATE TB_PRODUCTS SET name = $name, price = $price, productTypeId = $productTypeId, ingredients = $ingredients, updated_at = $updated_at, sync_status = $sync_status WHERE id = $id"
    )

    try {
      await statement.executeAsync({
        $id: data.id,
        $name: data.name,
        $price: data.price,
        $productTypeId: data.productTypeId,
        $ingredients: data.ingredients ?? null,
        $updated_at: Date.now(),
        $sync_status: 'pending',
      })

      markChanged('products')
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
        'UPDATE TB_PRODUCTS SET deleted_at = ?, updated_at = ?, sync_status = ? WHERE id = ?',
        [now, now, 'pending', id]
      );

      markChanged('products')
    } catch (error) {
      throw error
    }
  }

  async function show(id: string) {
    try {
      const query = "SELECT * FROM TB_PRODUCTS WHERE id = ? AND deleted_at IS NULL"

      const response = await database.getFirstAsync<Product>(query, [
        id,
      ])

      return response
    } catch (error) {
      throw error
    }
  }

  async function showAdd(id: string) {
    try {
      const query = "SELECT * FROM TB_PRODUCTS WHERE id = ? AND deleted_at IS NULL"

      const response = await database.getFirstAsync<Product>(query, [
        id,
      ])

      return response
    } catch (error) {
      throw error
    }
  }

  async function getProductTypes() {
    try {
      const query = "SELECT id, description FROM TB_PRODUCT_TYPES WHERE deleted_at IS NULL AND isActive = 1"

      const response = await database.getAllAsync<{ id: number; description: string }>(
        query
      )

      return response
    } catch (error) {
      throw error
    }
  }

  async function filterByProductType(productTypeId: number, limit: number, offset: number): Promise<Product[]> {
    try {
      const query = `SELECT P.* FROM TB_PRODUCTS P JOIN TB_PRODUCT_TYPES T ON P.productTypeId = T.id WHERE P.deleted_at IS NULL AND T.isActive = 1 AND P.productTypeId = ? ORDER BY P.name ASC, P.id ASC LIMIT ? OFFSET ?`

      const response = await database.getAllAsync<Product>(query, [productTypeId, limit, offset])

      return response
    } catch (error) {
      throw error
    }
  }

  async function searchBySourceProductId(productId: string): Promise<Product[]> {
    try {
      const query = `SELECT P.* FROM TB_PRODUCTS P JOIN TB_PRODUCT_TYPES T ON P.productTypeId = T.id WHERE P.sourceProductId = ? AND P.deleted_at IS NULL AND T.isActive = 1`

      const response = await database.getAllAsync<Product>(query, [productId])

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
    getProductTypes,
    filterByProductType,
    searchBySourceProductId,
    /** @deprecated Use getProductTypes. */
    getTipoProdutos: getProductTypes,
    /** @deprecated Use filterByProductType. */
    filterByTipo: filterByProductType,
    /** @deprecated Use searchBySourceProductId. */
    searchOrigemProdutoId: searchBySourceProductId,
    showAdd 
  }
}
