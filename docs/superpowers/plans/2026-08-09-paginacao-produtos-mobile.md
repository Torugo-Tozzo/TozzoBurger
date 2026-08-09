# Paginação do catálogo de produtos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parar de puxar o catálogo inteiro (150-300 produtos em produção) toda vez que `produtos.tsx`/`index.tsx` buscam produtos — paginar em blocos de 20 com scroll infinito.

**Architecture:** `database/useProductDatabase.ts` ganha `limit`/`offset` em `searchByName`/`filterByTipo` (com `ORDER BY` estável). `hooks/useProductList.ts` ganha estado de paginação (`page`/`hasMore`/`isLoadingMore`) e uma função `loadMore()` que concatena a próxima página. As 2 telas consumidoras ganham `onEndReached` no `FlatList` + spinner de rodapé.

**Tech Stack:** React Native (Expo SDK 52) + TypeScript, `expo-sqlite`.

## Global Constraints

- Branch: `feat/design-system-mobile-listas` (mesma leva, sem branch nova).
- Comando de teste correto: `npx jest --watchAll=false` (não `npm test`).
- `tsc --noEmit` limpo é requisito de cada task.
- **`searchByName` precisa continuar funcionando SEM `limit`/`offset`** — `app/modais/pedidoModal.tsx:79` e um teste existente (`database/__tests__/useProductDatabase.test.tsx:99`) chamam `searchByName(nome)` só com o nome, esperando o comportamento atual (sem paginação, sem `ORDER BY`, bind do segundo parâmetro como string solta — não array). `limit`/`offset` são opcionais ali, path totalmente separado do path paginado, pra não arriscar quebrar esses 2 chamadores nem precisar tocar no teste existente.
- `filterByTipo` não tem esse problema — único consumidor é `useProductList.ts`, então `limit`/`offset` podem ser obrigatórios ali.
- Tamanho de página: 20. `hasMore` por heurística (`resultado.length === limit`), sem `COUNT(*)`.

---

## Task 1: `database/useProductDatabase.ts` — `limit`/`offset` em `searchByName`/`filterByTipo`

**Files:**
- Modify: `database/useProductDatabase.ts:61-71` (`searchByName`)
- Modify: `database/useProductDatabase.ts:149-159` (`filterByTipo`)

**Interfaces:**
- Consumes: nada de novo.
- Produces: `searchByName(name: string, limit?: number, offset?: number)` — quando `limit` é passado, adiciona `ORDER BY P.nome ASC LIMIT ? OFFSET ?` (bind via array `[nome, limit, offset]`); quando omitido, comportamento **idêntico ao atual** (sem `ORDER BY`, bind do nome como string solta, não array). `filterByTipo(tipoProdutoId: number, limit: number, offset: number)` — `limit`/`offset` agora obrigatórios, sempre com `ORDER BY P.nome ASC LIMIT ? OFFSET ?`. Consumido por Task 2.

- [ ] **Step 1: `searchByName` — dois caminhos (com e sem paginação)**

Trocar:

```ts
  async function searchByName(name: string) {
    try {
      const query = `SELECT P.* FROM TB_PRODUTOS P JOIN TB_TP_PRODUTO T ON P.tipoProdutoId = T.id WHERE P.deleted_at IS NULL AND T.ativo = 1 AND P.nome LIKE ?`

      const response = await database.getAllAsync<ProductDatabase>(query, `%${name}%`)

      return response
    } catch (error) {
      throw error
    }
  }
```

por:

```ts
  async function searchByName(name: string, limit?: number, offset?: number) {
    try {
      if (limit !== undefined) {
        const query = `SELECT P.* FROM TB_PRODUTOS P JOIN TB_TP_PRODUTO T ON P.tipoProdutoId = T.id WHERE P.deleted_at IS NULL AND T.ativo = 1 AND P.nome LIKE ? ORDER BY P.nome ASC LIMIT ? OFFSET ?`

        const response = await database.getAllAsync<ProductDatabase>(query, [`%${name}%`, limit, offset ?? 0])

        return response
      }

      const query = `SELECT P.* FROM TB_PRODUTOS P JOIN TB_TP_PRODUTO T ON P.tipoProdutoId = T.id WHERE P.deleted_at IS NULL AND T.ativo = 1 AND P.nome LIKE ?`

      const response = await database.getAllAsync<ProductDatabase>(query, `%${name}%`)

      return response
    } catch (error) {
      throw error
    }
  }
```

- [ ] **Step 2: `filterByTipo` — `limit`/`offset` obrigatórios**

Trocar:

```ts
  async function filterByTipo(tipoProdutoId: number): Promise<ProductDatabase[]> {
    try {
      const query = `SELECT P.* FROM TB_PRODUTOS P JOIN TB_TP_PRODUTO T ON P.tipoProdutoId = T.id WHERE P.deleted_at IS NULL AND T.ativo = 1 AND P.tipoProdutoId = ?`

      const response = await database.getAllAsync<ProductDatabase>(query, [tipoProdutoId])

      return response
    } catch (error) {
      throw error
    }
  }
```

por:

```ts
  async function filterByTipo(tipoProdutoId: number, limit: number, offset: number): Promise<ProductDatabase[]> {
    try {
      const query = `SELECT P.* FROM TB_PRODUTOS P JOIN TB_TP_PRODUTO T ON P.tipoProdutoId = T.id WHERE P.deleted_at IS NULL AND T.ativo = 1 AND P.tipoProdutoId = ? ORDER BY P.nome ASC LIMIT ? OFFSET ?`

      const response = await database.getAllAsync<ProductDatabase>(query, [tipoProdutoId, limit, offset])

      return response
    } catch (error) {
      throw error
    }
  }
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: erro em `hooks/useProductList.ts` (única chamadora de `filterByTipo`, ainda não passa `limit`/`offset`) — esperado, Task 2 corrige. Nenhum erro esperado em `app/modais/pedidoModal.tsx` (chama só `searchByName(q)`, que continua válido com os novos parâmetros opcionais).

- [ ] **Step 4: Rodar suíte**

Run: `npx jest --watchAll=false`
Expected: o teste existente `searchByName() only returns rows with deleted_at IS NULL` (`database/__tests__/useProductDatabase.test.tsx:92-105`) continua passando sem alteração — ele chama `searchByName('burger')` sem `limit`, cai no path idêntico ao original (bind como string solta, sem `ORDER BY`).

- [ ] **Step 5: Commit**

```bash
git add database/useProductDatabase.ts
git commit -m "feat(mobile): searchByName/filterByTipo ganham paginação (limit/offset)"
```

---

## Task 2: `hooks/useProductList.ts` — estado de paginação + `loadMore()`

**Files:**
- Modify: `hooks/useProductList.ts`

**Interfaces:**
- Consumes: `searchByName(name, limit?, offset?)`/`filterByTipo(tipoId, limit, offset)` (Task 1).
- Produces: hook ganha `isLoadingMore: boolean`, `hasMore: boolean`, `loadMore: () => Promise<void>` no retorno. `list()`/`filterByTipo()` passam a buscar só a página 1 (`limit=20, offset=0`) e resetam `page`/`hasMore`. Consumido por Tasks 3, 4.

- [ ] **Step 1: Substituir o arquivo inteiro**

```ts
import { useState, useEffect } from "react"
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

  const productDatabase = useProductDatabase()

  // Função para listar os produtos (página 1)
  const list = async () => {
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
    setIsLoadingMore(true)
    try {
      const nextPage = page + 1
      const offset = (nextPage - 1) * PAGE_SIZE
      const more = tipoProdutoId
        ? await productDatabase.filterByTipo(Number(tipoProdutoId), PAGE_SIZE, offset)
        : await productDatabase.searchByName(search, PAGE_SIZE, offset)
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
```

**Nota**: `isProductsEqual` (guarda de re-render, já existe na branch) segue usada só na página 1 (`list`/`filterByTipo`) — `loadMore` sempre concatena de verdade, nunca precisa da guarda (anexar é sempre mudança real).

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: limpo agora (Task 1 + esta task se completam — `produtos.tsx`/`index.tsx` continuam compilando, `isLoadingMore`/`hasMore`/`loadMore` são aditivos ao objeto retornado).

- [ ] **Step 3: Commit**

```bash
git add hooks/useProductList.ts
git commit -m "feat(mobile): useProductList pagina em blocos de 20, loadMore concatena"
```

---

## Task 3: `app/(tabs)/produtos.tsx` — scroll infinito

**Files:**
- Modify: `app/(tabs)/produtos.tsx`

**Interfaces:**
- Consumes: `isLoadingMore`/`loadMore` (Task 2).
- Produces: mesma tela pública.

- [ ] **Step 1: Trocar o import de `react-native`**

Trocar:

```tsx
import { StyleSheet, FlatList, Alert, RefreshControl } from "react-native";
```

por:

```tsx
import { ActivityIndicator, StyleSheet, FlatList, Alert, RefreshControl } from "react-native";
```

- [ ] **Step 2: Desestruturar `isLoadingMore`/`loadMore`**

Trocar:

```tsx
  const { products, tiposProduto, tipoProdutoId, filterByTipo, setSearch, isLoading } = useProductList()
```

por:

```tsx
  const { products, tiposProduto, tipoProdutoId, filterByTipo, setSearch, isLoading, isLoadingMore, loadMore } = useProductList()
```

- [ ] **Step 3: `FlatList` ganha `onEndReached` + rodapé de loading**

Trocar:

```tsx
        <FlatList
          data={products}
          keyExtractor={(item) => String(item.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<EmptyState icon="cutlery" title="Nenhum produto cadastrado" message="Toque no + pra adicionar o primeiro item." />}
          renderItem={({ item }) => {
```

por:

```tsx
        <FlatList
          data={products}
          keyExtractor={(item) => String(item.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<EmptyState icon="cutlery" title="Nenhum produto cadastrado" message="Toque no + pra adicionar o primeiro item." />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={isLoadingMore ? <ActivityIndicator style={styles.footerLoader} /> : null}
          renderItem={({ item }) => {
```

- [ ] **Step 4: Novo estilo `footerLoader`**

Trocar o final de `StyleSheet.create`:

```tsx
const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 16,
  },
});
```

por:

```tsx
const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 16,
  },
  footerLoader: {
    paddingVertical: 16,
  },
});
```

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 6: Rodar suíte**

Run: `npx jest --watchAll=false`

- [ ] **Step 7: Commit**

```bash
git add "app/(tabs)/produtos.tsx"
git commit -m "feat(mobile): produtos.tsx ganha scroll infinito"
```

---

## Task 4: `app/(tabs)/index.tsx` — scroll infinito

**Files:**
- Modify: `app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: `isLoadingMore`/`loadMore` (Task 2).
- Produces: mesma tela pública.

- [ ] **Step 1: Trocar o import de `react-native`**

Trocar:

```tsx
import { FlatList, RefreshControl, StyleSheet } from 'react-native';
```

por:

```tsx
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet } from 'react-native';
```

- [ ] **Step 2: Desestruturar `isLoadingMore`/`loadMore`**

Trocar:

```tsx
  const { products, tiposProduto, tipoProdutoId, filterByTipo, setSearch, search, isLoading } = useProductList();
```

por:

```tsx
  const { products, tiposProduto, tipoProdutoId, filterByTipo, setSearch, search, isLoading, isLoadingMore, loadMore } = useProductList();
```

- [ ] **Step 3: `FlatList` ganha `onEndReached` + rodapé de loading**

Trocar:

```tsx
        <FlatList
          data={products}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={listContentStyle}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<EmptyState icon="cutlery" title="Nenhum produto encontrado" message="Ajuste a busca ou o filtro de tipo." />}
        />
```

por:

```tsx
        <FlatList
          data={products}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={listContentStyle}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<EmptyState icon="cutlery" title="Nenhum produto encontrado" message="Ajuste a busca ou o filtro de tipo." />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={isLoadingMore ? <ActivityIndicator style={styles.footerLoader} /> : null}
        />
```

- [ ] **Step 4: Novo estilo `footerLoader`**

Trocar o final de `StyleSheet.create`:

```tsx
const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  buttonWrap: {
    marginTop: spacing.lg,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  separator: {
    marginVertical: 30,
    height: 1,
    width: '80%',
  },
});
```

por:

```tsx
const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  buttonWrap: {
    marginTop: spacing.lg,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  separator: {
    marginVertical: 30,
    height: 1,
    width: '80%',
  },
  footerLoader: {
    paddingVertical: 16,
  },
});
```

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 6: Rodar suíte**

Run: `npx jest --watchAll=false`

- [ ] **Step 7: Commit**

```bash
git add "app/(tabs)/index.tsx"
git commit -m "feat(mobile): venda (index.tsx) ganha scroll infinito"
```

---

## Task 5: Regressão final + checklist visual manual

**Files:** nenhum (validação).

**Interfaces:** N/A.

- [ ] **Step 1: `tsc` e suíte limpos**

Run: `npx tsc --noEmit` — sem erros.
Run: `npx jest --watchAll=false` — todos os testes existentes passando (incluindo `searchByName() only returns rows with deleted_at IS NULL`, sem alteração).

- [ ] **Step 2: Validar visualmente no emulador (já de pé nesta sessão)**

Checklist manual:
- [ ] `produtos.tsx`: primeiro load mostra skeleton, depois 20 produtos. Rolar até o fim carrega mais 20 (spinner pequeno no rodapé), sem travar.
- [ ] `index.tsx` (venda): mesmo comportamento — rolar até o fim carrega mais, adicionar produto ao carrinho continua funcionando com item de qualquer página carregada.
- [ ] Buscar por nome ou trocar filtro de tipo reresulta em nova página 1 (lista reseta, não fica concatenando busca antiga com nova).
- [ ] Trocar de aba e voltar reseta pra página 1 (comportamento já existente, não é regressão nova).
- [ ] `pedidoModal.tsx` (busca de produto pra adicionar a pedido existente) continua funcionando igual — sem paginação ali, mostra todos os resultados da busca por nome.

- [ ] **Step 3: Push**

```bash
git push -u origin feat/design-system-mobile-listas
```
