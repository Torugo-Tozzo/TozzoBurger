import { useSQLiteContext } from 'expo-sqlite'
import { UsuarioDatabase } from './types/Usuario'

export function useUsuarioDatabase() {
  const database = useSQLiteContext()

  async function create(data: Omit<UsuarioDatabase, 'id'>) {
    const stmt = await database.prepareAsync(
      'INSERT INTO TB_USUARIO (nome, estabelecimentoId, nomeEstabelecimento) VALUES ($nome, $estabelecimentoId, $nomeEstabelecimento)'
    )

    try {
      const result = await stmt.executeAsync({
        $nome: data.nome,
        $estabelecimentoId: data.estabelecimentoId ?? null,
        $nomeEstabelecimento: data.nomeEstabelecimento ?? null,
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
      const row = await database.getFirstAsync<UsuarioDatabase>('SELECT * FROM TB_USUARIO WHERE id = ?', [id])
      return row
    } catch (err) {
      throw err
    }
  }

  async function update(data: UsuarioDatabase) {
    const stmt = await database.prepareAsync(
      'UPDATE TB_USUARIO SET nome = $nome, estabelecimentoId = $estabelecimentoId, nomeEstabelecimento = $nomeEstabelecimento WHERE id = $id'
    )

    try {
      await stmt.executeAsync({
        $id: data.id,
        $nome: data.nome,
        $estabelecimentoId: data.estabelecimentoId ?? null,
        $nomeEstabelecimento: data.nomeEstabelecimento ?? null,
      })
    } catch (err) {
      throw err
    } finally {
      await stmt.finalizeAsync()
    }
  }

  async function list() {
    try {
      const rows = await database.getAllAsync<UsuarioDatabase>('SELECT * FROM TB_USUARIO ORDER BY nome')
      return rows
    } catch (err) {
      throw err
    }
  }

  return { create, show, update, list }
}
