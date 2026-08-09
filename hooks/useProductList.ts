import { useState, useEffect } from "react"
import {  useProductDatabase } from "@/database/useProductDatabase"
import { ProductDatabase } from "@/database/types/Produto"
import { useAutoSync } from '@/context/AutoSyncContext'

// Evita re-render de toda a lista (perde React.memo dos cards) quando o
// refetch em foco de aba traz o mesmo conteudo de antes - so muda o estado
// se algo de fato mudou.
function isProductsEqual(a: ProductDatabase[], b: ProductDatabase[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].updated_at !== b[i].updated_at) return false
  }
  return true
}

export function useProductList() {
  const [search, setSearch] = useState("")
  const [products, setProducts] = useState<ProductDatabase[]>([])
  const [tiposProduto, setTiposProduto] = useState<{ id: number; descricao: string }[]>([])
  const [tipoProdutoId, setTipoProdutoId] = useState("")
  const [isLoading, setIsLoading] = useState(true)

  const productDatabase = useProductDatabase()

  // Função para listar os produtos
  const list = async () => {
    setIsLoading(true)
    try {
      const response = await productDatabase.searchByName(search)
      setProducts((prev) => (isProductsEqual(prev, response) ? prev : response))
    } catch (error) {
      console.log(error)
    } finally {
      setIsLoading(false)
    }
  }

  // Função para carregar os tipos de produto
  const loadTiposProduto = async () => {
    try {
      const tipos = await productDatabase.getTipoProdutos()
      setTiposProduto(tipos)
    } catch (error) {
      console.log(error)
    }
  }

  // Função para filtrar produtos por tipo
  const filterByTipo = async (tipoId: number | null) => {
    if (tipoId) {
      setTipoProdutoId(String(tipoId))
      setIsLoading(true)
      try {
        const filtered = await productDatabase.filterByTipo(tipoId)
        setProducts((prev) => (isProductsEqual(prev, filtered) ? prev : filtered))
      } catch (error) {
        console.log(error)
      } finally {
        setIsLoading(false)
      }
    } else {
      setTipoProdutoId("")
      await list()
    }
  }

  // Carregar os produtos e tipos de produto quando a pesquisa mudar
  // e também recarregar quando uma sincronização remota for aplicada (lastSync)
  const { lastSync } = useAutoSync();
  useEffect(() => {
    list()
    loadTiposProduto()
  }, [search, lastSync])

  return {
    search,
    setSearch,
    products,
    tiposProduto,
    tipoProdutoId,
    setTipoProdutoId,
    filterByTipo,
    setProducts,
    setTiposProduto,
    isLoading,
  }
}

export default useProductList
