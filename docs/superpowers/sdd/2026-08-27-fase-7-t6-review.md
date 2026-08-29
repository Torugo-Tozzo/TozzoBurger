# Task 6 — Review

Reviewer: Codex (gpt-5.6-luna, reasoning_effort: max), dispatch isolado, read-only.
Diff revisado: `66d9457..4f04a5f` (commit `4f04a5f
feat-mobile-orders-watermelon-item-status`).

## Spec compliance

✅ Objetivo — WatermelonDB, `isOpen` e status por item implementados
(`database/useOrderDatabase.ts:198`, `database/types/Order.ts:25`).

✅ Arquivos — hooks, tela de pedidos, modal, componente e traduções atualizados.

❌ Passo 1 — o teste chamado "direct requested-to-delivered" passa antes por
`IN_PREPARATION` (`database/__tests__/usePedidoDatabase.test.tsx:174`,
`:185`) — não cobre de fato a transição direta que o brief pede.

✅ Passo 2 — implementação usa Query/Model API, sem SQL ou `expo-sqlite`
(`database/useOrderDatabase.ts:1`).

✅ Passo 3 — modal exibe os três status e permite alteração
(`app/modais/pedidoModal.tsx:156`, `:164`).

✅ Passo 4 — lista usa somente `isOpen`, sem `pedido.status`
(`app/(tabs)/pedidos.tsx:61`).

✅ Passo 5 — suíte focada: 6/6; suíte completa: 31/31 suites, 127/127 testes;
`tsc --noEmit` sem erros.

✅ Critérios específicos — transições não são bloqueadas
(`database/useOrderDatabase.ts:385`); pedidos fechados são filtrados por
`is_open = true` (`database/useOrderDatabase.ts:439`).

✅ Isolamento por `establishmentId` (padrão herdado do achado Important da T5) —
queries e mutações usam o estabelecimento autenticado, incluindo pedidos, itens e
produtos (`database/useOrderDatabase.ts:115`, `:147`, `:348`).

## Achados

- **[Minor]** O teste não cobre de fato a transição direta `REQUESTED → DELIVERED`
  (passa por `IN_PREPARATION` no meio) — `database/__tests__/usePedidoDatabase.test.tsx:174`.
  Deixa escapar regressão futura justamente no comportamento exigido pelo brief
  ("transicionar direto REQUESTED→DELIVERED, sem trava").
- **[Minor]** `createdByName` é descartado (sempre `null` no retorno,
  `database/useOrderDatabase.ts:100`/`:214`) embora a tela de criação ainda o envie e
  `PedidoItem` o exiba (`app/modais/contaModal.tsx:115`, `components/PedidoItem.tsx:21`).

## Veredito

**Aprovado com ressalvas (minor).** Nenhum achado Critical/Important — não entra no
fix loop, fica registrado no `plano.md` como minor parqueado pra revisão final da
branch triar antes do merge.
