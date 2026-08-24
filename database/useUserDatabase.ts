import { useSQLiteContext } from 'expo-sqlite'
import { User } from './types/User'

export function useUserDatabase() {
  const database = useSQLiteContext()

  async function create(data: Omit<User, 'id'>) {
    const stmt = await database.prepareAsync(
      'INSERT INTO TB_USERS (name, establishmentId, establishmentName) VALUES ($name, $establishmentId, $establishmentName)'
    )

    try {
      const result = await stmt.executeAsync({
        $name: data.name,
        $establishmentId: data.establishmentId ?? null,
        $establishmentName: data.establishmentName ?? null,
      })

      return { insertedRowId: result.lastInsertRowId }
    } catch (err) {
      throw err
    } finally {
      await stmt.finalizeAsync()
    }
  }

  async function show(id: number) {
    try {
      const row = await database.getFirstAsync<User>('SELECT * FROM TB_USERS WHERE id = ?', [id])
      return row
    } catch (err) {
      throw err
    }
  }

  async function update(data: User) {
    const stmt = await database.prepareAsync(
      'UPDATE TB_USERS SET name = $name, establishmentId = $establishmentId, establishmentName = $establishmentName WHERE id = $id'
    )

    try {
      await stmt.executeAsync({
        $id: data.id,
        $name: data.name,
        $establishmentId: data.establishmentId ?? null,
        $establishmentName: data.establishmentName ?? null,
      })
    } catch (err) {
      throw err
    } finally {
      await stmt.finalizeAsync()
    }
  }

  async function list() {
    try {
      const rows = await database.getAllAsync<User>('SELECT * FROM TB_USERS ORDER BY name')
      return rows
    } catch (err) {
      throw err
    }
  }

  return { create, show, update, list }
}
