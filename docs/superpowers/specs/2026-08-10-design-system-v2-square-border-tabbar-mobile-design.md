# Design system mobile v2 — borda quadrada preto/branco + tab bar + ícones (Fase 5, sub-item 1, rodada 2)

> Data: 2026-08-10. Branch: `feat/design-system-mobile-listas` (mesma leva grande da Fase 5 — ver `plano.md`). Segunda rodada sobre o design system mobile original (sub-item 1, já implementado, PR não aberto ainda): troca a linguagem visual de "cantos arredondados + borda cinza" pra "cantos quadrados + borda preto/branco (por tema)", redesenha a tab bar (fundo sólido na aba ativa) e reorganiza os ícones das 3 abas principais.

## Contexto

Pedido do usuário, direto: tirar canto arredondado, colocar borda preto/branco (dependendo do tema) em basicamente todo componente visual incluindo a tab bar, aba ativa ganha fundo preto (light)/branco (dark) com ícone invertido, e trocar os 3 ícones das abas principais (Index vira casinha, Vendas vira `$`, Pedidos vira recibo).

Brainstorm usou o companion visual (mockups em browser) pras 2 decisões de forma (peso de borda, formato do fundo ativo) — 2 telas, ambas resolvidas em 1 clique cada. Resto das decisões (escopo, normalização de divisor, simplificação do Button) resolvido em texto no terminal.

## Decisões do brainstorm (2026-08-10)

- **Peso de borda**: 1px fino (opção A do mockup) — mais próximo do que já existe hoje (`Card` já usa `borderWidth:1`), menos ruptura visual que 2px.
- **Formato do fundo da aba ativa**: segmento cheio (opção B do mockup) — ícone + label inteiro viram um bloco só com fundo preto (light)/branco (dark), não só um chip atrás do ícone.
- **Escopo da varredura**: tudo, sem exceção — Card, Button, ListItem, RecordCard, Badge, EmptyState (sem borda hoje, fica sem), Input, FiltroTipos, IconButton, Skeleton/RecordCardSkeleton/ProductCardSkeleton, e todos os modais (`pedidoModal`, `contaModal`, `relatorioModal`, `contaHistoricoModal`, `produtoModal`, `adicionalModal`, `IngredientesModal`), `configs.tsx`, `login.tsx`.
- **Divisores hairline+tracejado** (`ListItem` embaixo, `RecordCard.actionsRow` em cima): normaliza pra 1px sólido também, tira o `borderStyle:'dashed'` — consistente com a linha nova em todo canto.
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

### `components/ui/ListItem.tsx` / `components/ui/RecordCard.tsx`
Troca `borderBottomWidth: StyleSheet.hairlineWidth` (ListItem) e `borderTopWidth: StyleSheet.hairlineWidth` + `borderStyle:'dashed'` (RecordCard `actionsRow`) pra `borderWidth: 1` sólido — cor já vem de `colors.border` (token), sem mudança de referência, só o valor numérico/estilo da borda.

### Tab bar (`app/(tabs)/_layout.tsx`)
`tabBarActiveTintColor`/`tabBarInactiveTintColor` sozinhos não dão pra pintar um fundo atrás de ícone+label juntos — precisa de `tabBarButton` customizado por `Tabs.Screen` (ou um componente compartilhado usado nos 5), recebendo `focused` e envolvendo ícone+label numa `View` com `backgroundColor: focused ? colors.text : 'transparent'` e cor de conteúdo invertida quando `focused` (`colors.background` no lugar de `colors.text`). Ícones trocam: `index` → `home`, `historico` → `dollar`, `produtos` mantém (`book`), `pedidos` → `MaterialIcons`/`receipt-long` (precisa de branch de família de ícone no componente do botão da tab, já que os outros usam `FontAwesome`).

## Fora do escopo

- `Badge.tsx` mantém o fundo colorido (vermelho/âmbar/azul/cinza por status) — só a moldura (radius+cor de borda) muda, a cor de status continua a mesma.
- `EmptyState.tsx` não tem borda/radius hoje — fica assim, nada a mudar.
- Paleta categórica do gráfico de relatório e `tipoColors` (cores de tipo de produto) — multi-hue de propósito, não fazem parte dessa reforma preto/branco (mesma exceção já registrada na Fase 5 original).
- Header superior (`headerShown`/`SyncIndicator`) — não mencionado no pedido, fora de escopo desta rodada.

## Testes

Mudança é quase inteiramente visual/estilo — sem lógica nova. `tsc --noEmit` limpo + `npx jest --watchAll=false` (suíte existente não deve quebrar, nenhum teste hoje cobre estilo/JSX de componente visual). Validação real é manual no emulador: conferir os componentes com borda visível (Card/RecordCard/Input/FiltroTipos/Badge) em light e dark, conferir a tab bar (aba ativa com fundo sólido, ícone invertido, 3 ícones novos), conferir os modais não quebraram visualmente.
