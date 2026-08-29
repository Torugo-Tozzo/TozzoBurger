export type Product = {
  id: string
  name: string
  price: number
  productTypeId: string | null
  quantity?: number | null
  sourceProductId?: string | null
  ingredients?: string | null
  updated_at: number
  deleted_at?: number | null
  sync_status?: string | null
}