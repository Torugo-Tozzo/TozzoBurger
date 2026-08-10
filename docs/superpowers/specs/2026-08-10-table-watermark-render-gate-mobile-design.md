# Watermark por tabela + gate de reload nas listas (Fase 5, sub-item 4C)

> Data: 2026-08-10. Branch: `feat/design-system-mobile-listas` (mesma leva grande da Fase 5 — ver `plano.md`). Segue o sub-item 4A (N+1 + skeleton, já implementado). Ideia original do usuário (dita/ditada em `plano.md`): tag no banco local pra ativar/desativar o render da lista nas abas dependendo de insert/update/delete (local ou via sync), mais relevante pra `produtos` (muda raro) do que `pedidos`/`vendas` (muda muito).

## Contexto

Hoje toda tela de lista recarrega (`useEffect(load, [lastSync])` + `useFocusEffect`) **sempre**, mesmo quando nada mudou na tabela que aquela tela mostra — trocar de aba ou qualquer sync completar (mesmo um sync que só trouxe mudança de `pedidos`) dispara a query completa de `produtos.tsx`/`index.tsx` também. Já existe uma camada de dedupe pós-query (`isProductsEqual`/`isPedidosPorDataEqual`/`isVendasPorDataEqual`, comparando `id`+`updated_at` antes do `setState`, pra não perder o `React.memo` dos cards) — mas isso só evita o *re-render*, não evita a *query* nem o flip de `isLoading` (que aciona `RefreshControl`/skeleton). O objetivo desta leva é evitar a query em si quando a tabela não mudou.

## Decisões do brainstorm (2026-08-10)

- **Guardar o estado em memória, não em SQLite**: um "flag persistida" não tem uso real (1º mount de cada tela sempre recarrega de qualquer jeito) e complicaria a transação do write real. Módulo singleton em memória, mesmo padrão do `database/syncGuard.ts` já existente.
- **Timestamp epoch ms por tabela, não contador incremental nem booleano**: contador puro foi levantado e descartado por preocupação do usuário (crescer indefinidamente ao longo de muitos syncs/uso) — tecnicamente não estoura (`Number.MAX_SAFE_INTEGER` ~9 quadrilhões, levaria milênios), mas foi trocado por timestamp epoch ms por já bater com o padrão `updated_at` usado em todo o projeto (mesmo mecanismo de comparação monotônica, encaixa na convenção existente). Booleano simples foi descartado antes disso: `produtos.tsx` e `index.tsx` leem a mesma tabela (`TB_PRODUTOS`) — se a 1ª tela a ler "consumisse" (zerasse) a flag, a 2ª nunca saberia que mudou. Timestamp por tabela + watermark próprio por tela (não consumido globalmente) resolve isso.
- **Escopo por tabela, não por linha**: bate com o pedido original ("mais específica pra tabela de produtos, que muda raro"). Granularidade por linha já existe de outra forma (dedupe `id`+`updated_at` pós-query, que preserva `React.memo` dos cards individuais).
- **`pedidos.tsx`/`historico.tsx` observam também a tabela `produtos`**: os dois mostram nome de produto (join com `TB_PRODUTOS`) dentro do card. Se só observassem a própria tabela, renomear um produto não invalidaria essas telas. Decisão consciente do usuário: mais correto, custo baixo (2 comparações em vez de 1).
- **Heurística de quando marcar "mudou" no pull da sync**: servidor manda array de itens por tabela, mas cada item só grava local se passar no check de LWW (`updated_at` mais novo que o local) — nem todo item do array vira escrita real. Decisão: marcar mudança **sempre que o array daquela tabela vier não-vazio**, não só quando uma linha é de fato gravada. Mais simples (não precisa instrumentar `.changes` em cada `runAsync` dos 4 blocos de upsert), erra só pro lado seguro (pode disparar reload à toa quando o LWW bloqueou tudo — raro, sem bug de dado desatualizado; nunca perde uma mudança real).

## Arquitetura

**`database/tableWatermark.ts`** (novo, módulo singleton — mesmo padrão de `syncGuard.ts`, sem React):

```ts
type Table = 'produtos' | 'pedidos' | 'vendas';

const changedAt: Record<Table, number> = { produtos: 0, pedidos: 0, vendas: 0 };

export function markChanged(table: Table): void {
  changedAt[table] = Math.max(Date.now(), changedAt[table] + 1);
}

export function getChangedAt(table: Table): number {
  return changedAt[table];
}
```

`Math.max(Date.now(), changedAt[table] + 1)` garante estritamente crescente mesmo se duas mudanças da mesma tabela caírem no mesmo milissegundo (ex: sync aplicando vários itens de pedidos no mesmo tick) — sem isso, a 2ª mudança teria o mesmo timestamp da 1ª e um watcher que já viu a 1ª ignoraria a 2ª.

**`hooks/useShouldReload.ts`** (novo): hook que recebe uma lista de tabelas a observar e devolve uma função `shouldReload(): boolean`. Guarda um `ref` (não `state` — não deve causar re-render por si só) com o último `changedAt` visto por tabela observada. Em cada chamada, compara o valor atual de `getChangedAt` de cada tabela observada contra o ref; se qualquer uma mudou (ou é a 1ª chamada — ref começa `null`), atualiza o ref e retorna `true`. Chamado explicitamente dentro do callback do `useFocusEffect` e do corpo do `useEffect([lastSync])` de cada tela, no lugar da chamada incondicional a `load()`.

**Quem chama `markChanged`**:
- `database/useProductDatabase.ts`: `create`, `update`, `remove`, `createFromSync` → `markChanged('produtos')`.
- `database/usePedidoDatabase.ts`: `createPedido`, `updatePedido`, `removePedido`, `createFromSync` → `markChanged('pedidos')`.
- `database/useVendaDatabse.ts`: `createVenda`, `removeVenda`, `createFromSync` → `markChanged('vendas')`.
- `database/useSyncDatabase.ts` (`sincronizarComServidor`): ao final de cada bloco de upsert, se o array recebido do servidor para aquela tabela veio não-vazio, marca a tabela correspondente — checagens independentes, qualquer uma dispara sozinha: `changes.tiposProduto.length > 0` **ou** `changes.produtos.length > 0` → `markChanged('produtos')` (tipos afeta o filtro de `produtos.tsx`/`index.tsx`, conta como produtos); `changes.pedidos.length > 0` → `markChanged('pedidos')`; `changes.vendas.length > 0` → `markChanged('vendas')`.

**Quem chama `useShouldReload`** (troca a chamada incondicional a `load()`/`fetchVendas()`/`list()` dentro do `useFocusEffect` e do `useEffect([lastSync])`):
- `hooks/useProductList.ts` (compartilhado por `produtos.tsx` e `index.tsx`): observa `['produtos']`, só no efeito de `lastSync`. O efeito de `search` mudando **não é gateado** — é ação direta do usuário, sempre roda `list()`.
- `app/(tabs)/pedidos.tsx`: observa `['pedidos', 'produtos']`, tanto no `useFocusEffect` quanto no `useEffect([lastSync])`.
- `app/(tabs)/historico.tsx`: observa `['vendas', 'produtos']`, só em `fetchVendas` (o `handleSearch` por data é ação explícita do usuário, não é gateado).

## Erros e casos de borda

- **1ª carga de cada tela**: sempre roda — `ref` do `useShouldReload` começa `null`, garantidamente diferente de qualquer `changedAt` real (que começa em `0` e só cresce), então a 1ª comparação sempre retorna `true`.
- **Pull-to-refresh (`useSyncRefresh`)**: continua chamando `triggerSync()` incondicionalmente (é ação explícita do usuário, puxando a tela) — o gate só entra depois, no efeito de `lastSync` que dispara quando o sync termina. Se o servidor não tinha nada novo pra aquela tabela, `markChanged` não roda, o `useShouldReload` retorna `false`, a tela não requery, o spinner do `RefreshControl` só aparece e some — sem flash de skeleton, sem flicker.
- **Sync que falha** (`syncRes`/`changes` nulos em `useSyncDatabase.ts`): nenhum bloco de upsert roda, nenhum `markChanged` dispara — comportamento correto (nada mudou de fato).
- **Delete local**: já é uma das operações cobertas (`remove`/`removePedido`/`removeVenda` chamam `markChanged`), sem caso especial.

## Fora do escopo

- Persistir o watermark em SQLite — avaliado e descartado (ver decisões acima).
- Granularidade por linha/id — a dedupe pós-query (`isXEqual`) já cobre isso de outra forma; misturar os dois mecanismos não traz ganho claro agora.
- WebSocket realtime (sub-item 2 da Fase 5) — spec própria, ainda não brainstormada.
- Retenção local / busca histórica via API (sub-item 4B) — spec própria, ainda não brainstormada.

## Testes

Unit: `database/tableWatermark.ts` (monotonicidade estrita mesmo com `Date.now()` colidindo — mockar `Date.now` fixo e chamar `markChanged` 2x seguidas, valor final deve ser maior que o inicial) + `hooks/useShouldReload.ts` (1ª chamada sempre `true`; 2ª chamada sem `markChanged` no meio retorna `false`; observar 2 tabelas, mudar só uma ainda retorna `true`). `tsc --noEmit` limpo + `npx jest --watchAll=false` (suíte existente não deve quebrar — mudança é aditiva nos hooks/telas, não altera lógica de query).

Manual no emulador: editar um produto → confirmar `produtos.tsx` e `index.tsx` recarregam sozinhos (nome novo aparece sem puxar manualmente); criar um pedido → confirmar `pedidos.tsx` recarrega e `historico.tsx` **não** faz query nova (tabela errada, sem log de query no console); trocar de aba repetidamente sem nada mudar → sem flash de skeleton/spinner (hoje já reduzido pelo dedupe pós-query do 4A, deve ficar ainda mais perceptível por pular a query também).
