# Design System Mobile — Fase 5

> Data: 2026-08-08. Branch: `feat/design-system-mobile` (a partir de `dev`).

## Contexto

Auditoria feita em 2026-08-04 (`docs/design-system-audit.md`, read-only, 14 arquivos) mapeou o problema: `constants/Colors.ts` existe como arquivo de tokens mas quase ninguém usa. Resultado — 4 azuis diferentes fazendo o papel de cor primária, 3 verdes e 3 vermelhos diferentes pra sucesso/perigo, Badge/Card/Modal de ingredientes reimplementados 2-3x quase idênticos.

Fase 4 (design system do front, `front/front-tozzo.uk`) já fechou com paleta preto/branco/cinza + cores de status por urgência. Esta fase aplica o mesmo direcionamento visual no app mobile, e amplia o escopo além do que a auditoria original cobriu (os 6 arquivos em `app/modais/` não foram auditados em 2026-08-04, mas têm o mesmo problema — 78 ocorrências de cor hardcoded).

## Decisões (brainstorm 2026-08-08)

- **Logo**: SVG novo (já usado no front, `front/front-tozzo.uk/src/assets/images/logo.svg`) entra no mobile agora — decisão anterior de adiar (registrada em `plano.md`) é revertida.
- **Escopo**: sweep completo numa passada só — tokens + componentes base + todas as 6 telas + todos os 6 modais. Não incremental.
- **Cor primária**: preto/branco (não o azul `#2196F3` que a auditoria original propôs) — alinhado ao front.
- **Cores de status de pedido**: migram pros mesmos hex do front (`front/front-tozzo.uk/src/lib/status.ts`), não os valores atuais do mobile. Mobile hoje usa azul/âmbar/vermelho/verde pros 4 status; front usa vermelho/âmbar/azul/cinza por urgência (ABERTO = precisa atenção da cozinha = vermelho, não "erro genérico"). Alinhar os dois deixa a leitura visual idêntica entre app e dashboard.
- **Modais incluídos**: sim, mesmo fora do escopo da auditoria original.

## Tokens

### `constants/Colors.ts` (expande o existente)

```
light:
  background:     #fff
  surface:        #f9f9f9   (consolida whitesmoke/grey/#111)
  surfaceHeader:  #fafafa
  border:         #e2e2e2
  text:           #000
  textMuted:      #666
  primary:        #000      (era tint #2f95dc — vira preto, casa com front)

dark:
  background:     #000
  surface:        #333
  surfaceHeader:  #0d0d0d
  border:         #333
  text:           #fff
  textMuted:      #ccc
  primary:        #fff

status (mesmo valor light/dark, importado de um só lugar):
  ABERTO:     #dc2626  (era #3b82f6 no mobile)
  EM_PREPARO: #d97706  (era #f59e0b)
  ENTREGANDO: #2563eb  (era #ef4444)
  FECHADO:    #6b7280  (era #10b981)

apoio (badges de categoria, avisos — não status de pedido):
  success: #10b981
  warning: #f59e0b
  danger:  #ef4444
  info:    #3b82f6
```

`tint`/`tabIconDefault`/`tabIconSelected` continuam existindo (consumidos pelo `Tabs` do expo-router) mas passam a apontar pra `primary`/`textMuted`/`primary` em vez de valores próprios.

### `constants/theme.ts` (novo)

```
spacing: 4, 8, 12, 16, 20, 24, 32
radius:  sm 4, md 8, lg 12, full 999
type:    caption 12, bodySm 14, body 16, subtitle 18, title 20, heading 24
tipoColors: array único (7-8 cores de categoria de produto, hoje duplicado
            divergente entre Product.tsx e ProductItemVenda.tsx — consolida aqui)
```

Uma função `getStatusColor(status)` espelha a mesma lógica do front (fallback pra `FECHADO` se status desconhecido).

## Componentes novos (`components/ui/`)

| Componente | Substitui | Notas |
|---|---|---|
| `Button` | `Button` nativo (configs.tsx) + `TouchableOpacity` custom azul (historico/index) | Variante única preto/branco, efeito de borda dupla (linha branca dentro, preta fora — inverte no dark), igual ao front. |
| `Card` | container com sombra duplicado em `PedidoItem`/`Product`/`ProductItemVenda` | Padding/radius/borda consistentes via token. |
| `Badge` | badge de status (`PedidoItem`) + badge de tipo (`Product`, `ProductItemVenda`) | Cor + label, 1 componente pros 2 usos. |
| `ListItem` | linha de lista repetida em várias telas | Estrutura título/subtítulo/trailing padrão. |
| `EmptyState` | inexistente hoje — `produtos.tsx`/`pedidos.tsx` não mostram nada com lista vazia | Ícone + texto, usado nas 6 telas onde fizer sentido. |
| `IngredientesModal` | modal de ingredientes copiado em `Product.tsx:83-112` e `ProductItemVenda.tsx:120-151` | Extrai pro componente único. |

`Input` (já existe em `components/Input.tsx`) migra pros tokens novos, sem mudar de lugar.

## Escopo de migração

**Telas** (`app/(tabs)/`): `_layout.tsx` (tab bar: tint azul → preto/branco), `index.tsx`, `pedidos.tsx`, `produtos.tsx`, `historico.tsx`, `configs.tsx`.

**Modais** (`app/modais/`): `adicionalModal.tsx`, `contaModal.tsx`, `contaHistoricoModal.tsx`, `pedidoModal.tsx`, `produtoModal.tsx`, `relatorioModal.tsx`.

**Componentes existentes migrados**: `PedidoItem.tsx`, `Product.tsx`, `ProductItemVenda.tsx`, `SyncIndicator.tsx`, `Input.tsx`, `FiltroTipos.tsx`, `Themed.tsx` (mantido como mecanismo único de light/dark — parar de misturar com `useColorScheme()` manual nos arquivos que hoje ignoram o wrapper).

**Logo**: `assets/images/logo.svg` (copiado do front) substitui `logo-login.png` no `login.tsx` e `icon-geral.png` em `app.json` (`icon`, `splash.image`, `android.adaptiveIcon.foregroundImage`, `web.favicon` — favicon pode precisar de versão PNG gerada do SVG, expo não aceita SVG em todos os campos, verificar na implementação).

## Bugs corrigidos de passagem

- `FiltroTipos.tsx:46` — `selectedButton` usa `Colors.light.tint` fixo em vez de `Colors[colorScheme].primary`. Ignora dark mode.
- `pedidos.tsx:85-95` — estilos órfãos (`pedidoItem`, `pedidoLeft`, `counter`, etc.) não referenciados em lugar nenhum. Remover.

## Fora do escopo

- Telas fora de `(tabs)` e `modais` não cobertas pela auditoria (ex: `login.tsx` além do logo) — só o necessário pro logo é tocado lá, não uma reforma visual completa da tela de login.
- Novas funcionalidades — é reforma visual + limpeza de código, não mudança de comportamento.
- Publicação na Play Store / distribuição — assunto de `distribuicao-mobile.md`, não relacionado.

## Testes

Suíte Jest (`feat/test-coverage-mobile` → já mergeada em `dev`) roda via `npm test`. Rodar no fim da implementação — mudança é visual/estrutural, não deveria quebrar `syncGuard`/`useSyncRefresh`/`useProductDatabase`, mas confirmar. `tsc` limpo antes de abrir PR (mesmo critério usado na Fase 4 do front).
