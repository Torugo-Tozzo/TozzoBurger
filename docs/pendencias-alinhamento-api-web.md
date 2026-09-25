# Alinhamento do mobile com API e web

**Criado em:** 2026-09-25. Este é o registro contínuo das diferenças de produto e contrato. Nenhuma linha significa que a funcionalidade já foi implementada no mobile. A implementação atual continua concentrada na API e na web. Veja o [plano da mudança de negócio](../../api-tozzo.uk/proximas-etapas/002-plataforma-multinicho/README.md).

## Como manter este arquivo

Em **toda entrega na API ou web**, antes de encerrar:

1. Revisar se surgiram campos, valores de enum, endpoints, telas ou regras que afetam o mobile, mesmo quando o escopo da entrega é apenas API/web.
2. Adicionar ou atualizar uma linha abaixo com data, origem (arquivo/commit), impacto no app instalado, compatibilidade da API, ação mobile e verificação pendente. Escrever `sem impacto mobile` quando a revisão concluir isso, com motivo, para não depender da memória.
3. Não marcar como concluído por existir no backend ou na web. Fechar a linha somente depois de código mobile, migration local quando necessária, teste automatizado e homologação no Android; registrar commit/build e resultado.
4. Para contratos novos, conferir `/openapi.json` e testes HTTP reais. A documentação gerada ainda tem respostas `t.Any()`; não inferir payload apenas pela UI Scalar.

Estados: **Confirmado** = diferença encontrada no código; **Verificar** = há mudança recente, mas o efeito exato no app precisa de teste; **Planejado** = mudança futura no plano da API/web; **Concluído** = entregue e validado no dispositivo.

## Diferenças atuais

| ID | Estado | Origem API/web | Evidência no mobile e ação necessária | Aceite mobile |
| --- | --- | --- | --- | --- |
| M01 | Confirmado, prioridade alta | API `OrderItemStatus.READY`, `modules/kitchen/*`, sync `order_items.status`; web `KitchenPage.tsx` (2026-09-22/23) | `database/watermelon/models/OrderItem.ts`, `database/types/Order.ts`, `database/useOrderDatabase.ts` e `app/modais/pedidoModal.tsx` aceitam apenas `REQUESTED`, `IN_PREPARATION`, `DELIVERED`. Definir compatibilidade do pull para apps instalados, adicionar `READY` no app novo, preservar prontidão em pushes antigos e testar cozinha/perfil `COOK`. | Pull real com item `READY`; editar/sincronizar sem erro nem regressão de status; tela e ações de cozinha com papel autorizado, se incluídas na entrega mobile. |
| M02 | Confirmado | API `Product.productTypeId` opcional; web `ProductsPage.tsx` usa opção “sem tipo” (mudança recente) | `app/modais/produtoModal.tsx` ainda bloqueia salvar sem `productTypeId`. Remover obrigatoriedade no formulário, enviar `null`/omitir conforme contrato, exibir “Não informado”, conferir filtros, relatórios e sync de produtos com tipo nulo. | Criar, editar, puxar e vender item sem tipo; app não cria tipo artificial. |
| M03 | Confirmado/Verificar | Método de pagamento em `Sale.paymentMethod`; web mostra em vendas/recibos (2026-09-22) | Não há uso de `paymentMethod` em `app/`, `services/` ou `database/`. Planejar captura/exibição conforme o fluxo mobile e testar que pushes antigos não limpam o campo do servidor. Verificar antes a regra para venda offline e métodos aceitos pela API. | Venda mobile com método correto quando o contrato offline estiver definido; venda antiga permanece válida; recibo/histórico consistentes. |
| M04 | Confirmado/Verificar | `modules/delivery/*`, despacho e motorista; web `DeliveriesPage.tsx` (2026-09-23/24) | Não há fluxo próprio de entregas em `app/(tabs)/`. `database/watermelon/schema.ts` não contém campos de despacho da ordem. Mapear o contrato, decidir suporte offline e incluir tela/ações somente depois da API estável; verificar se pulls antigos já ignoram os campos sem sobrescrevê-los. | Pedido para entrega e despacho visualizados corretamente; atribuição, início e conclusão testados; app antigo não regride pedido. |
| M05 | Confirmado | `modules/calendar/*`, horário de funcionamento e escala; web `SchedulePage.tsx`/`BusinessHoursPanel.tsx` (2026-09-24) | Não há tela de calendário/escala no mobile; `database/watermelon/schema.ts` não tem essas entidades. Definir se primeira versão mobile será leitura online ou terá armazenamento offline e migration; manter edição separada de cadastro de funcionário. | Semana/mês e turnos, expediente, fuso e alterações concorrentes validados no Android conforme escopo decidido. |
| M06 | Verificar | Papel `COOK` criado na API/web | `services/legacyWire.ts` não mapeia `COOK`; fallback é `EMPLOYEE`. Revisar autenticação, navegação e permissões do app antes de habilitar esse papel no mobile. | Usuário `COOK` vê apenas telas autorizadas; chamadas proibidas falham de forma clara. |
| M07 | Verificar | Tipos de produto agora pertencem a um estabelecimento (`2026-09-21`) | `product_types` existe no WatermelonDB e o onboarding mobile ainda usa a categoria antiga. Verificar pull/push com dois estabelecimentos, IDs UUID e troca de conta; não presumir que os testes existentes cobrem a migration recente da API. | Tipos e produtos não vazam entre estabelecimentos; troca de conta preserva isolamento. |
| M08 | Planejado | Novo plano de perfis múltiplos e menu configurável da API/web | `app/onboarding.tsx` e `services/categoryOnboarding.ts` hoje escolhem **uma** categoria de alimentação e criam tipos sugeridos. Após o contrato novo, adicionar perfis múltiplos, edição em Configurações e menu por módulos, mantendo o campo legado até migração segura. | Alimentação + Serviços aparecem juntos; mudar perfil não apaga dados; Vendas fica disponível; papéis continuam restritos. |
| M09 | Planejado | Separação `TB_MENU_ITEMS` / `TB_PRODUCTS` / `TB_SERVICES` e serviço com orçamento/prazo | `database/watermelon/schema.ts` tem apenas `products`; `order_items` e `sale_items` usam `product_id`. Planejar migration incremental do WatermelonDB, adapter do sync legado e telas de Cardápio, Produtos e Serviços. Não resetar SQLite para contornar migração. | Upgrade em base instalada, IDs e histórico preservados; mobile antigo ainda sincroniza alimentação; serviços fecham em venda sem cozinha. |
| M10 | Em andamento | OpenAPI/Scalar na API (2026-09-25) | `/api-docs` já usa Scalar e `/openapi.json` lista as rotas; `/swagger.json` foi removido sem consumidores. Cozinha, entregas e calendário receberam resumo, tag e segurança. Ainda há 63 respostas 200 com schema vazio. A Etapa 4 ensaiará `fromTypes` e DTOs HTTP; usar testes de contrato como fonte até lá. | Endpoints que o mobile consumir têm requests, responses, erros e segurança documentados e comparados a HTTP real. |

O app mobile **não está inteiramente parado**: já usa GoTrue, possui onboarding de categoria única, catálogo de alimentação, pedidos, vendas e sync offline. Os itens acima registram diferenças comprovadas ou que exigem ensaio, sem presumir que toda mudança recente esteja ausente.

## Ordem sugerida para a retomada mobile

1. **Compatibilidade imediata:** M01, M02, M03 e M07, priorizando o app instalado e a preservação de dados no sync.
2. **Fluxos recentes:** M04, M05 e M06 depois de confirmar contratos e definir o que funciona offline.
3. **Novo modelo de negócio:** M08 e M09 após as etapas correspondentes da API/web e publicação de um contrato de sync compatível.
4. **Homologação:** executar Jest, build debug, upgrade sobre banco local já populado, sync com a API de homologação em estabelecimento de teste isolado, troca de conta, perda/retorno de rede e testes de interface em dispositivo/emulador. Impressão Bluetooth requer hardware para aceite físico. Registrar versão do APK, ambiente e resultado aqui.

## Registro de entregas futuras

| Data/commit API ou web | Mudança e contrato | Impacto mobile / estado | Código mobile | Teste e homologação |
| --- | --- | --- | --- | --- |
| 2026-09-25, planejamento | Perfis múltiplos, cardápio/loja/serviços; plano em `api-tozzo.uk/proximas-etapas/002-plataforma-multinicho/` | M08/M09, planejado; ainda sem endpoint novo | Nenhum | Aguardando implementação API/web |
| 2026-09-25, API `90dae1c` | `@elysia/openapi` + Scalar em `/api-docs`; JSON em `/openapi.json`, 65 operações; `/swagger.json` removido | M10, em andamento; app instalado não consome a documentação | Nenhum | 337 testes API, typecheck, Prisma validate e página no Chromium; schemas de resposta ainda pendentes |

Adicionar uma linha por entrega; atualizar IDs acima quando a mesma entrega avançar. Em cada fechamento, anexar referência ao contrato OpenAPI ou teste HTTP, migration WatermelonDB se houver, commit mobile e evidência de homologação.
