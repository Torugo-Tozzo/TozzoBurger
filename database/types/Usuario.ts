export type UsuarioDatabase = {
  id: number
  nome: string
  estabelecimentoId?: number | null
  nomeEstabelecimento?: string | null
  role?: string | null
}