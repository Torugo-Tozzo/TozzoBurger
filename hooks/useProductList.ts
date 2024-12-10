// hooks/useProductList.ts
import { useState, useEffect } from "react"
import { ProductDatabase, useProductDatabase } from "@/database/useProductDatabase"

export function useProductList() {
  const [search, setSearch] = useState("")
  const [products, setProducts] = useState<ProductDatabase[]>([])
  const [tiposProduto, setTiposProduto] = useState<{ id: number; descricao: string }[]>([])
  const [tipoProdutoId, setTipoProdutoId] = useState("")

  const productDatabase = useProductDatabase()

  // Função para listar os produtos
  const list = async () => {
    try {
      const response = await productDatabase.searchByName(search)
      setProducts(response)
    } catch (error) {
      console.log(error)
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
    try {
      if (tipoId) {
        setTipoProdutoId(String(tipoId))
        const filtered = await productDatabase.filterByTipo(tipoId)
        setProducts(filtered)
      } else {
        setTipoProdutoId("")
        await list()
      }
    } catch (error) {
      console.log(error)
    }
  }

  // Carregar os produtos e tipos de produto quando a pesquisa mudar
  useEffect(() => {
    list()
    loadTiposProduto()
  }, [search])

  return {
    search,
    setSearch,
    products,
    tiposProduto,
    tipoProdutoId,
    setTipoProdutoId,
    filterByTipo,
    setProducts,
    setTiposProduto
  }
}

export default useProductList