# Performance + loading UX mobile (Fase 5, sub-item 4A)

> Data: 2026-08-09. Branch: `feat/design-system-mobile-listas` (mesma do sub-item 2, empilhado — Fase 5 virou uma leva grande por decisão do usuário, vai tudo pra homolog junto). Escopo A de 2: **performance + skeleton** (este documento). Escopo B (retenção local + busca histórica) é spec separada, depois desta.

## Contexto

Usuário relatou o app "pesado" trocando de aba durante a QA desta sessão, suspeitando que a tela espera a tabela carregar antes de renderizar. Investigação (read-only) confirmou duas causas concretas, não é só sensação:

1. **`pedidos.tsx` faz N+1 duplicado, não N+1 simples**: `usePedidoDatabase.ts` (`listPedidosRecentes`/`listPedidosRecentesPorUsuario`, linhas 265-306 e 358-397) **já busca os produtos em lote** por pedido (`Promise.all` + JOIN, mesmo padrão que `listVendasRecentes`/`listVendasPorDia` em `useVendaDatabse.ts` já usam) e já anexa `produtos: string[]` (pré-formatado, truncado em 3+"...") em cada pedido retornado. Mas `PedidoItem.tsx` **ignora esse campo e busca de novo sozinho**, via `useEffect` + `getProdutosByPedidoId(data.id)` próprio — uma query adicional por card, redundante com o que a tela já buscou. Hoje: 2N+1 queries no mount da tela de pedidos (N do lote em `load()`, mais N de novo em cada `PedidoItem`, mais a query principal). `getProdutosByPedidoId` não tem nenhum outro consumidor no código.
2. **Zero skeleton em qualquer tela**: `pedidos.tsx` e `produtos.tsx`/`index.tsx` (via `useProductList.ts`) não expõem nenhum estado de loading — a lista fica vazia até a query resolver, sem indicação visual. `historico.tsx` tem um `ActivityIndicator` de tela inteira, binário, que cobre a tela toda em vez de mostrar a estrutura da lista carregando.

O site (`front/front-tozzo.uk`, Fase 4) já resolveu isso: `useMinLoadingDuration` (segura o skeleton por um mínimo, evita flash mecânico em respostas rápidas) + componente `Skeleton` (retângulo com `animate-pulse`) aplicado por célula/linha, mostrado só em fetch iniciado pelo usuário — refresh silencioso (poll/realtime) troca o dado sem re-exibir skeleton. Esta leva porta o mesmo padrão pro mobile.

## Decisões do brainstorm (2026-08-09)

- **Fase 5 vira leva grande**: usuário decidiu bundlar design-system-mobile original + unificação de listas (pronto) + este item de performance + WebSocket realtime (spec separada, depois) — tudo no mesmo branch, vai pra homolog junto, teste pesado acontece lá. Ver `plano.md`.
- **"Lazy-load" = resolver o N+1, não paginação**: FlatList já virtualiza render sozinho; paginação de query só valeria a pena se as listas crescessem muito (produtos é dezenas, não milhares — baixo valor agora). Confirmado com o usuário.
- **Não remover o refetch em foco de `pedidos.tsx`**: `pedidoModal.tsx` grava local (síncrono) e só chama `triggerSync()` (rede, assíncrono) depois — se o refetch-ao-focar sumisse, editar um pedido e voltar mostraria dado velho até o sync de rede terminar. O fix é deixar o refetch rápido (via o item 1 acima) e cobrir com skeleton só quando não há dado nenhum ainda — não remover o gatilho.
- **Skeleton só quando não há dado pra mostrar**: refetch em background (foco de aba, `lastSync`) troca a lista sem re-exibir skeleton — mesmo padrão que o front já usa (fetch do usuário mostra skeleton; poll/realtime silencioso não).

## Escopo 1 — matar o N+1 duplicado

**`components/PedidoItem.tsx`**: remove o `useEffect`/`useState` de `produtos` e a dependência de `usePedidosDatabase()`. Passa a receber `produtos: string[]` via prop (já formatado, mesmo shape que `VendaItem` já recebe de `VendaDatabase & { produtos: string[] }`). `subtitle` do `RecordCard` vira `produtos.length > 0 ? produtos.join(', ') : undefined` — sem mudança de formatação visível (o texto que `listPedidosRecentes` já produz, `( 2x ) Nome`, é o mesmo que estava sendo mostrado antes via `getProdutosByPedidoId`, só reaproveitado em vez de reconsultado).

**`app/(tabs)/pedidos.tsx`**: tipagem de `pedidosPorData` passa a ser explicitamente `Record<string, (PedidoDatabase & { produtos: string[] })[]>` (já é isso na prática, só formaliza), `renderPedido` passa `produtos={pedido.produtos}` pro `PedidoItem`.

**`database/usePedidoDatabase.ts`**: nenhuma mudança de query — o lote já existe. `getProdutosByPedidoId` fica (não remove — é função pública do hook, sem uso hoje mas baixo custo manter; se preferir remover, é decisão de limpeza independente, não bloqueia o resto).

## Escopo 2 — primitivos de skeleton

**`hooks/useMinLoadingDuration.ts`** (novo): porta literal do front (`front/front-tozzo.uk/src/hooks/useMinLoadingDuration.ts`) — lógica pura em JS/TS, sem dependência de DOM, copia sem alteração. `useMinLoadingDuration(isLoading: boolean, minMs = 400): boolean`.

**`components/ui/Skeleton.tsx`** (novo): `View` com opacidade pulsante via `Animated.loop` (RN não tem `animate-pulse` de CSS). Props: `width`, `height`, `borderRadius?` (default `radius.sm`). Cor de fundo: `colors.border` (tom neutro já usado pra divisores, funciona em light/dark sem token novo).

**Skeletons por tela** (componentes pequenos, um por formato de card, não um genérico):
- `components/ui/RecordCardSkeleton.tsx` — silhueta do `RecordCard` (barra de cor cinza fixa + 2 linhas de texto + total à direita + fileira de ações), usado por `pedidos.tsx`/`historico.tsx`.
- `components/ui/ProductCardSkeleton.tsx` — silhueta do `Product`/`ProductItemVenda` (nome+preço+badge+ações), usado por `produtos.tsx`/`index.tsx`.

## Escopo 3 — aplicar loading state nas 4 telas

- **`pedidos.tsx`**: ganha `isLoading` em volta de `load()` (hoje não existe nenhum estado de loading). Skeleton (5 `RecordCardSkeleton`) só quando `isLoading && Object.keys(pedidosPorData).length === 0` — primeiro load ou lista vazia. Refetch em foco/`lastSync` com dado já carregado não re-exibe skeleton.
- **`historico.tsx`**: troca o `ActivityIndicator` de tela inteira (`loading` já existe) por uma lista de `RecordCardSkeleton`, mesma regra (só quando não há dado ainda).
- **`produtos.tsx`** / **`index.tsx`**: `useProductList.ts` ganha `isLoading` (não existe hoje). Skeleton (`ProductCardSkeleton` × 5) só quando `isLoading && products.length === 0`.
- Em todos os casos, `useMinLoadingDuration` envolve o `isLoading` bruto antes de decidir mostrar skeleton — evita flash em queries que resolvem rápido (mais prováveis agora, depois do fix do escopo 1).

## Fora do escopo

- Paginação/lazy-load de query real — avaliado e descartado por baixo valor agora (ver decisão acima).
- Retenção local / expurgo de dados antigos / busca histórica via API — spec B, separada, depois desta.
- WebSocket realtime — spec própria, já decidida, ainda não brainstormada formalmente.
- Toggle dark/light manual — item antigo do QA de 2026-08-08, continua em aberto, não relacionado.

## Testes

Sem teste de snapshot/render novo pros componentes de skeleton (puramente visuais, mesmo padrão do resto do design system mobile). `tsc --noEmit` limpo + `npx jest --watchAll=false` (suíte existente não deve quebrar — mudança é estrutural em `PedidoItem`/telas, não em lógica de hooks de dado testados hoje). Validação manual no emulador: trocar de aba repetidas vezes deve parecer visivelmente mais rápido; skeleton deve aparecer só no primeiro load de cada tela, não a cada troca de aba com dado já carregado.
