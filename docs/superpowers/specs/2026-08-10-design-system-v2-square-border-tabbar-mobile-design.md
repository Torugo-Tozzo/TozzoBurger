# Design system mobile v2 — borda quadrada preto/branco + tab bar + ícones (Fase 5, sub-item 1, rodada 2)

> Data: 2026-08-10. Branch: `feat/design-system-mobile-listas` (mesma leva grande da Fase 5 — ver `plano.md`). Segunda rodada sobre o design system mobile original (sub-item 1, já implementado, PR não aberto ainda): troca a linguagem visual de "cantos arredondados + borda cinza" pra "cantos quadrados + borda preto/branco (por tema)", redesenha a tab bar (fundo sólido na aba ativa) e reorganiza os ícones das 3 abas principais.

## Contexto

Pedido do usuário, direto: tirar canto arredondado, colocar borda preto/branco (dependendo do tema) em basicamente todo componente visual incluindo a tab bar, aba ativa ganha fundo preto (light)/branco (dark) com ícone invertido, e trocar os 3 ícones das abas principais (Index vira casinha, Vendas vira `$`, Pedidos vira recibo).

Brainstorm usou o companion visual (mockups em browser) pras 2 decisões de forma (peso de borda, formato do fundo ativo) — 2 telas, ambas resolvidas em 1 clique cada. Resto das decisões (escopo, normalização de divisor, simplificação do Button) resolvido em texto no terminal.

## Decisões do brainstorm (2026-08-10)

- **Peso de borda**: 1px fino (opção A do mockup) — mais próximo do que já existe hoje (`Card` já usa `borderWidth:1`), menos ruptura visual que 2px.
- **Formato do fundo da aba ativa**: segmento cheio (opção B do mockup) — ícone + label inteiro viram um bloco só com fundo preto (light)/branco (dark), não só um chip atrás do ícone.
- **Escopo da varredura**: tudo, sem exceção — Card, Button, ListItem, RecordCard, Badge, EmptyState (sem borda hoje, fica sem), Input, FiltroTipos, IconButton, Skeleton/RecordCardSkeleton/ProductCardSkeleton, e todos os modais (`pedidoModal`, `contaModal`, `relatorioModal`, `contaHistoricoModal`, `produtoModal`, `adicionalModal`, `IngredientesModal`), `configs.tsx`, `login.tsx`.
- **Regra de divisor, revista em cima de feedback ao vivo**: tracejado marca divisão *entre linhas/seções* (dentro de uma lista ou dentro de um card); sólido 1px marca *perímetro* (borda externa/lateral de um bloco). Aplicado assim:
  - **Listas de produtos/pedidos/vendas viram lista contínua, sem espaço entre os itens** — cada card hoje tem borda sólida nos 4 lados e um `gap`/`marginBottom` pro próximo; isso muda pra: 1 borda sólida 1px só, no perímetro do bloco inteiro (lista inteira, ou cada grupo de data em `pedidos.tsx`/`historico.tsx`, que são separados por cabeçalho de data), e uma linha tracejada dividindo uma linha da próxima *por dentro* do bloco — igual ao padrão de tabela do site (`front-tozzo.uk`, Fase 4: "divisor tracejado entre linhas simples").
  - **`RecordCard.actionsRow`** (divisor interno entre o conteúdo principal do card e a fileira de ações): já é tracejado hoje — **mantém tracejado** (reverte a ideia inicial de normalizar pra sólido; com a regra revista, esse também é "divisão interna", não perímetro).
  - **`ListItem`** (usado em `pedidoModal.tsx`/`contaHistoricoModal.tsx` pra listar produtos de um pedido/venda dentro do modal): já é só uma linha com borda embaixo (sem card próprio) — exatamente o formato final. Só troca `borderBottomWidth: StyleSheet.hairlineWidth` (fino, sólido) pra `borderBottomWidth: 1, borderStyle: 'dashed'`.
- **`Button.tsx` variant primary**: hoje tem estrutura dupla aninhada (`frame`/`line`/`content`, 3 `View`s) pra imitar contorno grosso com canto arredondado. Simplifica pra 1 `View` só (igual `Card`) — a estrutura dupla só fazia sentido pra imitar contorno grosso, que não é mais o estilo (1px fino ganhou no mockup).
- **Ícones das 3 abas principais**: Index (hoje `dollar`/`cutlery` dependendo do role) → `home`; Vendas/histórico (hoje `clock-o`) → `dollar` (herda o ícone que saiu do Index); Pedidos (hoje `list`) → recibo. Labels **não mudam** — Index continua "Vender"/"Cardápio" por role, só o ícone da tab bar muda.
- **Ícone de recibo**: FontAwesome clássico (`@expo/vector-icons/FontAwesome`, usado hoje em todo o app) não tem ícone de recibo/nota fiscal. Usa `MaterialIcons` (`receipt-long`) só pra essa aba — mistura de família de ícone pontual, resto do app continua FontAwesome.

## Arquitetura

**A maior parte da mudança é troca de token, não edit componente-por-componente** — 21 arquivos já referenciam `radius.*`/`colors.border` em vez de valor fixo, então trocar o valor do token propaga sozinho.

### `constants/theme.ts`
```ts
export const radius = {
  sm: 0,
  md: 0,
  lg: 0,
  full: 0,
};
```
Zera os 4 tokens. Propaga automático pra: `Card`, `Button` (frame+line+content), `Badge` (pill vira quadrado), `Input`, `FiltroTipos`, `Skeleton` (default `borderRadius=radius.sm`), `RecordCardSkeleton` (usa `radius.full` num pedaço), `ProductCardSkeleton`, e os modais que usam esses tokens.

### `constants/Colors.ts`
```ts
light: { ..., border: '#000', ... },
dark: { ..., border: '#fff', ... },
```
Troca só o valor de `border` (hoje `#e2e2e2`/`#333`, cinza) pro preto/branco puro — mesmo valor que `primary`/`text`/`tint` já usam. Propaga automático pra todo componente que já usa `colors.border` (21 arquivos, incluindo os modais).

**Não precisa de token novo** — reaproveita `border` (semântica já é "cor de borda") e `text`/`primary` (já são preto/branco puros) onde já usados.

### `components/ui/IconButton.tsx`
Único lugar com `borderRadius: 8` fixo (não token) — troca pra `radius.md` (import de `@/constants/theme`). Sem efeito visual hoje (não tem fundo/borda visível no estado normal, só round no touch target), mas fecha a consistência.

### `components/ui/Button.tsx`
Simplifica a `View` tripla (`frame`/`line`/`content`) do `variant='primary'` pra 1 `View` só, com `borderWidth:1`, `borderColor: colors.text`, `backgroundColor: colors.text`, texto `colors.background` — mesmo padrão do resto (borda 1px direta). Variant `outline` já usa `borderColor: colors.text` — sem mudança de cor, só o radius zera via token.

### `components/ui/ListItem.tsx`
Troca `borderBottomWidth: StyleSheet.hairlineWidth` pra `borderBottomWidth: 1, borderStyle: 'dashed'` — cor já vem de `colors.border` (token), só muda largura+estilo da linha.

### Listas viram contínuas — `Card`, `RecordCard`, `Product`, `ProductItemVenda`, skeletons, 4 telas

**`components/ui/Card.tsx`** ganha uma prop nova, `bordered?: boolean` (default `true`, preserva comportamento atual pra qualquer uso futuro fora de lista). Todo uso hoje em código (não em doc histórico) é dentro de uma lista — `RecordCard.tsx`, `Product.tsx`, `ProductItemVenda.tsx`, `RecordCardSkeleton.tsx`, `ProductCardSkeleton.tsx` — todos passam `bordered={false}` (perdem a borda própria de 4 lados; mantêm padding/fundo).

**Novo**: componente pequeno compartilhado (`components/ui/ListDivider.tsx` ou similar) — só a linha tracejada 1px, cor `colors.border`, reaproveitado nos 2 padrões abaixo.

**Novo**: wrapper de perímetro — `View` com `borderWidth:1, borderColor: colors.border` em volta do bloco de itens (lista inteira ou grupo de data), aplicado direto nas 4 telas (não precisa virar componente próprio, é 1 `View` simples por tela).

**Onde aplica**:
- `produtos.tsx`/`index.tsx` (via `useProductList`, `FlatList` plana, sem agrupamento): `FlatList` ganha `ItemSeparatorComponent={ListDivider}`, envolvida numa `View` com borda de perímetro.
- `pedidos.tsx`/`historico.tsx` (agrupado por data, itens renderizados via `.map()` dentro do `renderItem` da `FlatList` externa, não outra `FlatList` aninhada): cada grupo de data ganha a `View` de perímetro envolvendo os itens daquele dia, e o `.map()` intercala `ListDivider` entre um item e o próximo (sem divisor antes do primeiro nem depois do último).

**`RecordCard.tsx`**/`Product.tsx`/`ProductItemVenda.tsx`: só muda a prop passada pro `Card` (`bordered={false}`) — resto do componente (accent bar de status, `actionsRow` tracejado, badges, ícones) não muda.

### Tab bar (`app/(tabs)/_layout.tsx`)
`tabBarActiveTintColor`/`tabBarInactiveTintColor` sozinhos não dão pra pintar um fundo atrás de ícone+label juntos — precisa de `tabBarButton` customizado por `Tabs.Screen` (ou um componente compartilhado usado nos 5), recebendo `focused` e envolvendo ícone+label numa `View` com `backgroundColor: focused ? colors.text : 'transparent'` e cor de conteúdo invertida quando `focused` (`colors.background` no lugar de `colors.text`). Ícones trocam: `index` → `home`, `historico` → `dollar`, `produtos` mantém (`book`), `pedidos` → `MaterialIcons`/`receipt-long` (precisa de branch de família de ícone no componente do botão da tab, já que os outros usam `FontAwesome`).

## Fora do escopo

- `Badge.tsx` mantém o fundo colorido (vermelho/âmbar/azul/cinza por status) — só a moldura (radius+cor de borda) muda, a cor de status continua a mesma.
- `EmptyState.tsx` não tem borda/radius hoje — fica assim, nada a mudar.
- Paleta categórica do gráfico de relatório e `tipoColors` (cores de tipo de produto) — multi-hue de propósito, não fazem parte dessa reforma preto/branco (mesma exceção já registrada na Fase 5 original).
- Header superior (`headerShown`/`SyncIndicator`) — não mencionado no pedido, fora de escopo desta rodada.

## Testes

Mudança é quase inteiramente visual/estilo — sem lógica nova. `tsc --noEmit` limpo + `npx jest --watchAll=false` (suíte existente não deve quebrar, nenhum teste hoje cobre estilo/JSX de componente visual). Validação real é manual no emulador: conferir os componentes com borda visível (Card/Input/FiltroTipos/Badge) em light e dark; conferir as 4 listas (produtos/venda/pedidos/histórico) viraram contínuas — perímetro sólido, linha tracejada entre itens, sem gap; conferir grupos por data em pedidos/histórico (cada dia com seu próprio perímetro); conferir a tab bar (aba ativa com fundo sólido, ícone invertido, 3 ícones novos); conferir os modais (`pedidoModal`/`contaHistoricoModal`, listas de produto via `ListItem`) não quebraram visualmente.
