# Fase 7 — Task 6: hook de pedidos no WatermelonDB

Data: 2026-08-27  
Repositório: `C:\RN\TozzoBurger`  
Branch: `feat/fase-7-sync-status-categoria`  
Base efetiva: `66d9457` (Task 5 aprovada; o HEAD também contém apenas o
relatório posterior de Tasks 4–5)

## O que mudou

### Hook de pedidos

- `database/useOrderDatabase.ts` foi reescrito para usar a Query/Model API do
  WatermelonDB; não há mais `expo-sqlite`, SQL cru ou `prepareAsync` nesse hook.
- O estabelecimento autenticado é obtido com `useAuth()` e aplicado em toda
  leitura, listagem, busca de produto usada pelo pedido, atualização e remoção.
  A busca interna equivale a `findOrder(id, establishmentId)`.
- `createOrder()` grava `isOpen: true` por padrão e sempre cria itens com
  `status: 'REQUESTED'`.
- `updateOrder()` preserva o status do item quando omitido e permite qualquer
  transição explícita entre `REQUESTED`, `IN_PREPARATION` e `DELIVERED`,
  inclusive o salto direto para `DELIVERED`.
- Fechar com `isOpen: false` atualiza o model e as queries das listas filtram
  `is_open = true`, fazendo o pedido desaparecer imediatamente.
- `createFromSync()` preserva IDs/timestamps Watermelon, aplica o default de
  item solicitado e rejeita payload de outro estabelecimento.
- `markChanged('orders')` foi mantido nas mutações para preservar o mecanismo
  existente de `database/tableWatermark.ts` + `useShouldReload`; esses arquivos
  não foram alterados nesta task.

### Tela e modal

- `app/(tabs)/pedidos.tsx` filtra defensivamente os dados carregados por
  `isOpen` e não lê status textual do pedido.
- `app/modais/pedidoModal.tsx` deixou de usar `ORDER_STATUS`; usa `isOpen` para
  manter pedido fechado somente leitura e exibe `Badge` para o status de cada
  item, com três opções selecionáveis para usuários autorizados.
- `components/PedidoItem.tsx` passou a derivar o rótulo visual do booleano
  `isOpen`, sem depender do status antigo.
- As traduções `requested` e `delivered` foram adicionadas aos seis locales.

## Testes adicionados/adaptados

`database/__tests__/usePedidoDatabase.test.tsx` usa SQLite Watermelon real em
memória (não mock raso) e cobre:

- pedido novo aberto e item novo `REQUESTED`;
- `REQUESTED` → `IN_PREPARATION`;
- salto direto `REQUESTED` → `DELIVERED`;
- fechamento com `isOpen: false` e remoção da lista aberta;
- isolamento A/B em listagem, busca, contagem, leitura, atualização e remoção;
- sync com default de status e rejeição de pedido de tenant estrangeiro.

Os testes existentes dos cards foram adaptados para o contrato `isOpen`.

## Contrato público

Os exports do hook, aliases em português, ordem/quantidade dos parâmetros e
formatos de retorno foram preservados. A mudança de domínio é apenas a
substituição do quarto estado textual do pedido por `isOpen`; o status agora
faz parte de `OrderItem`.

## Verificações finais reais

### Suíte completa

Comando executado exatamente:

```text
npx jest --watchAll=false --runInBand
```

Resultado:

```text
Test Suites: 31 passed, 31 total
Tests:       127 passed, 127 total
Snapshots:   1 passed, 1 total
exit code: 0
```

Os logs de falha do checker de i18n são fixtures negativas cobertas pelo
próprio teste; não representam falha da suite. O fallback do adapter JSI no
Node também é o comportamento esperado do ambiente Jest.

### TypeScript

Comando executado exatamente:

```text
npx tsc --noEmit
```

Resultado: nenhum erro TypeScript, `exit code: 0`.

Este relatório não deve ser incluído no commit da implementação.
