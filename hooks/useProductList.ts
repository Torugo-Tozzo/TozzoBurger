import { useState, useEffect, useRef } from "react"
import {  useProductDatabase } from "@/database/useProductDatabase"
import { Product } from "@/database/types/Product"
import { useAutoSync } from '@/context/AutoSyncContext'
import { useShouldReload } from '@/hooks/useShouldReload'

const PAGE_SIZE = 20

// Evita re-render de toda a lista (perde React.memo dos cards) quando o
// refetch em foco de aba traz o mesmo conteudo de antes - so muda o estado
// se algo de fato mudou.
function isProductsEqual(a: Product[], b: Product[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].updated_at !== b[i].updated_at) return false
  }
  return true
}

export function useProductList() {
  const [search, setSearch] = useState("")
  const [products, setProducts] = useState<Product[]>([])
  const [productTypes, setProductTypes] = useState<{ id: string; description: string }[]>([])
  const [productTypeId, setProductTypeId] = useState("")
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
  const loadProductTypes = async () => {
    try {
      const types = await productDatabase.getProductTypes()
      setProductTypes(types)
    } catch (error) {
      console.log(error)
    }
  }

  // Função para filtrar produtos por tipo (página 1)
  const filterByProductType = async (typeId: string | null) => {
    if (typeId) {
      requestIdRef.current += 1
      setProductTypeId(typeId)
      setIsLoading(true)
      try {
        const filtered = await productDatabase.filterByProductType(typeId, PAGE_SIZE, 0)
        setProducts((prev) => (isProductsEqual(prev, filtered) ? prev : filtered))
        setPage(1)
        setHasMore(filtered.length === PAGE_SIZE)
      } catch (error) {
        console.log(error)
      } finally {
        setIsLoading(false)
      }
    } else {
      setProductTypeId("")
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
      const more = productTypeId
        ? await productDatabase.filterByProductType(productTypeId, PAGE_SIZE, offset)
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

  // Carregar produtos+tipos quando a pesquisa mudar - acao direta do usuario,
  // sempre roda, nao passa pelo gate.
  useEffect(() => {
    list()
    loadProductTypes()
  }, [search])

  // Recarregar quando uma sincronizacao remota for aplicada (lastSync) - so
  // se a tabela de produtos realmente mudou desde a ultima vez que esta tela
  // recarregou. Pula a 1a execucao (mount), ja coberta pelo efeito acima.
  const { lastSync } = useAutoSync();
  const shouldReloadProdutos = useShouldReload(['products'])
  const isFirstLastSync = useRef(true)
  useEffect(() => {
    if (isFirstLastSync.current) {
      isFirstLastSync.current = false
      shouldReloadProdutos() // marca o baseline do mount, ignora o resultado
      return
    }
    if (!shouldReloadProdutos()) return
    list()
    loadProductTypes()
  }, [lastSync])

  return {
    search,
    setSearch,
    products,
    productTypes,
    productTypeId,
    setProductTypeId,
    filterByProductType,
    setProducts,
    setProductTypes,
    isLoading,
    isLoadingMore,
    hasMore,
    loadMore,
  }
}

export default useProductList
