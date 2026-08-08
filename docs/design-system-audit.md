# Auditoria — Design System Mobile (prep Fase 5 do plano.md)

> Gerado em 2026-08-04. Auditoria read-only, nenhum código foi alterado. Base pra desenhar os tokens/componentes da Fase 5.

## Escopo auditado

14 arquivos: 6 telas (`app/(tabs)/index.tsx`, `pedidos.tsx`, `produtos.tsx`, `historico.tsx`, `configs.tsx`, `_layout.tsx`) + 6 componentes (`PedidoItem`, `Product`, `ProductItemVenda`, `SyncIndicator`, `Input`, `FiltroTipos`) + `Themed.tsx` + `constants/Colors.ts`.

`components/Sales/` e `components/Settings/` existem mas estão **vazias** (0 arquivos) — pasta morta, candidata a remoção.

## Achado principal

O app já tem um arquivo de tokens (`constants/Colors.ts`), mas ele só define 5 chaves (`text`, `background`, `tint`, `tabIconDefault`, `tabIconSelected`) e **quase nenhum componente o usa** — cada arquivo redeclara cor na mão. Resultado: **4 azuis diferentes** fazendo o mesmo papel de "ação primária" (`#007bff`, `#2196F3`, `#007AFF`, e o `tint` real `#2f95dc` que quase ninguém usa), **3 verdes** diferentes pra sucesso (`'green'`, `#4CAF50`, `#28a745`) e **3 vermelhos** diferentes pra perigo/exclusão (`'red'`, `#F44336`, `#dc3545`).

## Cores hardcoded encontradas (arquivo:linha)

| Cor | Onde | Papel |
|---|---|---|
| `#000` / `#fff` | `configs.tsx` (várias), `historico.tsx:142`, `PedidoItem.tsx:22` | bg/texto claro-escuro — já existe em `Colors.ts` |
| `#111` / `#0d0d0d` / `#fafafa` | `configs.tsx:116-117,154-155` | fundo de "seção" (dark/light) |
| `#e6e6e6` / `#222` | `configs.tsx:116,154,219` | borda de seção |
| `#ccc` / `#999` / `#333` | `configs.tsx:136,194`, `historico.tsx:56`, `Input.tsx:14` | borda genérica — 3 tons diferentes pro mesmo papel |
| `#666` / `#ccc` | `configs.tsx:123,131`, `Input.tsx:6` | texto/placeholder mudo |
| `#555` / `#aaa` | `configs.tsx:184` | texto de versão (baixa ênfase) |
| `#007bff` | `historico.tsx:96` (`button`) | ação primária (variante 1) |
| `#2196F3` | `historico.tsx:104,164,430+` (search/close/calendar), `pedidos.tsx:87` (`counter`) | ação primária (variante 2) |
| `#007AFF` | `SyncIndicator.tsx:97,103` | ação primária (variante 3, tom "iOS") |
| `#2f95dc` (`Colors.light.tint`) | `constants/Colors.ts`, usado só em `FiltroTipos.tsx:46` e `_layout.tsx` (ícones) | ação primária "oficial" — a menos usada das 4 |
| `'green'` | `historico.tsx:117` (`Greenbutton`) | sucesso/positivo (variante 1) |
| `#4CAF50` | `pedidos.tsx:93` (`editButton`) | sucesso/positivo (variante 2) |
| `#28a745` | `SyncIndicator.tsx:99` | sucesso/positivo (variante 3) |
| `#10b981` | `PedidoItem.tsx:31` (status `FECHADO`), `Product.tsx`/`ProductItemVenda.tsx` (`tipoColors[3]`) | sucesso — já usado em 2 lugares, é o mais consistente dos 3 |
| `'red'` | `historico.tsx:126` (`Redbutton`) | perigo/exclusão (variante 1) |
| `#F44336` | `pedidos.tsx:94` (`deleteButton`) | perigo/exclusão (variante 2) |
| `#dc3545` | `SyncIndicator.tsx:101` | perigo/exclusão (variante 3) |
| `#ef4444` | `PedidoItem.tsx:30` (status `ENTREGANDO`), `tipoColors[1]` | perigo — mais consistente dos 3 |
| `#f59e0b` | `PedidoItem.tsx:29` (status `EM_PREPARO`), `tipoColors[2]` | aviso/alerta |
| `#3b82f6` | `PedidoItem.tsx:28` (status `ABERTO`), `tipoColors[4]` | info |
| `whitesmoke` / `#f9f9f9` / `grey` | `PedidoItem.tsx:21`, `Product.tsx:21,49`, `ProductItemVenda.tsx:59` (via prop `lightColor`/`darkColor` do `Themed`) | fundo de card (light/dark) |
| `#f5f5f5` | `pedidos.tsx:85` (`styles.pedidoItem`) | **código morto** — ver seção abaixo |

**Paleta de categoria de produto (`tipoColors`) duplicada**: `Product.tsx:29-37` (7 cores) e `ProductItemVenda.tsx:15-24` (8 cores, inclui `#06b6d4` que falta no outro arquivo) — mesma paleta, dois arrays independentes, já divergindo.

## Bug encontrado de passagem
`FiltroTipos.tsx:46` — `selectedButton: { backgroundColor: Colors.light.tint }` usa `Colors.light` fixo, não `Colors[colorScheme]`. Botão selecionado do filtro fica sempre com a cor do tema claro, mesmo em dark mode. Fora do escopo da auditoria consertar agora, só registrando.

## Espaçamento (padding/margin) — valores em uso
`4, 5, 6, 8, 10, 12, 15, 16, 18, 20, 24, 30` — bastante fragmentado (4 vs 5, 15 vs 16, 18 vs 20 claramente deveriam ser o mesmo step). Uma escala de `4/8/12/16/20/24/32` cobre praticamente todo uso real, com pequeno arredondamento.

## Border radius — valores em uso
`4, 5, 6, 7, 8, 10, 16, 18, 999` (999 = pill, usado em badges). Escala proposta: `4 (sm) / 8 (md) / 12 (lg) / 999 (full)`.

## Tipografia — tamanhos em uso
`12, 14, 16, 18, 20, 24` pra texto + `16, 18, 20, 25, 28, 56` pra ícones. O texto já forma uma escala razoável — dá pra adotar direto: `caption 12 / body-sm 14 / body 16 / subtitle 18 / title 20 / heading 24`.

## Padrões de componente reimplementados (candidatos a virar componente único)

1. **Badge/pill colorida** — reimplementada 3x com código quase idêntico: `PedidoItem.tsx` (`statusBadge`, cor por status), `Product.tsx` (`centerBadgeContainer`, cor por tipo), `ProductItemVenda.tsx` (inline, cor por tipo). Um componente `Badge` único (cor + label) resolve os 3.
2. **Card com sombra** — `PedidoItem`, `Product`, `ProductItemVenda` cada um declara seu próprio container com `shadowOffset/shadowOpacity/shadowRadius/elevation/borderRadius`, valores levemente diferentes entre os 3 (padding 4 vs 16, elevation 2 vs 3, um usa borda em vez de sombra). Um componente `Card` base resolve.
3. **Modal de ingredientes** — `Product.tsx:83-112` e `ProductItemVenda.tsx:120-151` são praticamente cópia-e-cola do mesmo modal (fundo escurecido, caixa branca/cinza, texto, botão "Fechar"). Extrair componente `IngredientesModal` compartilhado.
4. **Botão de ação primário** — 2 linguagens visuais coexistindo: `Button` nativo do RN (estilo OS, usado em `configs.tsx` pra login/logout/impressora) vs `TouchableOpacity` customizado azul (usado em `historico.tsx`/`index.tsx`). Decidir um só pra Fase 5.
5. **Empty state** — não existe em lugar nenhum. `produtos.tsx`/`pedidos.tsx` simplesmente não mostram nada se a lista vier vazia. Não é inconsistência, é ausência — vale desenhar um `EmptyState` na Fase 5.
6. **Confirmação destrutiva** — ponto positivo: `Alert.alert` nativo é usado de forma consistente em `produtos.tsx`, `pedidos.tsx`, `historico.tsx` pra confirmar exclusão. Não precisa mexer.

## Código morto encontrado
`pedidos.tsx:85-95` — estilos `pedidoItem`, `pedidoLeft`, `counter`, `info`, `cliente`, `produtos`, `actions`, `status`, `editButton`, `deleteButton`, `buttonText` não são usados em lugar nenhum: a tela renderiza via `<PedidoItem>` (componente próprio, com seus próprios estilos), não via `styles.pedidoItem`. Sobrou de uma versão anterior da tela. Seguro remover na Fase 5 (ou antes).

## `Themed.tsx` — o que já existe
Wrapper de `Text`/`View` que aceita `lightColor`/`darkColor` e cai pra `Colors[theme].text`/`Colors[theme].background` por padrão. Uso é inconsistente: alguns componentes usam essas props (`PedidoItem`, `Product` via `lightColor="whitesmoke" darkColor="grey"`), outros ignoram completamente e fazem `useColorScheme()` + ternário manual toda vez (`configs.tsx`, `historico.tsx`, `FiltroTipos.tsx`). Qualquer design system novo deveria consolidar num único mecanismo — hoje tem os dois convivendo.

## Proposta inicial de tokens (derivada do uso real, não inventada)

```
cores:
  background:    light #fff        dark #000     (já existe)
  surface:       light #f9f9f9     dark #333      (consolida whitesmoke/grey/#111)
  surfaceHeader: light #fafafa     dark #0d0d0d
  border:        light #e2e2e2     dark #333
  text:          light #000        dark #fff     (já existe)
  textMuted:     light #666        dark #ccc
  primary:       #2196F3 (mais usado das 4 variantes de azul — substitui tint atual)
  success:       #10b981 (já usado em status + tipo)
  danger:        #ef4444 (já usado em status + tipo)
  warning:       #f59e0b (já usado em status + tipo)
  info:          #3b82f6 (já usado em status)

spacing: 4 / 8 / 12 / 16 / 20 / 24 / 32
radius:  4 (sm) / 8 (md) / 12 (lg) / 999 (full)
type:    12 (caption) / 14 (body-sm) / 16 (body) / 18 (subtitle) / 20 (title) / 24 (heading)
```

## Componentes a construir na Fase 5
`Button` (unificar Button nativo + TouchableOpacity custom), `Card`, `Badge`, `Input` (já existe, só precisa migrar pros tokens), `ListItem`, `EmptyState`, `IngredientesModal` (extrair duplicação).
