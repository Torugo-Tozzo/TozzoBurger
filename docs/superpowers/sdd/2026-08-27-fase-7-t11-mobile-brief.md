# Task 11 (metade mobile) — Remoção da cor de status de pedido

Fonte: docs/superpowers/plans/2026-08-27-fase-7-sync-engine-status-categoria.md,
linhas 630-664 (seção "Task 11 — UI: remoção da cor de status de pedido (front +
mobile)"). Este brief cobre SÓ a metade mobile — a metade front é uma task
separada e maior (achado do controller: front nunca migrou pra `isOpen`/
`OrderItem.status`, T2/T3; front está sendo migrado à parte).

## Contexto (já investigado pelo controller, não precisa reconfirmar)

Diferente do que o texto original do plano sugeria, o mobile JÁ TEM o indicador de
status por item implementado — a Task 6 (já aprovada) implementou isso em
`app/modais/pedidoModal.tsx` (`ORDER_ITEM_STATUSES`, `Badge` colorido por
`REQUESTED`/`IN_PREPARATION`/`DELIVERED`, transição livre). **Não repita esse
trabalho.**

O que sobrou é só o enum/mapa de 4 cores por PEDIDO (não por item), que hoje é
morto/inútil:

- `constants/status.ts` — define `OrderStatus` (`OPEN`/`IN_PREPARATION`/
  `DELIVERING`/`CLOSED`), `getStatusColor`, `getStatusLabel`, `normalizeOrderStatus`.
  Esse tipo `OrderStatus` de 4 valores NÃO é mais usado por nenhum model real
  (`Order` usa `isOpen: boolean` desde a Task 6) — é código órfão.
- `components/PedidoItem.tsx:16-18,32-33` — usa `Colors.status.info`/
  `Colors.status.danger` (não vem de `constants/status.ts`, é outro arquivo de
  cores) pra colorir o card de pedido com base em `isOpen`. Como `pedidos.tsx` só
  lista pedidos com `isOpen: true` (Task 6), esse badge/cor SEMPRE mostra "aberto"
  — não carrega informação nenhuma, é ruído visual.
- `components/VendaItem.tsx:3,32` — importa `getStatusColor` de
  `constants/status.ts` e chama `getStatusColor('FECHADO')` (valor fixo, nunca
  muda) só pra colorir a borda do card de venda. Também vestigial.

## Objetivo desta task

1. Deletar `constants/status.ts` por completo (enum de 4 valores morto).
2. `components/PedidoItem.tsx`: remover `accentColor`/`badge` de status do
   `RecordCard` (linhas 16-18, 32-33) — o card não precisa mais indicar
   "aberto/fechado" já que todo pedido listado é sempre aberto por definição.
   Mantenha o resto do card intocado (cliente, produtos, total, ações).
3. `components/VendaItem.tsx`: remover o import de `getStatusColor` e o
   `accentColor={getStatusColor('FECHADO')}` (linha 32) — ou substitua por uma cor
   neutra fixa se o `RecordCard`/design system exigir uma `accentColor` (confirme
   olhando a assinatura de `RecordCard`; se `accentColor` for opcional, só remova a
   prop). **NÃO mexa** no indicador de `isCancelled` (linha 20, 37,
   `strikethrough={isCancelled}`) — isso é outra coisa, fora do escopo.
4. Grep no repo inteiro por `constants/status` e `getStatusColor`/`getStatusLabel`
   de `constants/status.ts` (cuidado: existe também `Badge`/`itemStatusColor` em
   `pedidoModal.tsx`, que é OUTRO arquivo de cor, pra status POR ITEM — não mexa
   nisso) antes de deletar, pra confirmar que não sobra import quebrado.
5. Rodar suíte completa + `tsc --noEmit`.

## Critérios específicos de revisão

- Nenhum código morto do mapa de 4 cores sobrou (nem tipo, nem função, nem teste
  órfão) — `constants/status.ts` não existe mais, nenhum import dele sobra.
- O indicador de status POR ITEM (`pedidoModal.tsx`, já implementado na Task 6)
  continua funcionando normalmente — não foi tocado por engano.
- O indicador de `Sale.isCancelled` em `VendaItem.tsx` continua intocado.

## Restrições globais do plano (Protocolo de execução)

- Branch de feature já existe (`feat/fase-7-sync-status-categoria`) no repo
  `TozzoBurger`. `main` intocada. Continue commitando nesta branch, só neste repo
  (esta task não mexe na api nem no front).

## Contrato de execução, sem exceção

- Sessão não-interativa: NUNCA pare pra pedir aprovação de desenho no meio da
  execução — decida o mais razoável e siga em frente, registrando a decisão.
- NUNCA dispare subagentes de nenhum tipo (nem reviewer, nem helper).
