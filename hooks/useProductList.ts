import { useState, useEffect, useRef } from "react"
import {  useProductDatabase } from "@/database/useProductDatabase"
import { ProductDatabase } from "@/database/types/Produto"
import { useAutoSync } from '@/context/AutoSyncContext'

const PAGE_SIZE = 20

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
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const requestIdRef = useRef(0)

  const productDatabase = useProductDatabase()

  // Função para listar os produtos (página 1)
  const list = async () => {
    requestIdRef.current += 1
    setIsLoading(true)
    try {
      const response = await productDatabase.searchByName(search, PAGE_SIZE, 0)
      setProducts((prev) => (isProductsEqual(prev, response) ? prev : response))
      setPage(1)
      setHasMore(response.length === PAGE_SIZE)
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

  // Função para filtrar produtos por tipo (página 1)
  const filterByTipo = async (tipoId: number | null) => {
    if (tipoId) {
      requestIdRef.current += 1
      setTipoProdutoId(String(tipoId))
      setIsLoading(true)
      try {
        const filtered = await productDatabase.filterByTipo(tipoId, PAGE_SIZE, 0)
        setProducts((prev) => (isProductsEqual(prev, filtered) ? prev : filtered))
        setPage(1)
        setHasMore(filtered.length === PAGE_SIZE)
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

  // Carrega a proxima pagina e concatena ao final da lista ja exibida
  const loadMore = async () => {
    if (!hasMore || isLoadingMore) return
    const requestId = requestIdRef.current
    setIsLoadingMore(true)
    try {
      const nextPage = page + 1
      const offset = (nextPage - 1) * PAGE_SIZE
      const more = tipoProdutoId
        ? await productDatabase.filterByTipo(Number(tipoProdutoId), PAGE_SIZE, offset)
        : await productDatabase.searchByName(search, PAGE_SIZE, offset)
      if (requestId !== requestIdRef.current) return
      setProducts((prev) => [...prev, ...more])
      setPage(nextPage)
      setHasMore(more.length === PAGE_SIZE)
    } catch (error) {
      console.log(error)
    } finally {
      setIsLoadingMore(false)
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
    isLoadingMore,
    hasMore,
    loadMore,
  }
}

export default useProductList
