# Task 7 — Review

## Spec compliance
✅ Objetivo — `database/useSaleDatabase.ts` e `database/salesQuery.ts` foram portados para a API do Watermelon (`database/useSaleDatabase.ts:1-19`, `database/salesQuery.ts:1-17`).

✅ Arquivos e integração — `pedidoModal.tsx` passou a usar a conversão transacional (`app/modais/pedidoModal.tsx:142-150`). As cinco telas listadas no brief não foram alteradas; `index.tsx` realmente não acessa persistência de vendas (`app/(tabs)/index.tsx:38-44`) e os demais call sites ainda encontram os métodos esperados (`app/(tabs)/historico.tsx:129-187`, `app/modais/contaModal.tsx:75-83`, `app/modais/contaHistoricoModal.tsx:91-112`, `app/modais/relatorioModal.tsx:20-31,97-101`).

✅ Passo 1 — há testes para conversão pedido→venda/fechamento, cópia de itens sem `status`, filtros locais de data/período, relatório e cancelamento (`database/__tests__/useVendaDatabse.test.tsx:209-258`, `331-386`, `408-491`).

✅ Passo 2 — a implementação usa queries Watermelon, cria `Sale`/`SaleItem` e fecha o pedido na mesma escrita (`database/useSaleDatabase.ts:250-257`, `289-316`, `334-379`).

✅ Passo 3 — a consulta local por data/período permanece somente no Watermelon, sem fallback de API (`database/useSaleDatabase.ts:507-546`, `549-567`).

✅ Passo 4 — a suíte focada, a suíte completa e `tsc --noEmit` passaram; os resultados registrados são 9, 128 e 1 snapshot aprovados (`docs/superpowers/sdd/2026-08-27-fase-7-t7-mobile-worker.md:38-48`).

✅ Critério `SaleItem` — não há `status` no tipo, modelo ou criação de `SaleItem`; `status` permanece apenas em `OrderItem` (`database/types/Sale.ts:17-23`, `database/watermelon/models/SaleItem.ts:16-24`, `database/useSaleDatabase.ts:360-373`).

✅ Isolamento — as queries e mutações de vendas, pedidos, itens, produtos e vendedores são filtradas pelo `establishmentId` autenticado, inclusive nas relações `Q.on` (`database/salesQuery.ts:148-174`, `database/useSaleDatabase.ts:111-168`, `335-343`, `471-476`, `560-575`).

❌ Critério “nenhuma tela quebrou” — a compatibilidade de assinaturas não evita regressões funcionais: a geração de venda pode copiar dados antigos do pedido, o vendedor informado pode desaparecer do detalhe e os consumidores ignoram o preço histórico salvo. Ver achados abaixo.

## Achados
- [Critical] Gerar venda ignora edições ainda não salvas no pedido — `app/modais/pedidoModal.tsx:108-116,142-150`; `database/useSaleDatabase.ts:334-379` — a tela permite alterar itens/quantidades em estado local, mas o botão de gerar passa somente o ID e o hook relê os itens e o total persistidos. Sem tocar em “Salvar”, a venda é criada com dados antigos e o pedido é fechado, descartando silenciosamente a edição exibida.
- [Critical] `createdByName` é perdido na migração — `app/modais/contaModal.tsx:75-83`; `database/useSaleDatabase.ts:264-275,322-332,474-480`; `app/modais/contaHistoricoModal.tsx:199-200` — o caller fornece o nome do vendedor, mas a implementação o descarta e tenta reconstruí-lo apenas pela coleção `users`. O fluxo atual de autenticação grava o usuário em `TB_USERS` (`context/AuthContext.tsx:140-145,184-189`), portanto o detalhe local pode omitir silenciosamente o vendedor que antes era exibido.
- [Important] Paginação não é aplicada na query Watermelon — `database/useSaleDatabase.ts:250-257,507-515` — `page`/`limit` ficam apenas no objeto auxiliar; a consulta carrega todas as vendas correspondentes e só depois filtra/slice em memória. Cada página do histórico pode varrer e materializar a coleção inteira, regressão de custo em relação ao `LIMIT/OFFSET` anterior.
- [Minor] O teste de isolamento do cancelamento não comprova isolamento — `database/__tests__/useVendaDatabse.test.tsx:456-490` — ele cancela a venda antes de trocar o estabelecimento e depois verifica novamente `isCancelled: true`; uma implementação que também mutasse a venda estrangeira passaria. Falta testar uma venda inicialmente não cancelada após a troca de estabelecimento.

## Veredito
Reprovado (há duas falhas Critical no fluxo de geração e na preservação do vendedor).
