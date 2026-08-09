# Unificação visual das listas (pedidos/histórico) + polish produtos-venda

> Data: 2026-08-09. Branch: `feat/design-system-mobile-listas` (a partir de `feat/design-system-mobile`, não de `dev` — depende dos tokens/componentes da Fase 5, ainda não mergeados; rebasear pra `dev` depois que a Fase 5 mergear).

## Contexto

Achado do QA manual da Fase 5 (2026-08-08, registrado em `plano.md`): cada uma das 3 telas de lista usa um padrão de card/botão diferente, porque a Fase 5 retokenizou cor mas não redesenhou layout/estrutura por tela. Pedido explícito do usuário: aproximar o máximo possível do estilo já fechado no site (`front/front-tozzo.uk`, Fase 4 — tabela com barra de cor por status, divisor tracejado, `IconButton` ghost à direita).

Auditoria feita nesta sessão (read-only, 3 telas mobile + componentes do site):

- **`pedidos.tsx`** → `PedidoItem.tsx`: já usa `Card`/`Badge` (Fase 5), mas achado um bug — recebe prop `onDelete` desde sempre e nunca renderiza nenhum botão de excluir no JSX. Hoje não existe forma de excluir pedido pela lista.
- **`index.tsx`** (produtos/venda) → `ProductItemVenda.tsx`: já usa `Card`/`Badge`, mas é conceitualmente diferente — card de catálogo pra adicionar à conta (nome+preço+badge tipo+quick-add+botão redondo), não registro com status/ações de editar/excluir.
- **`produtos.tsx`** (gerenciamento/CRUD, tela separada de `index.tsx`) → `Product.tsx`: **achado durante o planejamento**, não coberto no brainstorm original. Usa `Card`/`Badge` mas as ações de editar/excluir são `TouchableOpacity`+`FontAwesome` cru (`Product.tsx:38-46`), sem o `IconButton` novo — mesmo problema de inconsistência da leva. Entra no mesmo tratamento de polish do `ProductItemVenda.tsx` (mesma categoria de fix já aprovada, não é decisão de design nova).
- **`historico.tsx`**: **não** usa nenhum componente da Fase 5 — `StyleSheet` cru próprio, 3 `TouchableOpacity` quadrados coloridos (ver/imprimir/excluir), tipografia e cores hardcoded ignorando `spacing`/`type`/`radius`/tokens.
- **Site** (`PedidosTab.tsx`/`VendasTab.tsx`): `Card > Table > TableRow` com barra de cor à esquerda via `box-shadow` inset (`accentColor`, status do pedido; fixo cinza — `getStatusColor('FECHADO')` — pras vendas, que não têm status), divisor tracejado entre linhas, coluna de ações à direita com `IconButton` ghost (`Printer`/`Pencil`/`Trash2` pedidos; `Printer`/`Eye` vendas — vermelho no destructive).
- **Dado disponível não usado**: `PedidoDatabase`/`VendaDatabase` (SQLite local) já têm `criado_por`, nunca renderizado em nenhuma tela.

## Decisão de escopo (brainstorm 2026-08-09)

Componente compartilhado só entre **pedidos + histórico** (ambos são "registro com ações", análogo direto das tabelas do site). **Produtos/venda mantém a estrutura de card de catálogo** — não vira linha de tabela, já que semanticamente não é um registro com status. Recebe só polish visual (mesma borda/espaçamento/botão) pra não destoar das outras duas.

Alternativas descartadas: (a) forçar os 3 no mesmo componente de linha — produto sem status viraria "linha de tabela vazia", estranho pro fluxo de toque rápido de adicionar item; (b) sem componente compartilhado, só convenção copiada nos 2 arquivos — não resolve a causa raiz do achado (é exatamente o que já aconteceu uma vez).

## Componentes novos (`components/ui/`)

### `IconButton.tsx`

Espelha `icon-button.tsx` do site. Botão quadrado ghost (sem fundo, ícone centralizado, leve scale ao pressionar via `Pressable`). Props: `icon`, `label` (acessibilidade), `onPress`, `disabled?`, `destructive?` (ícone vermelho — usado no excluir).

### `RecordCard.tsx`

O componente compartilhado entre pedidos e histórico. Props:

```
accentColor: string        // barra de 4px à esquerda — cor de status
title: string               // cliente
subtitle?: string           // resumo de itens (cinza, trunca)
meta?: string                // "Criado por X · HH:mm"
total: number                 // formatado em negrito, alinhado à direita
strikethrough?: boolean         // venda excluída — reaproveita o line-through já existente
actions: Array<{
  icon: ReactNode
  label: string
  onPress: () => void
  disabled?: boolean
  destructive?: boolean
  loading?: boolean            // spinner no lugar do ícone (ex: imprimindo)
}>
```

Estrutura: `Card` com `padding={0}`, barra de cor via `View` posicionada absoluta à esquerda (não `borderLeftWidth` — mesmo motivo do site: evita disputa visual com a borda de 1px do `Card` via colisão de espessura), divisor tracejado embaixo (`borderStyle: 'dashed'`).

## Migração por tela

### `PedidoItem.tsx` → usa `RecordCard`

- `accentColor = getStatusColor(status)` (dinâmico, 4 estados — já existe).
- `title` = cliente, `subtitle` = resumo de produtos (já existia, só muda de lugar).
- `meta` = `Criado por ${criado_por} · ${hora}` — campo novo exibido, dado já existe no banco local.
- `actions`: editar (`pencil`, sempre habilitado) + excluir (`trash`, `destructive`) — **corrige o bug do `onDelete` morto**: agora o array de ações renderiza de verdade, `handleDelete` (já existe em `pedidos.tsx`) passa a ter efeito.
- Sem ícone de impressão — mobile não imprime pedido (só conta/venda via `contaModal`/`contaHistoricoModal`). Diferente do site, que mostra o ícone desabilitado como aviso de feature futura; não replico um botão sem função nenhuma no app.

### `historico.tsx` → extrai `VendaItem.tsx` novo, usa `RecordCard`

- Novo arquivo `components/VendaItem.tsx` recebe a `venda` + callbacks (`onView`, `onPrint`, `onDelete`) e monta o `RecordCard`.
- `accentColor` fixo (`getStatusColor('FECHADO')` — mesmo valor usado pelo site em `VendasTab`, já que venda não tem status próprio como pedido).
- `subtitle` = resumo de itens vendidos (`item.produtos.join(', ')` — já existe hoje como linha "Itens: ...", só migra de lugar, mesmo tratamento de truncar que `PedidoItem` já tem).
- `meta` = `Criado por ${criado_por} · ${hora}` (mesmo padrão do pedido — campo também nunca exibido em histórico hoje).
- `actions`: ver (`eye`) → imprimir (`print`, **funcional** — mobile tem impressora térmica BLE que o site ainda não tem, `loading` durante `handlePrint`) → excluir (`trash`, `destructive`) — mantém as 3 ações que já existem, só troca a casca visual.
- `strikethrough` quando `item.excluida`.
- `historico.tsx` fica só como orquestrador (busca por data, calendário, agrupamento) — sem JSX de linha embutido. `StyleSheet` interno reduz drasticamente (só o que sobra: calendário/modal de data/botão buscar).

### `ProductItemVenda.tsx` e `Product.tsx` — só polish, sem trocar estrutura

Nenhum dos dois vira `RecordCard` (catálogo de produto, não registro com status). Só ganham a mesma linguagem de botão/borda:

- **`ProductItemVenda.tsx`**: mantém layout (nome+preço, badge tipo, flash quick-add, botão + redondo). Botão + redondo passa a usar o `IconButton` novo (variante circular) em vez do estilo `addButton` duplicado hoje (`ProductItemVenda.tsx:80`).
- **`Product.tsx`**: mantém layout (nome+preço, badge tipo, editar+excluir). Os 2 `TouchableOpacity`+`FontAwesome` crus (`Product.tsx:38-46`) viram 2 `IconButton` (editar = ghost normal, excluir = `destructive`) — mesmo componente usado nas ações do `RecordCard`, garantindo que o botão de excluir tenha a cara idêntica em pedidos/histórico/produtos.
- Ambos ajustam borda do `Card` pra bater espessura/cor com o `RecordCard` novo.

## Fora do escopo

- **Realtime via WebSocket** (sinal instantâneo de mudança substituindo o gatilho atual de foreground/reconexão/refresh manual) — decidido nesta mesma sessão, mas é mudança de arquitetura (API + app), spec própria depois desta.
- Qualquer mudança de comportamento de sync/dados — é reforma visual + 1 bug fix (delete morto em pedidos) + 1 exposição de dado já existente (`criado_por`). Não mexe em `syncGuard`/`AutoSyncContext`/payload de sync.
- Coluna "criado por" no site não é tocada (já existe lá).

## Testes

Sem teste de snapshot/render novo (Fase 5 também não teve — só lógica de `getStatusColor`, já coberta). Ao final: `tsc --noEmit` limpo, `npx jest --watchAll=false` (suíte existente não deve quebrar — nenhuma mudança em lógica de dados/hooks), validação visual manual no emulador Android (já de pé nesta sessão) nas 3 telas, light + dark mode.
