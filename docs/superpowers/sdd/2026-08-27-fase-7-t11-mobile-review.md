# Task 11 (mobile) — Review

## Spec compliance

✅ `constants/status.ts` foi removido por completo; o teste do módulo também não existe mais (`constants/status.ts:1`, `constants/__tests__/status.test.ts:1`, ambos ausentes no HEAD). O grep independente por `constants/status`, `getStatusColor` e `getStatusLabel` não encontrou referências executáveis no código rastreado; as ocorrências restantes são apenas documentação/logs históricos.

✅ `PedidoItem` não mantém mais estado, label, cor ou badge de status. O `accentColor` restante é neutro e obrigatório na API de `RecordCard` (`components/PedidoItem.tsx:29`, `components/ui/RecordCard.tsx:21-27`); cliente, produtos, total, horário e ações permanecem no card (`components/PedidoItem.tsx:30-35`).

✅ `VendaItem` não importa nem chama `getStatusColor`; usa apenas a cor neutra fixa exigida pelo `RecordCard` (`components/VendaItem.tsx:1-4,32`).

✅ O indicador de status por item continua intacto, incluindo `ORDER_ITEM_STATUSES`, `itemStatusColor` e os `Badge` de `REQUESTED`/`IN_PREPARATION`/`DELIVERED` (`app/modais/pedidoModal.tsx:19-41,181-195`). O commit alterou somente seis arquivos e não tocou esse modal.

✅ O indicador de cancelamento de venda permanece intacto: `isCancelled` continua controlando ações e `strikethrough={isCancelled}` (`components/VendaItem.tsx:20,25-27,37`).

✅ Os testes removidos eram do código morto: o teste dedicado ao status do pedido e o teste de `getStatusColor` não existem mais; o teste de i18n foi ajustado para garantir ausência do badge (`components/__tests__/task7cI18n.test.tsx:107-129`). A suíte completa passou com 35 suítes, 152 testes e 1 snapshot; `tsc --noEmit` também passou.

## Achados

Nenhum achado

## Veredito

Aprovado
