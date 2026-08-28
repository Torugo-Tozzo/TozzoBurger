# Task 7 — Re-review (fix round 1)

## Findings da revisão original
- [Critical] Gerar venda ignora edições não salvas: ADDRESSED — `PedidoModal` serializa o estado atual dos itens (`app/modais/pedidoModal.tsx:65-69`) e aguarda `updateOrder` antes de chamar `createSaleFromOrder` (`app/modais/pedidoModal.tsx:142-151`). A conversão relê o pedido e seus itens persistidos (`database/useSaleDatabase.ts:387-405`).
- [Critical] createdByName perdido: ADDRESSED — o nome agora é gravado na criação direta, na conversão e no sync (`database/useSaleDatabase.ts:343-349,401-406,472-480`), o schema/migration adicionam `sales.created_by_name` (`database/watermelon/schema.ts:54-66`, `database/watermelon/migrations.ts:1-12`) e a leitura usa o valor persistido, com fallback para registros antigos (`database/useSaleDatabase.ts:174-194,529-535`). A tela continua exibindo o campo (`app/modais/contaHistoricoModal.tsx:199-200`).
- [Important] Paginação em memória: ADDRESSED — `buildLocalSalesQuery` inclui `Q.take`/`Q.skip` (`database/salesQuery.ts:196-204`), `fetchSales` executa essas cláusulas (`database/useSaleDatabase.ts:258-265`) e os caminhos de resumo/listagem completa percorrem páginas Watermelon (`database/useSaleDatabase.ts:284-315`).

## Quebras novas no diff de correção
- [Important] Paginação incorreta quando há filtro de horário — `listRecentSales` aplica `Q.take`/`Q.skip` antes de filtrar `query.matchesTime` (`database/useSaleDatabase.ts:577-578`), enquanto o matcher de horário permanece em memória (`database/salesQuery.ts:121-137`). Com 50 vendas mais recentes fora do horário e uma venda válida na posição 51, a resposta pode trazer `sales: []` mas `total: 1`; o filtro de horário é exposto pela tela de histórico (`app/(tabs)/historico.tsx:187-197`, `components/VendasFilterModal.tsx:101-125`).
- [Important] Total da venda pode divergir dos preços dos itens ao gerar um pedido — o novo `updateOrder` incondicional (`app/modais/pedidoModal.tsx:145-146`) recalcula o total com os preços atuais (`database/useOrderDatabase.ts:360-365`), mas não atualiza `unitPriceAtOrder` dos itens existentes (`database/useOrderDatabase.ts:387-393`). A conversão então grava esse total atualizado e o preço unitário antigo (`database/useSaleDatabase.ts:401-425`), produzindo inconsistência quando o produto mudou de preço enquanto o pedido estava aberto; o mesmo lookup também pode retornar zero para IDs não locais (`database/useOrderDatabase.ts:124-133`).

## Veredito
Ainda há findings abertos: as duas quebras novas Important listadas acima.
