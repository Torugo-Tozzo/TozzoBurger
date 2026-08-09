# Paginação do catálogo de produtos (Fase 5, sub-item 4C)

> Data: 2026-08-09. Branch: `feat/design-system-mobile-listas` (mesma leva — Fase 5 é uma leva grande por decisão do usuário). Sub-item 4C, depois do 4A (performance/skeleton, já feito, incluindo o fix de re-render redundante achado durante QA ao vivo).

## Contexto

Achado durante QA ao vivo do sub-item 4A: `produtos.tsx` (gerenciamento) e `index.tsx` (tela de venda) usam o mesmo hook (`useProductList`/`useProductDatabase`), e a busca de produtos (`searchByName`/`filterByTipo`, `database/useProductDatabase.ts:61-71`/`149-159`) não tem `ORDER BY`, `LIMIT` nem `OFFSET` — sempre traz o catálogo inteiro. No ambiente local de teste isso é 68 produtos (barato). O usuário confirmou que o cardápio real de produção é bem maior — **150 a 300 produtos** — tornando "puxar tudo toda vez que a aba foca" um problema real, não só teórico.

Correção já aplicada nesta sessão (fora do escopo desta spec, sub-item 4A): guarda de igualdade (`isProductsEqual`, por `id`+`updated_at`) antes de `setProducts`, pra não re-renderizar a lista inteira quando o refetch traz o mesmo conteúdo. Essa correção evita o re-render redundante mas **não reduz o tamanho da query** — o SQLite ainda lê todas as linhas toda vez. Esta spec resolve isso via paginação de verdade.

## Decisões do brainstorm (2026-08-09)

- **Escala**: 150-300 produtos no cardápio real (não os 68 do ambiente local).
- **Mesma paginação nas 2 telas** (`produtos.tsx` e `index.tsx`) — mesmo hook, mesmo comportamento. Descartada a alternativa de só paginar `produtos.tsx` e deixar `index.tsx` (venda, fluxo rápido do garçom) carregar tudo de uma vez — a busca por nome + filtro por tipo já reduzem a lista visível antes de precisar rolar muito, então paginação não deve atrapalhar o fluxo de venda.
- **Scroll infinito** (`onEndReached` do `FlatList`, padrão nativo RN), não botão "carregar mais" — mais natural pro gesto de rolar já usado no app, sem UI extra.
- **Tamanho de página**: 20 itens.
- **`hasMore` por heurística** (`resultado.length === limit`), sem query de `COUNT(*)` extra — mesmo padrão que o `Pagination` do front já usa (`front/front-tozzo.uk`, fallback de `hasMore` em `PedidosTab.tsx`/`VendasTab.tsx`).
- **Reset de página ao focar a aba**: mantém o comportamento já existente (`useFocusEffect` já reseta o filtro pra "todos" toda vez que a aba ganha foco) — agora também reseta a paginação pra página 1. Não é uma regressão nova: hoje a lista já recarrega do zero a cada foco, só que sem paginação a diferença não era visível. Não é ambição desta spec preservar posição de scroll entre idas-e-vindas da aba.

## Escopo

### `database/useProductDatabase.ts`

`searchByName(name, limit, offset)` e `filterByTipo(tipoProdutoId, limit, offset)` ganham `ORDER BY P.nome ASC LIMIT ? OFFSET ?`. Ordem estável (por nome) é obrigatória pra paginação não pular nem repetir item entre páginas — hoje não tem nenhum `ORDER BY`, a ordem de retorno do SQLite sem ele não é garantida de ser estável entre chamadas.

`searchOrigemProdutoId` (usado só pra resolver "adicionais" de um produto, não é lista paginada) **não muda**.

### `hooks/useProductList.ts`

Novo estado: `page` (inicia em 1), `hasMore` (inicia `true`), `isLoadingMore` (separado de `isLoading` — esse último continua gatilho do skeleton de primeiro load; `isLoadingMore` gatilha só o spinner de rodapé da paginação).

`list()`/`filterByTipo()` (chamadas por busca-por-nome, filtro-por-tipo, e pelo `useFocusEffect`/`useEffect([search, lastSync])` já existentes) resetam `page` pra 1, buscam a primeira página (`limit=20, offset=0`), **substituem** `products` (guarda de igualdade do sub-item 4A continua valendo aqui). `hasMore` recalculado a cada chamada.

Nova função `loadMore()`: no-op se `!hasMore || isLoadingMore`. Senão, incrementa `page`, busca a próxima página (usa `filterByTipo` se `tipoProdutoId` estiver setado, senão `searchByName` com o `search` atual), **concatena** ao `products` existente (`setProducts(prev => [...prev, ...novaPagina])` — sem guarda de igualdade aqui, é sempre uma mudança real), atualiza `hasMore`.

`isLoadingMore`/`loadMore` entram no objeto retornado pelo hook.

### `app/(tabs)/produtos.tsx` e `app/(tabs)/index.tsx`

`FlatList` ganha `onEndReached={loadMore}` `onEndReachedThreshold={0.5}` (dispara quando falta metade de uma tela pra chegar no fim) e `ListFooterComponent` — um `ActivityIndicator` pequeno quando `isLoadingMore`, `null` caso contrário.

Nada muda no skeleton de primeiro load (sub-item 4A) — continua mostrando quando `isLoading && products.length === 0`, cobre só a página 1.

## Fora do escopo

- Debounce da busca por nome (cada tecla digitada já dispara nova query — agora mais barata por causa do `LIMIT`, mas o debounce em si não faz parte desta spec).
- Preservar posição de scroll/página ao trocar de aba e voltar — decisão consciente de manter o reset-pra-topo já existente (ver decisão acima).
- Paginação em qualquer outra lista do app (pedidos/histórico) — catálogos pequenos e com janela de data, não precisam.

## Testes

Sem teste de snapshot/render novo (mesmo padrão da leva toda). `tsc --noEmit` limpo + `npx jest --watchAll=false` (suíte existente não deve quebrar). Validação manual: rolar a lista de produtos/venda até o fim deve carregar mais 20 sem travar; buscar por nome/trocar filtro de tipo deve voltar pra página 1 corretamente; primeiro load continua mostrando skeleton.
