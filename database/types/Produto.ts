export type ProductDatabase = {
  id: string
  nome: string
  preco: number
  tipoProdutoId: number
  quantidade?: number | null
  origemProdutoId?: string | null
  ingredientes?: string | null
  updated_at: number
  deleted_at?: number | null
}