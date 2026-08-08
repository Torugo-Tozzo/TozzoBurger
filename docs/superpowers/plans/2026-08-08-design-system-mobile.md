# Design System Mobile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reformar o app mobile (TozzoBurger) pra paleta preto/branco/cinza igual ao front, unificando componentes duplicados (Badge/Card/Modal de ingredientes) e telas/modais que hoje reimplementam a mesma coisa com cores hardcoded divergentes.

**Architecture:** Tokens centralizados (`constants/Colors.ts`, `constants/theme.ts`, `constants/status.ts`) alimentam uma camada nova de componentes base (`components/ui/`), que por sua vez substitui código duplicado nos componentes existentes, telas (`app/(tabs)/`) e modais (`app/modais/`).

**Tech Stack:** Expo Router (SDK 52), React Native 0.76, TypeScript strict, Jest + jest-expo (sem `@testing-library/react-native` — não adicionar, ver Global Constraints).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-08-design-system-mobile-design.md`. Toda decisão de escopo abaixo vem de lá.
- **Sem `@testing-library/react-native`**: projeto não tem a lib, front (Fase 4) também não escreveu render-test pra componentes de UI novos — mesma convenção aqui. Verificação de tarefas puramente visuais é `npx tsc --noEmit` limpo, não teste automatizado novo. Só `constants/status.ts` ganha teste (função pura, sem precisar renderizar nada).
- **Diff-only tasks** (telas/modais que NÃO são reescritos por completo) tocam **apenas**: cor hardcoded → token, o `EmptyState` explicitamente listado na spec, e os bugs already conhecidos (`FiltroTipos` dark mode, dead code `pedidos.tsx`). Não retokenizar spacing/fontSize numérico solto nesses arquivos — evita diff desnecessário em código que já funciona.
- **Arquivos totalmente reescritos** (`components/ui/*`, `Input.tsx`, `FiltroTipos.tsx`, `PedidoItem.tsx`, `Product.tsx`, `ProductItemVenda.tsx`, `pedidos.tsx`, `adicionalModal.tsx`, `produtoModal.tsx`) usam os tokens de `theme.ts` (spacing/radius/type) por completo, não só cor.
- **Cor primária = preto/branco** (`colors.primary`, alias de `colors.text`/`.tint`), não azul. Reservado **um** vermelho pra ação destrutiva (`Colors.status.danger`, `#ef4444`) e outro, diferente, só pra semântica de status `ABERTO` do pedido (`#dc2626`, via `getStatusColor`) — são dois sistemas independentes, não precisam bater.
- **Paleta categórica de produto** (`tipoColors`, 8 cores) e paleta do gráfico de pizza (`relatorioModal.tsx`, `getColor()`) **não** viram preto/branco — precisam de múltiplas cores pra serem legíveis, fora do escopo da reforma "preto e branco" (essa se aplica a chrome de UI e status, não a paletas categóricas que já existiam antes e continuam servindo o mesmo propósito).
- **Botões**: CTA de texto cheio (ex: Entrar, Salvar, Gerar Pedido) migram pro componente `Button` novo. Botão pequeno/ícone com layout fixo (contador circular, ação inline com FontAwesome, share/trash sem texto) mantém `Pressable`/`TouchableOpacity` custom, só retokenizado — não força tudo pra dentro da API do `Button` se o layout não encaixa.
- Rodar `npx tsc --noEmit` depois de cada tarefa antes de commitar. Rodar `npm test` completo só na tarefa final (regressão).

---

## Task 1: Tokens de cor (`constants/Colors.ts` + `constants/status.ts`)

**Files:**
- Modify: `constants/Colors.ts` (reescrita completa)
- Create: `constants/status.ts`
- Create: `constants/__tests__/status.test.ts`

**Interfaces:**
- Produces: `Colors` (default export) com formato `{ light: {...}, dark: {...}, status: {...} }`. Chaves `light`/`dark`: `background, surface, surfaceHeader, border, text, textMuted, primary, tint, tabIconDefault, tabIconSelected`. Chave `status`: `success, warning, danger, info`.
- Produces: `PedidoStatus` (type), `getStatusColor(status: string): string`, `getStatusLabel(status: string): string` de `@/constants/status`.

- [ ] **Step 1: Escrever o teste (falhando) de `status.ts`**

Criar `constants/__tests__/status.test.ts`:

```ts
import { getStatusColor, getStatusLabel } from '@/constants/status';

describe('getStatusColor', () => {
  it('returns correct color for each known status', () => {
    expect(getStatusColor('ABERTO')).toBe('#dc2626');
    expect(getStatusColor('EM_PREPARO')).toBe('#d97706');
    expect(getStatusColor('ENTREGANDO')).toBe('#2563eb');
    expect(getStatusColor('FECHADO')).toBe('#6b7280');
  });

  it('falls back to FECHADO color for unknown status', () => {
    expect(getStatusColor('DESCONHECIDO')).toBe('#6b7280');
  });
});

describe('getStatusLabel', () => {
  it('returns correct label for known status', () => {
    expect(getStatusLabel('EM_PREPARO')).toBe('Em Preparo');
  });

  it('returns the raw value for unknown status', () => {
    expect(getStatusLabel('XYZ')).toBe('XYZ');
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npm test -- status.test.ts`
Expected: FAIL — `Cannot find module '@/constants/status'`

- [ ] **Step 3: Criar `constants/status.ts`**

```ts
export type PedidoStatus = 'ABERTO' | 'EM_PREPARO' | 'ENTREGANDO' | 'FECHADO';

const STATUS_COLORS: Record<PedidoStatus, string> = {
  ABERTO: '#dc2626',
  EM_PREPARO: '#d97706',
  ENTREGANDO: '#2563eb',
  FECHADO: '#6b7280',
};

const STATUS_LABELS: Record<PedidoStatus, string> = {
  ABERTO: 'Aberto',
  EM_PREPARO: 'Em Preparo',
  ENTREGANDO: 'Entregando',
  FECHADO: 'Fechado',
};

export function getStatusColor(status: string): string {
  return STATUS_COLORS[status as PedidoStatus] ?? STATUS_COLORS.FECHADO;
}

export function getStatusLabel(status: string): string {
  return STATUS_LABELS[status as PedidoStatus] ?? status;
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npm test -- status.test.ts`
Expected: PASS (4 testes)

- [ ] **Step 5: Reescrever `constants/Colors.ts`**

Substituir o arquivo inteiro por:

```ts
const primaryLight = '#000';
const primaryDark = '#fff';

export default {
  light: {
    background: '#fff',
    surface: '#f9f9f9',
    surfaceHeader: '#fafafa',
    border: '#e2e2e2',
    text: '#000',
    textMuted: '#666',
    primary: primaryLight,
    tint: primaryLight,
    tabIconDefault: '#666',
    tabIconSelected: primaryLight,
  },
  dark: {
    background: '#000',
    surface: '#333',
    surfaceHeader: '#0d0d0d',
    border: '#333',
    text: '#fff',
    textMuted: '#ccc',
    primary: primaryDark,
    tint: primaryDark,
    tabIconDefault: '#999',
    tabIconSelected: primaryDark,
  },
  status: {
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444',
    info: '#3b82f6',
  },
};
```

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem novos erros (arquivos que importam `Colors.light.tint`/`Colors.dark.tint` continuam válidos — chaves antigas mantidas).

- [ ] **Step 7: Commit**

```bash
git add constants/Colors.ts constants/status.ts constants/__tests__/status.test.ts
git commit -m "feat(mobile): tokens de cor preto/branco + status do pedido alinhado ao front"
```

---

## Task 2: `constants/theme.ts` (spacing/radius/type/tipoColors)

**Files:**
- Create: `constants/theme.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `spacing`, `radius`, `type`, `tipoColors` (named exports) de `@/constants/theme`.

- [ ] **Step 1: Criar o arquivo**

```ts
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  full: 999,
};

export const type = {
  caption: 12,
  bodySm: 14,
  body: 16,
  subtitle: 18,
  title: 20,
  heading: 24,
};

export const tipoColors: Record<number, string> = {
  1: '#ef4444',
  2: '#f59e0b',
  3: '#10b981',
  4: '#3b82f6',
  5: '#8b5cf6',
  6: '#ec4899',
  7: '#14b8a6',
  8: '#06b6d4',
};
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add constants/theme.ts
git commit -m "feat(mobile): tokens de spacing/radius/type/tipoColors"
```

---

## Task 3: `components/ui/Button.tsx`

**Files:**
- Create: `components/ui/Button.tsx`

**Interfaces:**
- Consumes: `Colors` de `@/constants/Colors`, `spacing/radius/type` de `@/constants/theme`.
- Produces: `Button({ title, variant?: 'primary'|'danger'|'outline', loading?, disabled?, ...PressableProps })`. Efeito de borda dupla (linha branca dentro, preta fora — inverte no dark) pras variantes `primary`/`danger`.

- [ ] **Step 1: Criar o componente**

```tsx
import React from 'react';
import { Pressable, PressableProps, StyleSheet, Text, ActivityIndicator, View, useColorScheme } from 'react-native';
import Colors from '@/constants/Colors';
import { radius, spacing, type } from '@/constants/theme';

type ButtonVariant = 'primary' | 'danger' | 'outline';

type Props = PressableProps & {
  title: string;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
};

export function Button({ title, variant = 'primary', loading = false, disabled = false, style, ...rest }: Props) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const isDisabled = disabled || loading;

  if (variant === 'outline') {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.outlineBase,
          { borderColor: colors.text, opacity: isDisabled ? 0.5 : pressed ? 0.7 : 1 },
          style as any,
        ]}
        disabled={isDisabled}
        {...rest}
      >
        {loading ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <Text style={[styles.text, { color: colors.text }]}>{title}</Text>
        )}
      </Pressable>
    );
  }

  const contentBg = variant === 'danger' ? Colors.status.danger : colors.text;
  const contentText = variant === 'danger' ? '#fff' : colors.background;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.frame,
        { backgroundColor: colors.text, opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1 },
        style as any,
      ]}
      disabled={isDisabled}
      {...rest}
    >
      <View style={[styles.line, { backgroundColor: colors.background }]}>
        <View style={[styles.content, { backgroundColor: contentBg }]}>
          {loading ? (
            <ActivityIndicator color={contentText} />
          ) : (
            <Text style={[styles.text, { color: contentText }]}>{title}</Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: radius.md, padding: 2 },
  line: { borderRadius: radius.sm, padding: 2 },
  content: {
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineBase: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { fontSize: type.body, fontWeight: '700' },
});
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos.

- [ ] **Step 3: Commit**

```bash
git add components/ui/Button.tsx
git commit -m "feat(mobile): componente Button unificado (preto/branco, borda dupla)"
```

---

## Task 4: `components/ui/Card.tsx`

**Files:**
- Create: `components/ui/Card.tsx`

**Interfaces:**
- Consumes: `Colors`, `radius/spacing`.
- Produces: `Card({ padding?: number, style?, children, ...ViewProps })` — container com `surface`/`border`/`radius.md` do tema atual.

- [ ] **Step 1: Criar o componente**

```tsx
import React from 'react';
import { View, ViewProps, StyleSheet, useColorScheme } from 'react-native';
import Colors from '@/constants/Colors';
import { radius, spacing } from '@/constants/theme';

type Props = ViewProps & {
  padding?: number;
};

export function Card({ style, padding = spacing.lg, children, ...rest }: Props) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  return (
    <View
      style={[styles.base, { backgroundColor: colors.surface, borderColor: colors.border, padding }, style as any]}
      {...rest}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    borderWidth: 1,
  },
});
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add components/ui/Card.tsx
git commit -m "feat(mobile): componente Card base"
```

---

## Task 5: `components/ui/Badge.tsx`

**Files:**
- Create: `components/ui/Badge.tsx`

**Interfaces:**
- Consumes: `radius/spacing/type`.
- Produces: `Badge({ label: string, color: string })` — pill colorida com borda branca, texto branco.

- [ ] **Step 1: Criar o componente**

```tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { radius, spacing, type } from '@/constants/theme';

type Props = {
  label: string;
  color: string;
};

export function Badge({ label, color }: Props) {
  return (
    <View style={[styles.container, { backgroundColor: color }]}>
      <Text style={styles.text} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minWidth: 90,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderColor: '#fff',
    borderWidth: 1,
  },
  text: {
    color: '#fff',
    fontWeight: '700',
    fontSize: type.caption,
    textAlign: 'center',
  },
});
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add components/ui/Badge.tsx
git commit -m "feat(mobile): componente Badge unificado"
```

---

## Task 6: `components/ui/ListItem.tsx`

**Files:**
- Create: `components/ui/ListItem.tsx`

**Interfaces:**
- Consumes: `Colors`, `spacing/type`.
- Produces: `ListItem({ title: string, subtitle?: string, trailing?: ReactNode, ...PressableProps })`. É um `Pressable` — aceita `onPress`.

- [ ] **Step 1: Criar o componente**

```tsx
import React from 'react';
import { Pressable, PressableProps, View, Text, StyleSheet, useColorScheme } from 'react-native';
import Colors from '@/constants/Colors';
import { spacing, type } from '@/constants/theme';

type Props = PressableProps & {
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
};

export function ListItem({ title, subtitle, trailing, style, ...rest }: Props) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  return (
    <Pressable style={[styles.container, { borderColor: colors.border }, style as any]} {...rest}>
      <View style={styles.textBlock}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>{subtitle}</Text>
        ) : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  textBlock: { flex: 1, marginRight: spacing.md },
  title: { fontSize: type.body, fontWeight: '600' },
  subtitle: { fontSize: type.bodySm, marginTop: 2 },
  trailing: { flexDirection: 'row', alignItems: 'center' },
});
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add components/ui/ListItem.tsx
git commit -m "feat(mobile): componente ListItem"
```

---

## Task 7: `components/ui/EmptyState.tsx`

**Files:**
- Create: `components/ui/EmptyState.tsx`

**Interfaces:**
- Consumes: `Colors`, `spacing/type`, `FontAwesome` (`@expo/vector-icons/FontAwesome`).
- Produces: `EmptyState({ icon?: FontAwesome icon name, title: string, message?: string })`.

- [ ] **Step 1: Criar o componente**

```tsx
import React from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Colors from '@/constants/Colors';
import { spacing, type } from '@/constants/theme';

type Props = {
  icon?: React.ComponentProps<typeof FontAwesome>['name'];
  title: string;
  message?: string;
};

export function EmptyState({ icon = 'inbox', title, message }: Props) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  return (
    <View style={styles.container}>
      <FontAwesome name={icon} size={40} color={colors.textMuted} />
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {message ? <Text style={[styles.message, { color: colors.textMuted }]}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xl },
  title: { fontSize: type.subtitle, fontWeight: '700', marginTop: spacing.md, textAlign: 'center' },
  message: { fontSize: type.bodySm, marginTop: spacing.xs, textAlign: 'center' },
});
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add components/ui/EmptyState.tsx
git commit -m "feat(mobile): componente EmptyState"
```

---

## Task 8: `components/ui/IngredientesModal.tsx`

**Files:**
- Create: `components/ui/IngredientesModal.tsx`

**Interfaces:**
- Consumes: `Colors`, `Button` (Task 3), `radius/spacing/type`.
- Produces: `IngredientesModal({ visible: boolean, onClose: () => void, nomeProduto: string, ingredientes?: string | null })`. Extrai a duplicação de `Product.tsx`/`ProductItemVenda.tsx`.

- [ ] **Step 1: Criar o componente**

```tsx
import React from 'react';
import { Modal, View, Text, StyleSheet, useColorScheme } from 'react-native';
import Colors from '@/constants/Colors';
import { Button } from './Button';
import { radius, spacing, type } from '@/constants/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  nomeProduto: string;
  ingredientes?: string | null;
};

export function IngredientesModal({ visible, onClose, nomeProduto, ingredientes }: Props) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.box, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>Ingredientes do {nomeProduto}:</Text>
          <Text style={[styles.body, { color: colors.text }]}>
            {ingredientes ?? 'Os ingredientes não foram informados no cadastro deste produto'}
          </Text>
          <Button title="Fechar" onPress={onClose} variant="outline" />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  box: { padding: spacing.xl, borderRadius: radius.lg, borderWidth: 1, width: '80%' },
  title: { fontSize: type.title, fontWeight: 'bold', marginBottom: spacing.lg },
  body: { fontSize: type.body, marginBottom: spacing.xl },
});
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add components/ui/IngredientesModal.tsx
git commit -m "feat(mobile): extrai IngredientesModal (dedup Product/ProductItemVenda)"
```

---

## Task 9: `components/Input.tsx` (reescrita)

**Files:**
- Modify: `components/Input.tsx` (reescrita completa, 23 linhas)

**Interfaces:**
- Consumes: `Colors`, `radius/spacing` (Tasks 1-2).
- Produces: mesma assinatura pública (`Input(props: TextInputProps)`), sem quebrar consumidores (`index.tsx`, `produtos.tsx`, `produtoModal.tsx`).

- [ ] **Step 1: Substituir o arquivo inteiro**

```tsx
import React from "react";
import { TextInput, TextInputProps, useColorScheme } from "react-native";
import Colors from '@/constants/Colors';
import { radius, spacing } from '@/constants/theme';

export function Input({ style, ...rest }: TextInputProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  return (
    <TextInput
      style={[
        {
          height: 54,
          borderWidth: 1,
          borderRadius: radius.sm,
          borderColor: colors.border,
          paddingHorizontal: spacing.lg,
          marginBottom: spacing.xs,
          color: colors.text,
        },
        style,
      ]}
      placeholderTextColor={colors.textMuted}
      {...rest}
    />
  );
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros novos (verificar especificamente `app/(tabs)/index.tsx`, `app/(tabs)/produtos.tsx`, `app/modais/produtoModal.tsx` — únicos consumidores).

- [ ] **Step 3: Commit**

```bash
git add components/Input.tsx
git commit -m "refactor(mobile): Input usa tokens de cor"
```

---

## Task 10: `components/FiltroTipos.tsx` (reescrita + fix dark mode)

**Files:**
- Modify: `components/FiltroTipos.tsx` (reescrita completa, 79 linhas)

**Interfaces:**
- Consumes: `Colors`, `radius/spacing/type` (Tasks 1-2).
- Produces: mesma assinatura pública (`FiltroTipos({ data, selectedId, onSelect })`).
- Corrige bug do audit: `selectedButton` usava `Colors.light.tint` fixo, ignorando dark mode.

- [ ] **Step 1: Substituir o arquivo inteiro**

```tsx
import { FlatList, TouchableOpacity, StyleSheet } from "react-native";
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { View, Text } from "@/components/Themed";
import { radius, spacing, type } from '@/constants/theme';

type TipoProduto = {
  id: number;
  descricao: string;
};

type FiltroTiposProps = {
  data: TipoProduto[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
};

export function FiltroTipos({ data, selectedId, onSelect }: FiltroTiposProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  const styles = StyleSheet.create({
    container: { marginBottom: 0 },
    flatList: { flexGrow: 0 },
    contentContainer: { paddingHorizontal: spacing.lg, paddingVertical: 0, gap: 1 },
    button: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.sm,
      marginRight: spacing.md,
      marginBottom: spacing.md,
      marginTop: spacing.xs,
      alignItems: "center",
      justifyContent: "center",
      height: 45,
    },
    selectedButton: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    selectedText: { color: colors.background },
  });

  return (
    <View style={styles.container}>
      <FlatList
        data={data}
        horizontal
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => {
          const selected = selectedId === item.id;
          return (
            <TouchableOpacity
              onPress={() => onSelect(selected ? null : item.id)}
              style={[styles.button, selected && styles.selectedButton]}
            >
              <Text style={[{ fontSize: type.body, fontWeight: "bold" }, selected && styles.selectedText]}>
                {item.descricao}
              </Text>
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={styles.contentContainer}
        style={styles.flatList}
      />
    </View>
  );
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add components/FiltroTipos.tsx
git commit -m "fix(mobile): FiltroTipos respeita dark mode no botão selecionado + usa tokens"
```

---

## Task 11: `components/PedidoItem.tsx` (reescrita — Card + Badge + status tokens)

**Files:**
- Modify: `components/PedidoItem.tsx` (reescrita completa, 140 linhas)

**Interfaces:**
- Consumes: `Card` (Task 4), `Badge` (Task 5), `getStatusColor` (Task 1), `Colors`, `spacing/radius/type` (Task 2).
- Produces: mesma assinatura pública (`PedidoItem({ data, index?, onEdit, onDelete? })`, também `export default`).
- Simplificação deliberada: o botão-lupa circular separado vira parte do header clicável (menos duplicação de bg entre header/body/footer, que hoje repetem `containerStyle.backgroundColor` manualmente). `index`/`onDelete` continuam recebidos mas não renderizados — mesmo comportamento do original (nenhum dos dois era usado no JSX antes).

- [ ] **Step 1: Substituir o arquivo inteiro**

```tsx
import { Pressable, PressableProps, TouchableOpacity, StyleSheet, useColorScheme, View } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Text } from "@/components/Themed";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import Colors from '@/constants/Colors';
import { getStatusColor } from '@/constants/status';
import { spacing, type } from '@/constants/theme';
import { PedidoDatabase } from '@/database/types/Pedido';
import { useEffect, useState } from 'react';
import { usePedidosDatabase } from '@/database/usePedidoDatabase';

type Props = PressableProps & {
  data: PedidoDatabase;
  index?: number;
  onEdit: () => void;
  onDelete?: () => void;
};

export function PedidoItem({ data, index, onEdit, onDelete, ...rest }: Props) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  const statusLabel = data.status ?? 'DESCONHECIDO';
  const { getProdutosByPedidoId } = usePedidosDatabase();
  const [produtos, setProdutos] = useState<{ nome: string; quantidade: number }[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const p = await getProdutosByPedidoId(data.id);
        if (mounted) setProdutos(Array.isArray(p) ? p : []);
      } catch (err) {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, [data.id, data.updated_at]);

  return (
    <Pressable {...rest}>
      <Card padding={0} style={styles.container}>
        <TouchableOpacity onPress={onEdit} style={styles.header}>
          <Text style={styles.cliente}>
            {(data.cliente && String(data.cliente).trim().length > 0) ? data.cliente : 'Cliente não Informado'}
          </Text>
          <FontAwesome name="search" size={16} color={colors.textMuted} />
        </TouchableOpacity>

        <View style={styles.body}>
          <Text style={styles.produtos}>
            Hora: {new Date(data.horario).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </Text>
          <Text style={styles.produtos}>Total: R$ {data.total?.toFixed?.(2) ?? data.total}</Text>
          <Badge label={statusLabel} color={getStatusColor(statusLabel)} />
        </View>

        {produtos && produtos.length > 0 ? (
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <Text style={styles.prodListText}>
              {produtos.slice(0, 3).map(p => `( ${p.quantidade}x ) ${p.nome}`).join(', ')}
              {produtos.length > 3 ? ' ...' : ''}
            </Text>
          </View>
        ) : null}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.md, overflow: 'hidden' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md },
  cliente: { fontWeight: '700', fontSize: type.subtitle },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  produtos: { fontSize: type.body },
  footer: { padding: spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
  prodListText: { fontSize: type.body },
});

export default PedidoItem;
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Rodar suíte (regressão — `pedidos.tsx` e testes de banco usam `PedidoItem` indiretamente)**

Run: `npm test`
Expected: os 13 testes existentes continuam passando (nenhum testa `PedidoItem` diretamente, mas confirma que nada quebrou na cadeia de imports).

- [ ] **Step 4: Commit**

```bash
git add components/PedidoItem.tsx
git commit -m "refactor(mobile): PedidoItem usa Card/Badge/status tokens"
```

---

## Task 12: `components/Product.tsx` (reescrita — Card + Badge + IngredientesModal)

**Files:**
- Modify: `components/Product.tsx` (reescrita completa, 151 linhas)

**Interfaces:**
- Consumes: `Card` (Task 4), `Badge` (Task 5), `IngredientesModal` (Task 8), `tipoColors` (Task 2), `Colors`, `Colors.status.danger` (Task 1).
- Produces: mesma assinatura pública (`Product({ data, tipoNome?, onDelete, onOpen })`).

- [ ] **Step 1: Substituir o arquivo inteiro**

```tsx
import { Pressable, PressableProps, TouchableOpacity, StyleSheet, useColorScheme, View } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Text } from "@/components/Themed";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { IngredientesModal } from "@/components/ui/IngredientesModal";
import Colors from '@/constants/Colors';
import { tipoColors, spacing, type } from '@/constants/theme';
import { useState } from "react";
import { ProductDatabase } from "@/database/types/Produto";

type Props = PressableProps & {
  data: ProductDatabase;
  tipoNome?: string;
  onDelete: () => void;
  onOpen: () => void;
};

export function Product({ data, onDelete, onOpen, tipoNome, ...rest }: Props) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const [modalVisible, setModalVisible] = useState(false);

  const tipoLabel = tipoNome ?? (data as any).tipoNome ?? `Tipo ${data.tipoProdutoId}`;

  return (
    <Pressable {...rest}>
      <Card style={styles.container}>
        <View style={styles.leftInfo}>
          <Text style={styles.nome}>{data.nome}</Text>
          <Text style={styles.preco}>Preço: R$ {data.preco.toFixed(2)}</Text>
        </View>

        <Pressable onPress={() => setModalVisible(true)}>
          <Badge label={tipoLabel} color={tipoColors[data.tipoProdutoId] ?? '#888'} />
        </Pressable>

        <View style={styles.buttonContainer}>
          <TouchableOpacity onPress={onOpen}>
            <FontAwesome name="edit" size={28} color={colors.primary} style={{ marginLeft: spacing.lg }} />
          </TouchableOpacity>

          <TouchableOpacity onPress={onDelete}>
            <FontAwesome name="trash" size={24} color={Colors.status.danger} style={{ marginLeft: spacing.lg }} />
          </TouchableOpacity>
        </View>

        <IngredientesModal
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
          nomeProduto={data.nome}
          ingredientes={data.ingredientes}
        />
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "center" },
  leftInfo: { flex: 1 },
  nome: { fontSize: type.body, fontWeight: "bold", marginBottom: 4 },
  preco: { fontSize: type.bodySm },
  buttonContainer: { flexDirection: "row", alignItems: "center", gap: spacing.md },
});
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add components/Product.tsx
git commit -m "refactor(mobile): Product usa Card/Badge/IngredientesModal"
```

---

## Task 13: `components/ProductItemVenda.tsx` (reescrita — mesma base do Task 12)

**Files:**
- Modify: `components/ProductItemVenda.tsx` (reescrita completa, 157 linhas)

**Interfaces:**
- Consumes: `Card` (Task 4), `Badge` (Task 5), `IngredientesModal` (Task 8), `tipoColors`/`spacing`/`type`/`radius` (Task 2), `Colors` (Task 1).
- Produces: mesma assinatura pública (`ProductItemVenda`, `React.memo`, props `{ data, tipoNome?, onAddToCart, onAdicionaltoCart }`).

- [ ] **Step 1: Substituir o arquivo inteiro**

```tsx
import React, { useState, useRef } from "react";
import { Animated, Pressable, useColorScheme, Easing, View, StyleSheet } from "react-native";
import { Text } from "@/components/Themed";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { IngredientesModal } from "@/components/ui/IngredientesModal";
import { ProductDatabase } from "@/database/types/Produto";
import { FontAwesome } from "@expo/vector-icons";
import Colors from "@/constants/Colors";
import { tipoColors, spacing, type, radius } from "@/constants/theme";

type Props = {
  data: ProductDatabase;
  tipoNome?: string;
  onAddToCart: (product: ProductDatabase) => void;
  onAdicionaltoCart: (product: ProductDatabase, ehAdd: boolean) => void;
};

function ProductItemVendaInner({ data, onAddToCart, onAdicionaltoCart, tipoNome }: Props) {
  const [modalVisible, setModalVisible] = useState(false);
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  const buttonScaleAnim = useRef(new Animated.Value(1)).current;
  const iconScaleAnim = useRef(new Animated.Value(1)).current;

  const triggerAnimation = (anim: Animated.Value) => {
    Animated.sequence([
      Animated.timing(anim, { toValue: 0.8, duration: 100, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(anim, { toValue: 1, duration: 100, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start();
  };

  const tipoLabel = tipoNome ?? (data as any).tipoNome ?? `Tipo ${data.tipoProdutoId}`;

  return (
    <Card style={styles.container}>
      <View style={styles.info}>
        <Text style={styles.nome}>{data.nome}</Text>
        <Text style={styles.preco}>Preço: R$ {data.preco.toFixed(2)}</Text>
      </View>

      <Pressable onPress={() => setModalVisible(true)}>
        <Badge label={tipoLabel} color={tipoColors[data.tipoProdutoId] ?? '#888'} />
      </Pressable>

      <Animated.View style={{ transform: [{ scale: iconScaleAnim }] }}>
        <Pressable
          onPress={() => { triggerAnimation(iconScaleAnim); onAdicionaltoCart(data, true); }}
          style={{ flexDirection: "row" }}
        >
          <FontAwesome name="flash" size={25} color={colors.primary} style={{ marginRight: spacing.xl, marginLeft: spacing.md }} />
        </Pressable>
      </Animated.View>

      <Animated.View style={{ transform: [{ scale: buttonScaleAnim }] }}>
        <Pressable
          onPress={() => { triggerAnimation(buttonScaleAnim); onAddToCart(data); }}
          style={[styles.addButton, { backgroundColor: colors.primary }]}
        >
          <Text style={[styles.addButtonText, { color: colors.background }]}>+</Text>
        </Pressable>
      </Animated.View>

      <IngredientesModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        nomeProduto={data.nome}
        ingredientes={data.ingredientes}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  info: { flex: 1 },
  nome: { fontSize: type.body, fontWeight: "bold" },
  preco: { fontSize: type.bodySm },
  addButton: { width: 44, height: 44, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', marginLeft: spacing.sm },
  addButtonText: { fontSize: type.title, fontWeight: '700' },
});

export const ProductItemVenda = React.memo(ProductItemVendaInner);
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Rodar suíte (regressão — `useProductDatabase.test.tsx` usa dados de produto)**

Run: `npm test`
Expected: 13 testes continuam passando.

- [ ] **Step 4: Commit**

```bash
git add components/ProductItemVenda.tsx
git commit -m "refactor(mobile): ProductItemVenda usa Card/Badge/IngredientesModal"
```

---

## Task 14: `components/SyncIndicator.tsx` (diff — só cor)

**Files:**
- Modify: `components/SyncIndicator.tsx:1-2,96-104`

**Interfaces:**
- Consumes: `Colors` (Task 1).
- Produces: sem mudança de assinatura (`export default function SyncIndicator()`).

- [ ] **Step 1: Adicionar imports**

Old (linha 1):
```tsx
import React, { useState, useRef, useEffect } from 'react';
import { TouchableOpacity, View, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useAutoSync } from '@/context/AutoSyncContext';
```

New:
```tsx
import React, { useState, useRef, useEffect } from 'react';
import { TouchableOpacity, View, ActivityIndicator, StyleSheet, Alert, useColorScheme } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useAutoSync } from '@/context/AutoSyncContext';
import Colors from '@/constants/Colors';
```

- [ ] **Step 2: Adicionar leitura de tema logo no início do componente**

Old:
```tsx
export default function SyncIndicator() {
  const { isSyncing, triggerSync } = useAutoSync();
```

New:
```tsx
export default function SyncIndicator() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const { isSyncing, triggerSync } = useAutoSync();
```

- [ ] **Step 3: Retokenizar os 4 ícones de estado**

Old:
```tsx
        { (isSyncing || localLoading) ? (
          <ActivityIndicator size="small" color="#007AFF" />
        ) : result === 'success' ? (
          <FontAwesome name="check" size={18} color="#28a745" />
        ) : result === 'error' ? (
          <FontAwesome name="times" size={18} color="#dc3545" />
        ) : (
          <FontAwesome name="refresh" size={20} color="#007AFF" />
        ) }
```

New:
```tsx
        { (isSyncing || localLoading) ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : result === 'success' ? (
          <FontAwesome name="check" size={18} color={colors.primary} />
        ) : result === 'error' ? (
          <FontAwesome name="times" size={18} color={Colors.status.danger} />
        ) : (
          <FontAwesome name="refresh" size={20} color={colors.primary} />
        ) }
```

(erro continua vermelho — sinal real de falha, vale manter saliente; sucesso vira monocromático.)

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add components/SyncIndicator.tsx
git commit -m "refactor(mobile): SyncIndicator usa tokens de cor"
```

---

## Task 15: Logo novo — gerar assets PNG a partir do SVG do front

**Files:**
- Modify: `assets/images/icon-geral.png` (ícone/splash/adaptive icon — mesmo arquivo, 3 usos em `app.json`)
- Modify: `assets/images/logo-login.png` (tela de login)
- Modify: `assets/images/favicon.png` (web)

**Contexto:** `app.json` exige PNG pros campos `icon`/`splash.image`/`android.adaptiveIcon.foregroundImage`/`web.favicon` — SVG não é aceito nesses campos pelo Expo. O projeto tem `react-native-svg` instalado (dependência transitiva) mas nenhum código usa renderização de SVG em runtime hoje — não vale introduzir esse caminho novo só pro logo. Decisão: **rasterizar o SVG uma vez pra PNG** e usar PNG em todo lugar (login incluso), mantendo os nomes de arquivo atuais — **zero mudança em `app.json`**. A arte-fonte (`front/front-tozzo.uk/src/assets/images/logo.svg`) já tem o círculo branco embutido no próprio path, então o PNG pode ser gerado com fundo transparente e funciona em qualquer bg.

**Interfaces:** nenhuma — só troca de bytes de arquivo binário, sem código.

- [ ] **Step 1: Instalar `sharp` temporariamente (não persiste no `package.json`)**

Run: `npm install --no-save --no-package-lock sharp`

Se falhar (rede/proxy bloqueando download do binário pré-compilado): pular pro fallback manual — pedir pro usuário exportar `icon-geral.png` (1024x1024), `logo-login.png` (512x512) e `favicon.png` (196x196) a partir de `front/front-tozzo.uk/src/assets/images/logo.svg` numa ferramenta de design (Figma/Illustrator/Inkscape) e colocar em `assets/images/` com esses nomes exatos, depois pular pro Step 4.

- [ ] **Step 2: Criar script descartável de rasterização**

Criar `scripts/_gen-logo.js` (temporário — apagar no Step 4):

```js
const sharp = require('sharp');
const path = require('path');

const SRC = path.resolve(__dirname, '../../front/front-tozzo.uk/src/assets/images/logo.svg');
const OUT_DIR = path.resolve(__dirname, '../assets/images');

async function run() {
  const targets = [
    { file: 'icon-geral.png', size: 1024 },
    { file: 'logo-login.png', size: 512 },
    { file: 'favicon.png', size: 196 },
  ];

  for (const t of targets) {
    await sharp(SRC, { density: 384 })
      .resize(t.size, t.size)
      .png()
      .toFile(path.join(OUT_DIR, t.file));
    console.log(`gerado: ${t.file} (${t.size}x${t.size})`);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Rodar o script**

Run: `node scripts/_gen-logo.js`
Expected: 3 linhas `gerado: ...` no console, sem erro.

- [ ] **Step 4: Apagar o script descartável**

Run: `rm scripts/_gen-logo.js` (ou `Remove-Item scripts/_gen-logo.js` no PowerShell)

Verificar que `node_modules`/`package.json`/`package-lock.json` não têm `sharp` listado (instalado com `--no-save` — nada pra reverter, mas confirmar `git status` limpo em `package.json`).

- [ ] **Step 5: Conferir visualmente**

Abrir os 3 PNGs gerados (`assets/images/icon-geral.png`, `logo-login.png`, `favicon.png`) e confirmar que renderizam a arte nova (círculo + burger), não um quadrado em branco (indicaria falha silenciosa de rasterização).

- [ ] **Step 6: Commit**

```bash
git add assets/images/icon-geral.png assets/images/logo-login.png assets/images/favicon.png
git commit -m "feat(mobile): aplica logo novo (SVG do front rasterizado em PNG)"
```

---

## Task 16: `app/login.tsx` (diff — retoken + ajuste do logo)

**Files:**
- Modify: `app/login.tsx`

**Interfaces:**
- Consumes: `Colors` (Task 1), assets do Task 15.

- [ ] **Step 1: Adicionar import de `Colors`**

Old:
```tsx
import { useColorScheme } from '@/components/useColorScheme';
import { useAuth } from '@/context/AuthContext';
import { useAutoSync } from '@/context/AutoSyncContext';
```

New:
```tsx
import { useColorScheme } from '@/components/useColorScheme';
import { useAuth } from '@/context/AuthContext';
import { useAutoSync } from '@/context/AutoSyncContext';
import Colors from '@/constants/Colors';
```

- [ ] **Step 2: Trocar `isDark` por `colors`**

Old:
```tsx
  const { login } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
```

New:
```tsx
  const { login } = useAuth();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
```

- [ ] **Step 3: Retokenizar container, logo, título e inputs**

Old:
```tsx
    <View style={[styles.container, { backgroundColor: isDark ? '#000' : '#fff' }]}>
      <Image
        source={require('../assets/images/logo-login.png')}
        style={[styles.logo, { backgroundColor: isDark ? 'transparent' : '#fff' }]}
        resizeMode="contain"
        fadeDuration={0}
      />
      <Text style={[styles.title, { color: isDark ? '#fff' : '#000' }]}>Tozzo.uk</Text>
      <View style={styles.form}>
        <TextInput
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          style={[styles.input, { backgroundColor: isDark ? '#111' : '#fff', borderColor: isDark ? '#333' : '#ddd', color: isDark ? '#fff' : '#000' }]}
          placeholderTextColor={isDark ? '#9b9b9b' : '#8a8a8a'}
        />
        <TextInput
          placeholder="Senha"
          value={senha}
          onChangeText={setSenha}
          secureTextEntry
          style={[styles.input, { backgroundColor: isDark ? '#111' : '#fff', borderColor: isDark ? '#333' : '#ddd', color: isDark ? '#fff' : '#000' }]}
          placeholderTextColor={isDark ? '#9b9b9b' : '#8a8a8a'}
        />
```

New:
```tsx
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Image
        source={require('../assets/images/logo-login.png')}
        style={styles.logo}
        resizeMode="contain"
        fadeDuration={0}
      />
      <Text style={[styles.title, { color: colors.text }]}>Tozzo.uk</Text>
      <View style={styles.form}>
        <TextInput
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
          placeholderTextColor={colors.textMuted}
        />
        <TextInput
          placeholder="Senha"
          value={senha}
          onChangeText={setSenha}
          secureTextEntry
          style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
          placeholderTextColor={colors.textMuted}
        />
```

- [ ] **Step 4: Retokenizar botão de entrar**

Old:
```tsx
        <Pressable style={[styles.button]} onPress={handleLogin} disabled={loading}>
          {(loading || waitingSync) ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <ActivityIndicator color="#fff" />
              <Text style={[styles.buttonText, { marginLeft: 8 }]}>{waitingSync ? 'Sincronizando...' : 'Entrando...'}</Text>
            </View>
          ) : (
            <Text style={styles.buttonText}>Entrar</Text>
          )}
        </Pressable>
```

New:
```tsx
        <Pressable style={[styles.button, { backgroundColor: colors.primary }]} onPress={handleLogin} disabled={loading}>
          {(loading || waitingSync) ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <ActivityIndicator color={colors.background} />
              <Text style={[styles.buttonText, { color: colors.background, marginLeft: 8 }]}>{waitingSync ? 'Sincronizando...' : 'Entrando...'}</Text>
            </View>
          ) : (
            <Text style={[styles.buttonText, { color: colors.background }]}>Entrar</Text>
          )}
        </Pressable>
```

- [ ] **Step 5: Remover cor fixa do `StyleSheet` (agora só inline)**

Old:
```ts
const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
```

New:
```ts
const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
```

E remover `backgroundColor: '#0084ffff'` de `styles.button` (fica só `height/borderRadius/justifyContent/alignItems/marginTop`, cor aplicada inline no Step 4) e `color: '#fff'` de `styles.buttonText` (idem, cor inline).

- [ ] **Step 6: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 7: Commit**

```bash
git add app/login.tsx
git commit -m "refactor(mobile): login usa tokens de cor + logo novo"
```

---

## Task 17: `app/(tabs)/_layout.tsx` (diff — tab bar preto/branco + fix tabIconDefault não usado)

**Files:**
- Modify: `app/(tabs)/_layout.tsx`

**Interfaces:**
- Consumes: `Colors` (Task 1, já importado no arquivo).

**Achado:** `Colors.ts` sempre teve `tabIconDefault`, mas o `Tabs` nunca setava `tabBarInactiveTintColor` — o token nunca era consumido (mesmo padrão do achado principal do audit). Corrigido aqui.

- [ ] **Step 1: Setar `tabBarInactiveTintColor` e usar `.primary`**

Old:
```tsx
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: useClientOnlyValue(false, true),
        headerRight: () => <SyncIndicator />,
      }}>
```

New:
```tsx
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].primary,
        tabBarInactiveTintColor: Colors[colorScheme ?? 'light'].tabIconDefault,
        headerShown: useClientOnlyValue(false, true),
        headerRight: () => <SyncIndicator />,
      }}>
```

- [ ] **Step 2: Trocar `.tint` por `.primary` nos 2 ícones de header (flash e plus-circle)**

Old (headerLeft do `index`):
```tsx
                  <FontAwesome
                    name="flash"
                    size={30}
                    color={Colors[colorScheme ?? 'light'].tint}
                    style={{ marginLeft: 20, opacity: pressed ? 0.5 : 1 }}
                  />
```

New:
```tsx
                  <FontAwesome
                    name="flash"
                    size={30}
                    color={Colors[colorScheme ?? 'light'].primary}
                    style={{ marginLeft: 20, opacity: pressed ? 0.5 : 1 }}
                  />
```

Old (headerRight do `produtos`):
```tsx
                    <FontAwesome
                      name="plus-circle"
                      size={30}
                      color={Colors[colorScheme ?? 'light'].tint}
                      style={{ marginRight: 8, opacity: pressed ? 0.5 : 1 }}
                    />
```

New:
```tsx
                    <FontAwesome
                      name="plus-circle"
                      size={30}
                      color={Colors[colorScheme ?? 'light'].primary}
                      style={{ marginRight: 8, opacity: pressed ? 0.5 : 1 }}
                    />
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add "app/(tabs)/_layout.tsx"
git commit -m "fix(mobile): tab bar usa tabIconDefault (nunca era consumido) + preto/branco"
```

---

## Task 18: `app/(tabs)/index.tsx` (diff — Button + EmptyState)

**Files:**
- Modify: `app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: `Button` (Task 3), `EmptyState` (Task 7), `spacing` (Task 2).

- [ ] **Step 1: Ajustar imports**

Old:
```tsx
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { View } from '@/components/Themed';
import { ProductItemVenda } from '@/components/ProductItemVenda';
import { FiltroTipos } from '@/components/FiltroTipos';
import { Input } from '@/components/Input';
```

New:
```tsx
import { FlatList, RefreshControl, StyleSheet } from 'react-native';
import { View } from '@/components/Themed';
import { ProductItemVenda } from '@/components/ProductItemVenda';
import { FiltroTipos } from '@/components/FiltroTipos';
import { Input } from '@/components/Input';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { spacing } from '@/constants/theme';
```

- [ ] **Step 2: Trocar `CartButton` pra usar `Button`**

Old:
```tsx
function CartButton() {
  const { cart } = useCart();
  const total = cart.reduce((sum, item) => sum + (item.quantidade ?? 0), 0);
  if (total <= 0) return null;
  return (
    <TouchableOpacity style={styles.button} onPress={() => router.push('/modais/contaModal')}>
      <Text style={styles.buttonText}>Ver Conta ({total})</Text>
    </TouchableOpacity>
  );
}
```

New:
```tsx
function CartButton() {
  const { cart } = useCart();
  const total = cart.reduce((sum, item) => sum + (item.quantidade ?? 0), 0);
  if (total <= 0) return null;
  return (
    <Button
      title={`Ver Conta (${total})`}
      onPress={() => router.push('/modais/contaModal')}
      style={styles.buttonWrap}
    />
  );
}
```

- [ ] **Step 3: Adicionar `ListEmptyComponent` na `FlatList`**

Old:
```tsx
      <FlatList
        data={products}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={listContentStyle}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />
```

New:
```tsx
      <FlatList
        data={products}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={listContentStyle}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<EmptyState icon="cutlery" title="Nenhum produto encontrado" message="Ajuste a busca ou o filtro de tipo." />}
      />
```

- [ ] **Step 4: Limpar `styles` (remove `button`/`buttonText`, adiciona `buttonWrap`)**

Old:
```ts
const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  button: {
    backgroundColor: "#007BFF",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 16,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  separator: {
    marginVertical: 30,
    height: 1,
    width: '80%',
  },
});
```

New:
```ts
const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  buttonWrap: {
    marginTop: spacing.lg,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  separator: {
    marginVertical: 30,
    height: 1,
    width: '80%',
  },
});
```

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 6: Commit**

```bash
git add "app/(tabs)/index.tsx"
git commit -m "refactor(mobile): tela Vender usa Button/EmptyState"
```

---

## Task 19: `app/(tabs)/pedidos.tsx` (reescrita — remove código morto + EmptyState)

**Files:**
- Modify: `app/(tabs)/pedidos.tsx` (reescrita completa, 97 linhas)

**Interfaces:**
- Consumes: `EmptyState` (Task 7), `spacing/type` (Task 2).
- Remove código morto do audit: estilos `pedidoItem`, `pedidoLeft`, `counter`, `info`, `cliente`, `produtos`, `actions`, `status`, `editButton`, `deleteButton`, `buttonText` nunca eram referenciados (a tela renderiza via `<PedidoItem>`, não via `styles.pedidoItem`).

- [ ] **Step 1: Substituir o arquivo inteiro**

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Alert, FlatList, RefreshControl } from 'react-native';
import { View, Text } from '@/components/Themed';
import { usePedidosDatabase } from '@/database/usePedidoDatabase';
import { useAutoSync } from '@/context/AutoSyncContext';
import PedidoItem from '@/components/PedidoItem';
import { EmptyState } from '@/components/ui/EmptyState';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useSyncRefresh } from '@/hooks/useSyncRefresh';
import { spacing, type } from '@/constants/theme';

export default function Pedidos() {
  const { listPedidosRecentes, listPedidosRecentesPorUsuario, removePedido } = usePedidosDatabase();
  const { lastSync } = useAutoSync();
  const { user } = useAuth();
  const { refreshing, onRefresh } = useSyncRefresh();
  const isCliente = user?.role === 'CLIENTE';
  const [pedidosPorData, setPedidosPorData] = useState<Record<string, any[]>>({});

  async function load() {
    try {
      const data = isCliente && user?.id
        ? await listPedidosRecentesPorUsuario(user.id)
        : await listPedidosRecentes();
      setPedidosPorData(data);
    } catch (err) {
      console.error('Erro ao carregar pedidos:', err);
    }
  }

  useFocusEffect(
    useCallback(() => {
      load();
    }, [])
  );

  useEffect(() => {
    load();
  }, [lastSync]);

  const handleEdit = (pedidoId: string) => {
    router.push({ pathname: '/modais/pedidoModal', params: { pedidoId } });
  };

  const handleDelete = (pedidoId: string) => {
    Alert.alert('Confirmação', 'Deseja excluir este pedido?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: async () => { await removePedido(pedidoId); await load(); } },
    ]);
  };

  const renderPedido = (pedido: any, index: number) => (
    <PedidoItem
      key={pedido.id}
      data={pedido}
      index={index}
      onEdit={() => handleEdit(pedido.id)}
      onDelete={isCliente ? undefined : () => handleDelete(pedido.id)}
    />
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Pedidos Recentes</Text>
      <FlatList
        data={Object.keys(pedidosPorData)}
        keyExtractor={(d) => d}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<EmptyState icon="list" title="Nenhum pedido recente" message="Pedidos aparecem aqui assim que forem criados." />}
        renderItem={({ item: dataKey }) => (
          <View style={styles.group}>
            <Text style={styles.date}>{dataKey}</Text>
            {(pedidosPorData[dataKey] || []).map((p, idx) => renderPedido(p, idx))}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg },
  title: { fontSize: type.title, fontWeight: 'bold', marginBottom: spacing.md },
  group: { marginBottom: spacing.xl },
  date: { fontSize: type.body, fontWeight: '600', marginBottom: spacing.sm },
});
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add "app/(tabs)/pedidos.tsx"
git commit -m "fix(mobile): remove estilos mortos em pedidos.tsx + EmptyState"
```

---

## Task 20: `app/(tabs)/produtos.tsx` (diff — só EmptyState, sem cor hardcoded pra migrar)

**Files:**
- Modify: `app/(tabs)/produtos.tsx`

**Interfaces:**
- Consumes: `EmptyState` (Task 7).

- [ ] **Step 1: Adicionar import**

Old:
```tsx
import { Product } from "@/components/Product"
import { router } from "expo-router"
import { useSyncRefresh } from "@/hooks/useSyncRefresh"
```

New:
```tsx
import { Product } from "@/components/Product"
import { router } from "expo-router"
import { useSyncRefresh } from "@/hooks/useSyncRefresh"
import { EmptyState } from "@/components/ui/EmptyState"
```

- [ ] **Step 2: Adicionar `ListEmptyComponent`**

Old:
```tsx
      <FlatList
        data={products}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => {
```

New:
```tsx
      <FlatList
        data={products}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={<EmptyState icon="cutlery" title="Nenhum produto cadastrado" message="Toque no + pra adicionar o primeiro item." />}
        renderItem={({ item }) => {
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add "app/(tabs)/produtos.tsx"
git commit -m "feat(mobile): EmptyState na tela de Produtos"
```

---

## Task 21: `app/(tabs)/historico.tsx` (diff — cor + calendário + EmptyState, resto intocado)

**Files:**
- Modify: `app/(tabs)/historico.tsx` (490 linhas — só as linhas com cor hardcoded mudam, lógica de busca/impressão/compartilhamento fica igual)

**Interfaces:**
- Consumes: `Colors` (Task 1), `EmptyState` (Task 7).

- [ ] **Step 1: Adicionar import de `Colors` e `EmptyState`**

Old:
```tsx
import { formatarVendaParaImpressao } from '@/hooks/formatarVendaImpressao';
import { Produto } from '@/hooks/formatarVendaImpressao';
import { sendMessageToDevice } from '@/useBLE';
import { Calendar } from 'react-native-calendars';
```

New:
```tsx
import { formatarVendaParaImpressao } from '@/hooks/formatarVendaImpressao';
import { Produto } from '@/hooks/formatarVendaImpressao';
import { sendMessageToDevice } from '@/useBLE';
import { Calendar } from 'react-native-calendars';
import Colors from '@/constants/Colors';
import { EmptyState } from '@/components/ui/EmptyState';
```

- [ ] **Step 2: Ler `colors` (o arquivo já tem `colorScheme` na linha 28)**

Old:
```tsx
  const router = useRouter();
  const colorScheme = useColorScheme();
  const [title, setTitle] = useState('Histórico de Vendas (Últimos 3 dias)');
```

New:
```tsx
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const [title, setTitle] = useState('Histórico de Vendas (Últimos 3 dias)');
```

- [ ] **Step 3: Retokenizar o bloco `StyleSheet.create` (já é criado dentro do componente, então já enxerga `colors`)**

Old (trechos com cor, dentro do `styles = StyleSheet.create({...})`):
```ts
    dateButton: {
      padding: 12,
      borderRadius: 8,
      width: '100%',
      borderWidth: 1,
      borderColor: '#999',
    },
```
```ts
    button: {
      padding: 10,
      backgroundColor: '#007bff',
      borderRadius: 5,
      justifyContent: 'center',
      alignItems: 'center',
      marginHorizontal: 5,
      width: 60,
    },
    searchButton: {
      backgroundColor: '#2196F3',
      padding: 10,
      borderRadius: 8,
      width: '100%',
      alignItems: 'center',
    },
```
```ts
    Greenbutton: {
      padding: 10,
      backgroundColor: 'green',
      borderRadius: 5,
      justifyContent: 'center',
      alignItems: 'center',
      marginHorizontal: 5,
      width: 60,
    },
    Redbutton: {
      padding: 10,
      backgroundColor: 'red',
      borderRadius: 5,
      justifyContent: 'center',
      alignItems: 'center',
      marginHorizontal: 5,
      width: 60,
    },
```
```ts
    closeButton: {
      backgroundColor: '#2196F3',
      padding: 12,
      borderRadius: 8,
      alignItems: 'center',
      marginTop: 15,
    },
```
```ts
    disabledColor: {
      color: colorScheme === "dark" ? "black" : "grey",
    },
    disabledBackground: {
      backgroundColor: colorScheme === "dark" ? "#2F4F5F" : "grey",
    },
```

New (mesmos blocos, cores trocadas):
```ts
    dateButton: {
      padding: 12,
      borderRadius: 8,
      width: '100%',
      borderWidth: 1,
      borderColor: colors.border,
    },
```
```ts
    button: {
      padding: 10,
      backgroundColor: colors.primary,
      borderRadius: 5,
      justifyContent: 'center',
      alignItems: 'center',
      marginHorizontal: 5,
      width: 60,
    },
    searchButton: {
      backgroundColor: colors.primary,
      padding: 10,
      borderRadius: 8,
      width: '100%',
      alignItems: 'center',
    },
```
```ts
    Greenbutton: {
      padding: 10,
      backgroundColor: colors.primary,
      borderRadius: 5,
      justifyContent: 'center',
      alignItems: 'center',
      marginHorizontal: 5,
      width: 60,
    },
    Redbutton: {
      padding: 10,
      backgroundColor: Colors.status.danger,
      borderRadius: 5,
      justifyContent: 'center',
      alignItems: 'center',
      marginHorizontal: 5,
      width: 60,
    },
```
```ts
    closeButton: {
      backgroundColor: colors.primary,
      padding: 12,
      borderRadius: 8,
      alignItems: 'center',
      marginTop: 15,
    },
```
```ts
    disabledColor: {
      color: colors.textMuted,
    },
    disabledBackground: {
      backgroundColor: colors.surface,
    },
```

(`disabledColor` no dark mode antes era `"black"` — texto preto invisível num fundo escuro. Bug de contraste real, corrigido de graça por já estar mexendo nessa linha exata.)

- [ ] **Step 4: Retokenizar o spinner de loading**

Old:
```tsx
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007bff" />
        </View>
```

New:
```tsx
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
```

- [ ] **Step 5: Retokenizar o tema do `Calendar`**

Old:
```tsx
                markedDates={{
                  [formatCalendarDate(searchDate)]: {
                    selected: true,
                    selectedColor: '#2196F3',
                  }
                }}
                theme={{
                  calendarBackground: colorScheme === 'dark' ? '#333' : '#fff',
                  textSectionTitleColor: '#b6c1cd',
                  selectedDayBackgroundColor: '#2196F3',
                  selectedDayTextColor: '#ffffff',
                  todayTextColor: '#2196F3',
                  dayTextColor: colorScheme === 'dark' ? '#fff' : '#2d4150',
                  textDisabledColor: '#d9e1e8',
                  dotColor: '#2196F3',
                  selectedDotColor: '#ffffff',
                  arrowColor: '#2196F3',
                  monthTextColor: colorScheme === 'dark' ? '#fff' : '#2d4150',
                  indicatorColor: '#2196F3',
                }}
```

New:
```tsx
                markedDates={{
                  [formatCalendarDate(searchDate)]: {
                    selected: true,
                    selectedColor: colors.primary,
                  }
                }}
                theme={{
                  calendarBackground: colors.surface,
                  textSectionTitleColor: colors.textMuted,
                  selectedDayBackgroundColor: colors.primary,
                  selectedDayTextColor: colors.background,
                  todayTextColor: colors.primary,
                  dayTextColor: colors.text,
                  textDisabledColor: colors.textMuted,
                  dotColor: colors.primary,
                  selectedDotColor: colors.background,
                  arrowColor: colors.primary,
                  monthTextColor: colors.text,
                  indicatorColor: colors.primary,
                }}
```

- [ ] **Step 6: Trocar `lightColor`/`darkColor` fixos pelo token `surface` (2 ocorrências: item da venda + buttonContainer)**

Old (aparece 2x, uma no `View` externo e outra no `buttonContainer` do mesmo `renderVendaItem`):
```tsx
    <View style={styles.item} lightColor="whitesmoke" darkColor="grey">
```
```tsx
      <View style={styles.buttonContainer} lightColor="whitesmoke" darkColor="grey">
```

New:
```tsx
    <View style={styles.item} lightColor={Colors.light.surface} darkColor={Colors.dark.surface}>
```
```tsx
      <View style={styles.buttonContainer} lightColor={Colors.light.surface} darkColor={Colors.dark.surface}>
```

- [ ] **Step 7: Adicionar `EmptyState` na `FlatList` de vendas por dia**

Old:
```tsx
        <FlatList
          data={Object.entries(vendas)}
          renderItem={({ item }) => {
            const [data, vendasDoDia] = item as [string, (VendaDatabase & { produtos: string[] })[]];
            return renderVendasPorData(data, vendasDoDia);
          }}
          keyExtractor={(item) => item[0]}
          showsVerticalScrollIndicator={true}
          style={{ flex: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
```

New:
```tsx
        <FlatList
          data={Object.entries(vendas)}
          renderItem={({ item }) => {
            const [data, vendasDoDia] = item as [string, (VendaDatabase & { produtos: string[] })[]];
            return renderVendasPorData(data, vendasDoDia);
          }}
          keyExtractor={(item) => item[0]}
          showsVerticalScrollIndicator={true}
          style={{ flex: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<EmptyState icon="clock-o" title="Nenhuma venda no período" message="Busque outra data ou aguarde novas vendas." />}
        />
```

- [ ] **Step 8: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 9: Commit**

```bash
git add "app/(tabs)/historico.tsx"
git commit -m "refactor(mobile): historico usa tokens de cor + fix contraste dark mode + EmptyState"
```

---

## Task 22: `app/(tabs)/configs.tsx` (diff — cor + `Button` nos 4 CTAs nativos)

**Files:**
- Modify: `app/(tabs)/configs.tsx`

**Interfaces:**
- Consumes: `Colors` (Task 1), `Button` (Task 3).

- [ ] **Step 1: Trocar `Button` nativo pelo componente novo nos imports**

Old:
```tsx
import React, { useState, useEffect } from 'react';
import { Button, Alert, ActivityIndicator, TextInput, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import FontAwesome from '@expo/vector-icons/FontAwesome';
```

New:
```tsx
import React, { useState, useEffect } from 'react';
import { Alert, ActivityIndicator, TextInput, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Button } from '@/components/ui/Button';
import Colors from '@/constants/Colors';
```

- [ ] **Step 2: Ler `colors` junto com `isDark`**

Old:
```tsx
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
```

New:
```tsx
  const colorScheme = useColorScheme() ?? 'light';
  const isDark = colorScheme === 'dark';
  const colors = Colors[colorScheme];
```

- [ ] **Step 3: Retokenizar `ScrollView`, seções e textos (usuário + impressora)**

Old:
```tsx
    <ScrollView
      style={{ flex: 1, backgroundColor: isDark ? '#000' : '#fff' }}
      contentContainerStyle={{ padding: 20 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >

      {/* Sections: User / Printer */}
      <View style={[styles.section, { backgroundColor: isDark ? '#111' : '#fff', borderColor: isDark ? '#222' : '#e6e6e6' }]}>
        <View style={[styles.sectionHeader, { backgroundColor: isDark ? '#0d0d0d' : '#fafafa' }] }>
          <Text style={[styles.sectionTitle, { color: isDark ? '#fff' : '#000' }]}>Usuário</Text>
        </View>
        <View style={styles.sectionContent}>
          {user ? (
            <View style={{ alignItems: 'center' }}>
              <FontAwesome name="user-circle" size={56} color={isDark ? '#ddd' : '#666'} style={styles.userIcon} />
              <Text style={[styles.username, { color: isDark ? '#fff' : '#000' }]}>{user.nome ?? user.email}</Text>
              <View style={{ marginTop: 8 }}>
                <Button title="Sair" onPress={() => logout()} />
              </View>
            </View>
          ) : (
            <View>
              <Text style={{ marginBottom: 8, color: isDark ? '#fff' : '#000' }}>Conecte-se à API para sincronizar</Text>
              <TextInput
                placeholder="E-mail"
                value={email}
                onChangeText={setEmail}
                style={[styles.input, { backgroundColor: isDark ? '#111' : '#fff', borderColor: isDark ? '#333' : '#ccc', color: isDark ? '#fff' : '#000' }]}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <TextInput
                placeholder="Senha"
                value={senha}
                onChangeText={setSenha}
                style={[styles.input, { backgroundColor: isDark ? '#111' : '#fff', borderColor: isDark ? '#333' : '#ccc', color: isDark ? '#fff' : '#000' }]}
                secureTextEntry
              />
              <Button title={loginLoading ? 'Entrando...' : 'Entrar'} onPress={handleLogin} disabled={loginLoading} />
            </View>
          )}
        </View>
      </View>

      {!isCliente && (
        <View style={[styles.section, { backgroundColor: isDark ? '#111' : '#fff', borderColor: isDark ? '#222' : '#e6e6e6' }]}>
          <View style={[styles.sectionHeader, { backgroundColor: isDark ? '#0d0d0d' : '#fafafa' }] }>
            <Text style={[styles.sectionTitle, { color: isDark ? '#fff' : '#000' }]}>Impressora</Text>
          </View>
          <View style={styles.sectionContent}>
            {connectedPrinter ? (
              <View>
                <Text style={{ fontSize: 18, marginBottom: 10, color: isDark ? '#fff' : '#000' }}>Impressora conectada: {connectedPrinter}</Text>
                <Button title="Remover Impressora" onPress={handleRemovePrinter} />
              </View>
            ) : (
              <View>
                <Button title="Adicionar Impressora" onPress={handleScanDevices} />
              </View>
            )}
          </View>
        </View>
      )}

      {!isCliente && (isScanning ? (
        <ActivityIndicator size="large" color={isDark ? '#fff' : '#0000ff'} />
      ) : (
        devices.map((item) => (
          <View key={item.id} style={{ marginVertical: 10 }}>
            <Text style={{ textAlign: 'center', margin: 10, color: isDark ? '#fff' : '#000' }}>{item.name || 'Dispositivo desconhecido'}</Text>
            <Button title="Registrar Impressora" onPress={() => handleConnect(item)} />
          </View>
        ))
      ))}

      <Text style={{ textAlign: 'center', color: isDark ? '#555' : '#aaa', fontSize: 12, marginTop: 16 }}>
        v{Constants.expoConfig?.version ?? '?'}
      </Text>
    </ScrollView>
```

New:
```tsx
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 20 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >

      {/* Sections: User / Printer */}
      <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.sectionHeader, { backgroundColor: colors.surfaceHeader }] }>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Usuário</Text>
        </View>
        <View style={styles.sectionContent}>
          {user ? (
            <View style={{ alignItems: 'center' }}>
              <FontAwesome name="user-circle" size={56} color={colors.textMuted} style={styles.userIcon} />
              <Text style={[styles.username, { color: colors.text }]}>{user.nome ?? user.email}</Text>
              <View style={{ marginTop: 8 }}>
                <Button title="Sair" onPress={() => logout()} variant="outline" />
              </View>
            </View>
          ) : (
            <View>
              <Text style={{ marginBottom: 8, color: colors.text }}>Conecte-se à API para sincronizar</Text>
              <TextInput
                placeholder="E-mail"
                value={email}
                onChangeText={setEmail}
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <TextInput
                placeholder="Senha"
                value={senha}
                onChangeText={setSenha}
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                secureTextEntry
              />
              <Button title={loginLoading ? 'Entrando...' : 'Entrar'} onPress={handleLogin} disabled={loginLoading} loading={loginLoading} />
            </View>
          )}
        </View>
      </View>

      {!isCliente && (
        <View style={[styles.section, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[styles.sectionHeader, { backgroundColor: colors.surfaceHeader }] }>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Impressora</Text>
          </View>
          <View style={styles.sectionContent}>
            {connectedPrinter ? (
              <View>
                <Text style={{ fontSize: 18, marginBottom: 10, color: colors.text }}>Impressora conectada: {connectedPrinter}</Text>
                <Button title="Remover Impressora" onPress={handleRemovePrinter} variant="danger" />
              </View>
            ) : (
              <View>
                <Button title="Adicionar Impressora" onPress={handleScanDevices} />
              </View>
            )}
          </View>
        </View>
      )}

      {!isCliente && (isScanning ? (
        <ActivityIndicator size="large" color={colors.primary} />
      ) : (
        devices.map((item) => (
          <View key={item.id} style={{ marginVertical: 10 }}>
            <Text style={{ textAlign: 'center', margin: 10, color: colors.text }}>{item.name || 'Dispositivo desconhecido'}</Text>
            <Button title="Registrar Impressora" onPress={() => handleConnect(item)} />
          </View>
        ))
      ))}

      <Text style={{ textAlign: 'center', color: colors.textMuted, fontSize: 12, marginTop: 16 }}>
        v{Constants.expoConfig?.version ?? '?'}
      </Text>
    </ScrollView>
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add "app/(tabs)/configs.tsx"
git commit -m "refactor(mobile): configs usa Button/tokens de cor"
```

---

## Task 23: `app/modais/adicionalModal.tsx` (reescrita — remove imports mortos + tokens)

**Files:**
- Modify: `app/modais/adicionalModal.tsx` (reescrita completa, 122 linhas)

**Interfaces:**
- Consumes: `Button` (Task 3), `Colors` (Task 1), `spacing/radius/type` (Task 2).
- Limpeza: remove `Picker`/`getTipoProdutos` (importados e nunca usados no original).

- [ ] **Step 1: Substituir o arquivo inteiro**

```tsx
import React, { useState } from 'react';
import { TextInput, Alert } from 'react-native';
import { Text, View } from '@/components/Themed';
import { Button } from '@/components/ui/Button';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { spacing, radius, type } from '@/constants/theme';
import { useProductDatabase } from '@/database/useProductDatabase';
import { useRouter } from 'expo-router';
import { useCart } from '@/context/CartContext';

export default function AdicionalModalScreen() {
  const { create } = useProductDatabase();
  const [nome, setNome] = useState('');
  const [preco, setPreco] = useState('');
  const router = useRouter();
  const { addToCart } = useCart();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  async function handleSave() {
    try {
      if (!nome || !preco) {
        Alert.alert('Erro', 'Por favor, preencha todos os campos.');
        return;
      }

      // create gera UUID string — o antigo insertedRowId numérico virava NaN aqui
      const response = await create({
        nome,
        preco: parseFloat(preco),
        tipoProdutoId: 8,
      });

      await addToCart({
        id: response.id,
        nome,
        preco: parseFloat(preco),
        tipoProdutoId: 8,
        quantidade: 1,
        updated_at: Date.now(),
      });

      router.back();
    } catch (error) {
      console.error('Erro ao salvar produto:', error);
      Alert.alert('Erro', 'Houve um erro ao salvar o produto.');
    }
  }

  return (
    <View style={{ flex: 1, padding: spacing.xl }}>
      <Text style={{ fontSize: type.heading, fontWeight: 'bold' }}>Produto Adicional</Text>
      <View style={{ marginVertical: spacing.xl, height: 1, backgroundColor: colors.border }} />

      <Text style={{ fontSize: type.body, marginVertical: spacing.md, fontWeight: 'bold' }}>Nome do Produto</Text>
      <TextInput
        style={{ padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, color: colors.text }}
        placeholder="Digite o Nome..."
        value={nome}
        onChangeText={setNome}
        placeholderTextColor={colors.textMuted}
      />

      <Text style={{ fontSize: type.body, marginVertical: spacing.md, fontWeight: 'bold' }}>Preço do Produto</Text>
      <TextInput
        style={{ padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, color: colors.text }}
        placeholder="Digite o Preço..."
        value={preco}
        keyboardType="numeric"
        onChangeText={setPreco}
        placeholderTextColor={colors.textMuted}
      />

      <Button title="Salvar" onPress={handleSave} />
    </View>
  );
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add app/modais/adicionalModal.tsx
git commit -m "refactor(mobile): adicionalModal usa Button/tokens + remove imports mortos"
```

---

## Task 24: `app/modais/produtoModal.tsx` (reescrita — tokens + Button, mantém Picker)

**Files:**
- Modify: `app/modais/produtoModal.tsx` (reescrita completa, 187 linhas)

**Interfaces:**
- Consumes: `Button` (Task 3), `Colors` (Task 1), `spacing/radius/type` (Task 2).

- [ ] **Step 1: Substituir o arquivo inteiro**

```tsx
import React, { useEffect, useState } from 'react';
import { TextInput, Alert } from 'react-native';
import { Picker } from "@react-native-picker/picker";
import { Text, View } from '@/components/Themed';
import { Button } from '@/components/ui/Button';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { spacing, radius, type } from '@/constants/theme';
import { useProductDatabase } from '@/database/useProductDatabase';
import { useLocalSearchParams, useRouter } from 'expo-router';

export default function ProdutoModalScreen() {
  const { productId } = useLocalSearchParams();
  const { show, create, update, getTipoProdutos } = useProductDatabase();

  const [nome, setNome] = useState('');
  const [preco, setPreco] = useState('');
  const [ingredientes, setIngredientes] = useState('');
  const [tipoProdutoId, setTipoProdutoId] = useState<number | undefined>();
  const [tiposProdutos, setTiposProdutos] = useState<{ id: number; descricao: string }[]>([]);
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  useEffect(() => {
    async function fetchTiposProdutos() {
      try {
        const tipos = await getTipoProdutos();
        setTiposProdutos(tipos);
      } catch (error) {
        console.error('Erro ao carregar tipos de produtos:', error);
      }
    }

    fetchTiposProdutos();
  }, []);

  useEffect(() => {
    if (productId != null) {
      const prodId = String(productId);
      async function fetchProduct() {
        try {
          const product = await show(prodId);
          if (product) {
            setNome(product.nome);
            setPreco(product.preco.toString());
            setTipoProdutoId(product.tipoProdutoId);
            setIngredientes(product.ingredientes?.toString() || '');
          }
        } catch (error) {
          console.error('Erro ao carregar o produto:', error);
        }
      }

      fetchProduct();
    }
  }, [productId]);

  async function handleSave() {
    try {
      if (!nome || !preco || !tipoProdutoId) {
        Alert.alert('Erro', 'Por favor, preencha os campos obrigatórios: \nnome, preço e tipo.');
        return;
      }

      if (productId) {
        await update({ id: String(productId), nome, preco: parseFloat(preco), tipoProdutoId, ingredientes });
      } else {
        await create({ nome, preco: parseFloat(preco), tipoProdutoId, ingredientes });
      }
      router.back();
    } catch (error) {
      console.error('Erro ao salvar produto:', error);
      Alert.alert('Erro', 'Houve um erro ao salvar o produto.');
    }
  }

  return (
    <View style={{ flex: 1, padding: spacing.xl }}>
      <Text style={{ fontSize: type.heading, fontWeight: 'bold' }}>
        {productId ? 'Editar Produto' : 'Cadastrar Produto'}
      </Text>
      <View style={{ marginVertical: spacing.xl, height: 1, backgroundColor: colors.border }} />

      <Text style={{ fontSize: type.body, marginVertical: spacing.md, fontWeight: 'bold' }}>Nome do Produto</Text>
      <TextInput
        style={{ padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, color: colors.text }}
        placeholder="Digite o Nome..."
        value={nome}
        onChangeText={setNome}
        placeholderTextColor={colors.textMuted}
      />

      <Text style={{ fontSize: type.body, marginVertical: spacing.md, fontWeight: 'bold' }}>Preço do Produto</Text>
      <TextInput
        style={{ padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, color: colors.text }}
        placeholder="Digite o Preço.."
        value={preco}
        keyboardType="numeric"
        onChangeText={setPreco}
        placeholderTextColor={colors.textMuted}
      />

      <Text style={{ fontSize: type.body, marginVertical: spacing.md, fontWeight: 'bold' }}>Ingredientes do Produto</Text>
      <TextInput
        style={{ padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, color: colors.text, height: 100, textAlignVertical: 'top' }}
        placeholder="Digite os Ingredientes.."
        value={ingredientes}
        onChangeText={setIngredientes}
        placeholderTextColor={colors.textMuted}
        multiline
      />

      <Text style={{ fontSize: type.body, marginVertical: spacing.md, fontWeight: 'bold' }}>Tipo do Produto</Text>
      <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, marginBottom: spacing.md }}>
        <Picker
          selectedValue={tipoProdutoId}
          onValueChange={(itemValue) => setTipoProdutoId(Number(itemValue))}
          style={{ color: colors.textMuted }}
          dropdownIconColor={colors.text}
        >
          <Picker.Item label="Selecione um tipo" value={undefined} />
          {tiposProdutos.map((tipo) => (
            <Picker.Item key={tipo.id} label={tipo.descricao} value={tipo.id} />
          ))}
        </Picker>
      </View>

      <Button title="Salvar" onPress={handleSave} />
    </View>
  );
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add app/modais/produtoModal.tsx
git commit -m "refactor(mobile): produtoModal usa Button/tokens"
```

---

## Task 25: `app/modais/contaModal.tsx` (diff — Button nos CTAs de texto + tokens no resto)

**Files:**
- Modify: `app/modais/contaModal.tsx` (288 linhas)

**Interfaces:**
- Consumes: `Button` (Task 3), `Colors` (Task 1), `spacing/radius` (Task 2).
- Ícone-só (share/trash) fica `TouchableOpacity` custom retokenizado — não encaixa na API do `Button` (`title` obrigatório). CTAs de texto ("Gerar Pedido"/"Vender Direto") viram `Button`, aceitando `style={{flex}}` porque o componente aplica `style` por cima do frame externo.

- [ ] **Step 1: Adicionar imports**

Old:
```tsx
import { useAuth } from '@/context/AuthContext';
import { useAutoSync } from '@/context/AutoSyncContext';
```

New:
```tsx
import { useAuth } from '@/context/AuthContext';
import { useAutoSync } from '@/context/AutoSyncContext';
import { Button } from '@/components/ui/Button';
import Colors from '@/constants/Colors';
import { spacing, radius } from '@/constants/theme';
```

- [ ] **Step 2: Ler `colors`**

Old:
```tsx
  const colorScheme = useColorScheme();
  const placeholderColor = colorScheme === "dark" ? "#ccc" : "#666";
```

New:
```tsx
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const placeholderColor = colors.textMuted;
```

- [ ] **Step 3: Retokenizar o `StyleSheet` (o arquivo já cria `styles` dentro do componente)**

Old:
```ts
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      padding: 20
    },
    title: {
      fontSize: 24,
      fontWeight: "bold",
      marginBottom: 20,
    },
    separator: {
      marginVertical: 10,
      height: 1,
      width: "100%",
      backgroundColor: "#ddd",
    },
    cartItem: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 10,
    },
    itemText: {
      fontSize: 16,
    },
    fleNome: {
      flex: 1,
    },
    totalText: {
      fontSize: 25,
      fontWeight: "bold",
      marginVertical: 20,
      textAlign: "center"
    },
    quantityControls: {
      flexDirection: "row",
      alignItems: "center",
    },
    quantityButton: {
      backgroundColor: "#007BFF",
      padding: 5,
      borderRadius: 5,
      marginHorizontal: 10,
    },
    quantityButtonText: {
      color: "#fff",
      fontSize: 18,
      fontWeight: "bold",
    },
    topRow: { flexDirection: 'row', marginTop: 12, alignItems: 'center' },
    bottomRow: { flexDirection: 'row', marginTop: 12, alignItems: 'center' },
    smallBtn: { backgroundColor: '#007BFF', padding: 10, borderRadius: 8, flex: 3, marginRight: 8, alignItems: 'center', justifyContent: 'center' },
    smallBtnRed: { backgroundColor: '#F44336', padding: 10, borderRadius: 8, flex: 3, marginRight: 8, alignItems: 'center', justifyContent: 'center' },
    largeBtn: { backgroundColor: '#007BFF', padding: 10, borderRadius: 8, flex: 7, alignItems: 'center', justifyContent: 'center' },
    largeBtnOrange: { backgroundColor: '#f59e0b', padding: 10, borderRadius: 8, flex: 7, alignItems: 'center', justifyContent: 'center' },
    largeBtnGreen: { backgroundColor: '#10b981', padding: 10, borderRadius: 8, flex: 7, alignItems: 'center', justifyContent: 'center' },
    buttonText: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "bold",
    },
    buttonDisabled: {
      backgroundColor: "#A1A1A1",  // Cor de fundo para o botão desabilitado
    },
    input: {
      width: '100%',
      padding: 10,
      marginVertical: 10,
      borderWidth: 1,
      borderColor: '#ccc',
      borderRadius: 5,
      color: colorScheme === "dark" ? "#fff" : "#000"
    }
  });
```

New:
```ts
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      padding: 20
    },
    title: {
      fontSize: 24,
      fontWeight: "bold",
      marginBottom: 20,
    },
    separator: {
      marginVertical: 10,
      height: 1,
      width: "100%",
      backgroundColor: colors.border,
    },
    cartItem: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 10,
    },
    itemText: {
      fontSize: 16,
    },
    fleNome: {
      flex: 1,
    },
    totalText: {
      fontSize: 25,
      fontWeight: "bold",
      marginVertical: 20,
      textAlign: "center"
    },
    quantityControls: {
      flexDirection: "row",
      alignItems: "center",
    },
    quantityButton: {
      backgroundColor: colors.primary,
      padding: 5,
      borderRadius: 5,
      marginHorizontal: 10,
    },
    topRow: { flexDirection: 'row', marginTop: spacing.md, alignItems: 'center' },
    bottomRow: { flexDirection: 'row', marginTop: spacing.md, alignItems: 'center' },
    iconBtn: { backgroundColor: colors.primary, padding: spacing.md, borderRadius: radius.md, flex: 3, marginRight: spacing.sm, alignItems: 'center', justifyContent: 'center' },
    iconBtnDanger: { backgroundColor: Colors.status.danger, padding: spacing.md, borderRadius: radius.md, flex: 3, marginRight: spacing.sm, alignItems: 'center', justifyContent: 'center' },
    ctaFlex: { flex: 7 },
    buttonDisabled: { opacity: 0.5 },
    input: {
      width: '100%',
      padding: 10,
      marginVertical: 10,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 5,
      color: colors.text,
    }
  });
```

- [ ] **Step 4: Retokenizar título/separadores (remover props fixas do `Themed`)**

Old:
```tsx
      <Text style={styles.title} lightColor="black" darkColor="white">
        Carrinho de Compras
      </Text>
      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />
```

New:
```tsx
      <Text style={styles.title}>
        Carrinho de Compras
      </Text>
      <View style={styles.separator} />
```

(2ª ocorrência do separador, mais abaixo no arquivo, mesma troca: remove `lightColor="#eee" darkColor="rgba(255,255,255,0.1)"`.)

- [ ] **Step 5: Retokenizar disabled do input do cliente**

Old:
```tsx
        style={[styles.input, isCliente && { backgroundColor: colorScheme === 'dark' ? '#1a1a1a' : '#e9e9e9' }]}
```

New:
```tsx
        style={[styles.input, isCliente && { backgroundColor: colors.surface }]}
```

- [ ] **Step 6: Retokenizar ícones +/- do carrinho (branco fixo quebra no dark mode, já que o fundo virou `colors.primary`)**

Old:
```tsx
              <TouchableOpacity
                onPress={() => alterarQuantidade(item.id, 'decrementar')}
                style={styles.quantityButton}
              >
                <FontAwesome name="minus" size={20} color="white" />
              </TouchableOpacity>

              <Text style={styles.itemText}>{item.quantidade}</Text>

              <TouchableOpacity
                onPress={() => alterarQuantidade(item.id, 'incrementar')}
                style={styles.quantityButton}
              >
                <FontAwesome name="plus" size={20} color="white" />
              </TouchableOpacity>
```

New:
```tsx
              <TouchableOpacity
                onPress={() => alterarQuantidade(item.id, 'decrementar')}
                style={styles.quantityButton}
              >
                <FontAwesome name="minus" size={20} color={colors.background} />
              </TouchableOpacity>

              <Text style={styles.itemText}>{item.quantidade}</Text>

              <TouchableOpacity
                onPress={() => alterarQuantidade(item.id, 'incrementar')}
                style={styles.quantityButton}
              >
                <FontAwesome name="plus" size={20} color={colors.background} />
              </TouchableOpacity>
```

- [ ] **Step 7: Trocar as 2 linhas de botões (topRow/bottomRow) inteiras**

Old:
```tsx
      <View style={styles.topRow}>
        {!isCliente && (
          <TouchableOpacity
            style={[styles.smallBtn, isCartEmpty && styles.buttonDisabled]}
            onPress={handleShare}
            disabled={isCartEmpty}
          >
            <Ionicons name="share-social" size={22} color="white" />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[isCliente ? styles.largeBtn : styles.largeBtnOrange, isCartEmpty && styles.buttonDisabled]}
          onPress={gerarPedido}
          disabled={isCartEmpty}
        >
          <Text style={styles.buttonText}>Gerar Pedido</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.bottomRow}>
        <TouchableOpacity
          style={[styles.smallBtnRed, isCartEmpty && styles.buttonDisabled]}
          onPress={limparConta}
          disabled={isCartEmpty}
        >
          <FontAwesome name="trash" size={20} color="#fff" />
        </TouchableOpacity>

        {!isCliente && (
          <TouchableOpacity
            style={[styles.largeBtnGreen, isCartEmpty && styles.buttonDisabled]}
            onPress={finalizarCompra}
            disabled={isCartEmpty}
          >
            <Text style={styles.buttonText}>Vender Direto</Text>
          </TouchableOpacity>
        )}
      </View>
```

New:
```tsx
      <View style={styles.topRow}>
        {!isCliente && (
          <TouchableOpacity
            style={[styles.iconBtn, isCartEmpty && styles.buttonDisabled]}
            onPress={handleShare}
            disabled={isCartEmpty}
          >
            <Ionicons name="share-social" size={22} color={colors.background} />
          </TouchableOpacity>
        )}

        <Button title="Gerar Pedido" onPress={gerarPedido} disabled={isCartEmpty} style={styles.ctaFlex} />
      </View>

      <View style={styles.bottomRow}>
        <TouchableOpacity
          style={[styles.iconBtnDanger, isCartEmpty && styles.buttonDisabled]}
          onPress={limparConta}
          disabled={isCartEmpty}
        >
          <FontAwesome name="trash" size={20} color="#fff" />
        </TouchableOpacity>

        {!isCliente && (
          <Button title="Vender Direto" onPress={finalizarCompra} disabled={isCartEmpty} style={styles.ctaFlex} />
        )}
      </View>
```

(Nota: `isCliente` usava `largeBtn`/azul genérico pro "Gerar Pedido" — agora sempre `<Button>` primário preto/branco, sem diferenciação por role. Simplificação intencional, mesma cor de CTA pra todo mundo.)

- [ ] **Step 8: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 9: Commit**

```bash
git add app/modais/contaModal.tsx
git commit -m "refactor(mobile): contaModal usa Button/tokens de cor"
```

---

## Task 26: `app/modais/contaHistoricoModal.tsx` (diff — tokens + ListItem)

**Files:**
- Modify: `app/modais/contaHistoricoModal.tsx` (264 linhas)

**Interfaces:**
- Consumes: `ListItem` (Task 6), `Colors` (Task 1).
- Esse arquivo **não tinha** `useColorScheme` — todos os botões eram cor fixa, sem dark mode. Corrigido junto.

- [ ] **Step 1: Adicionar imports**

Old:
```tsx
import { Ionicons } from '@expo/vector-icons'; // Importando o ícone de share
import { captureScreen } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
```

New:
```tsx
import { Ionicons } from '@expo/vector-icons'; // Importando o ícone de share
import { captureScreen } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { ListItem } from '@/components/ui/ListItem';
```

- [ ] **Step 2: Ler `colors` no início do componente**

Old:
```tsx
export default function ContaHistoricoModal() {
  const { vendaId } = useLocalSearchParams();
```

New:
```tsx
export default function ContaHistoricoModal() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const { vendaId } = useLocalSearchParams();
```

- [ ] **Step 3: Trocar `renderItem` pra usar `ListItem`**

Old:
```tsx
  const renderItem = ({ item }: { item: { nome: string; quantidade: number; preco: number } }) => (
    <View style={styles.item} darkColor="grey" lightColor="whitesmoke">
      <View style={styles.itemRow} darkColor="grey" lightColor="whitesmoke">
        <Text style={styles.itemTextLeft}>
          ({item.quantidade}x) {item.nome}
        </Text>
        <Text style={styles.itemTextRight}>R$ {item.preco.toFixed(2)}</Text>
      </View>
    </View>
  );
```

New:
```tsx
  const renderItem = ({ item }: { item: { nome: string; quantidade: number; preco: number } }) => (
    <ListItem
      title={item.nome}
      subtitle={`${item.quantidade}x`}
      trailing={<Text style={styles.itemTextRight}>R$ {item.preco.toFixed(2)}</Text>}
    />
  );
```

- [ ] **Step 4: Retokenizar spinner de loading**

Old:
```tsx
        <ActivityIndicator size="large" color="#007AFF" />
```

New:
```tsx
        <ActivityIndicator size="large" color={colors.primary} />
```

- [ ] **Step 5: Retokenizar `StyleSheet` (módulo-level — vira inline nos usos, já que o objeto `styles` não fecha sobre `colors`)**

Old (usos dos botões):
```tsx
        <TouchableOpacity
          style={styles.shareButton}
          onPress={handleShare}
        >
          <Ionicons name="share-social" size={24} color="white" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.button,
            (!isPrinterConnected) && styles.buttonDisabled,
          ]}
          onPress={handlePrint}
        >
```

New:
```tsx
        <TouchableOpacity
          style={[styles.shareButton, { backgroundColor: colors.primary }]}
          onPress={handleShare}
        >
          <Ionicons name="share-social" size={24} color={colors.background} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.button,
            { backgroundColor: colors.primary },
            (!isPrinterConnected) && { backgroundColor: colors.textMuted },
          ]}
          onPress={handlePrint}
        >
```

Old (dentro de `StyleSheet.create`, remover as cores que viraram inline):
```ts
  separator: {
    marginVertical: 10,
    height: 1,
    backgroundColor: '#ddd',
  },
```
```ts
  button: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 5,
    flex: 1,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#a1a1a1',
  },
```
```ts
  shareButton: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 5,
    flex: 0.2, // Proporção de 20%
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
```

New:
```ts
  separator: {
    marginVertical: 10,
    height: 1,
    backgroundColor: '#ddd',
  },
```
(deixar `separator` como está — é módulo-level e não vale a pena virar prop; usar `Colors.light.border`/dark não é possível aqui sem `colors` — trocar o hex fixo por `'#8888884d'`? Não: manter simples, aplicar override inline igual aos botões.)

Ajustar também a chamada do `<View style={styles.separator} />` (3 ocorrências no arquivo) para `<View style={[styles.separator, { backgroundColor: colors.border }]} />`.

Remover `backgroundColor` de dentro de `button`/`buttonDisabled`/`shareButton` no `StyleSheet.create` (já cobertos inline no Step 5):
```ts
  button: {
    padding: 12,
    borderRadius: 5,
    flex: 1,
    alignItems: 'center',
  },
  buttonDisabled: {},
  shareButton: {
    padding: 12,
    borderRadius: 5,
    flex: 0.2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
```

- [ ] **Step 6: Remover estilos mortos (`item`/`itemRow`/`itemTextLeft`, substituídos pelo `ListItem`)**

Manter só `itemTextRight` (ainda usado como `trailing`).

- [ ] **Step 7: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 8: Commit**

```bash
git add app/modais/contaHistoricoModal.tsx
git commit -m "fix(mobile): contaHistoricoModal ganha dark mode + ListItem + tokens"
```

---

## Task 27: `app/modais/pedidoModal.tsx` (diff — o mais denso: Button, ListItem, tokens)

**Files:**
- Modify: `app/modais/pedidoModal.tsx` (287 linhas)

**Interfaces:**
- Consumes: `Button` (Task 3), `ListItem` (Task 6), `Colors` (Task 1).
- Este arquivo já tinha um mecanismo parcial de tema (`bg`/`surface`/`textColor`/`subText`/`inputBorder` calculados a partir de `isDarkMode`) — trocado pra ler de `Colors` em vez de hex ad-hoc. `bg` nunca era usado em lugar nenhum do JSX — removido.

- [ ] **Step 1: Adicionar imports**

Old:
```tsx
import { STATUS_PEDIDO } from '@/database/types/Pedido';
import { useAuth } from '@/context/AuthContext';
import { useAutoSync } from '@/context/AutoSyncContext';
```

New:
```tsx
import { STATUS_PEDIDO } from '@/database/types/Pedido';
import { useAuth } from '@/context/AuthContext';
import { useAutoSync } from '@/context/AutoSyncContext';
import Colors from '@/constants/Colors';
import { Button } from '@/components/ui/Button';
import { ListItem } from '@/components/ui/ListItem';
import { spacing } from '@/constants/theme';
```

- [ ] **Step 2: Trocar os 5 const de cor por tokens (remove `bg`, morto)**

Old:
```tsx
  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === 'dark';

  const pedidoAceito = status !== STATUS_PEDIDO.ABERTO;
  const clienteBloqueado = isCliente;

  const bg = isDarkMode ? '#0b0b0b' : '#fff';
  const surface = isDarkMode ? '#121212' : '#fff';
  const textColor = isDarkMode ? '#fff' : '#000';
  const subText = isDarkMode ? '#bbb' : '#555';
  const inputBorder = isDarkMode ? '#333' : '#ccc';
```

New:
```tsx
  const colorScheme = useColorScheme() ?? 'light';
  const isDarkMode = colorScheme === 'dark';
  const colors = Colors[colorScheme];

  const pedidoAceito = status !== STATUS_PEDIDO.ABERTO;
  const clienteBloqueado = isCliente;

  const surface = colors.surface;
  const textColor = colors.text;
  const subText = colors.textMuted;
  const inputBorder = colors.border;
```

- [ ] **Step 3: Retokenizar os botões de status (4 + 1 somente-leitura pro cliente)**

Old:
```tsx
      {isCliente ? (
        <RNView style={styles.statusRow}>
          <RNView style={[styles.statusBtn, styles.statusActive]}><Text style={{ color: textColor }}>{status}</Text></RNView>
        </RNView>
      ) : (
        <RNView style={styles.statusRow}>
          <TouchableOpacity onPress={() => setStatus(STATUS_PEDIDO.ABERTO)} style={[styles.statusBtn, status === STATUS_PEDIDO.ABERTO && styles.statusActive]}><Text style={{ color: textColor }}>ABERTO</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setStatus(STATUS_PEDIDO.EM_PREPARO)} style={[styles.statusBtn, status === STATUS_PEDIDO.EM_PREPARO && styles.statusActive]}><Text style={{ color: textColor }}>EM_PREPARO</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setStatus(STATUS_PEDIDO.ENTREGANDO)} style={[styles.statusBtn, status === STATUS_PEDIDO.ENTREGANDO && styles.statusActive]}><Text style={{ color: textColor }}>ENTREGANDO</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setStatus(STATUS_PEDIDO.FECHADO)} style={[styles.statusBtn, status === STATUS_PEDIDO.FECHADO && styles.statusActive]}><Text style={{ color: textColor }}>FECHADO</Text></TouchableOpacity>
        </RNView>
      )}
```

New:
```tsx
      {isCliente ? (
        <RNView style={styles.statusRow}>
          <RNView style={[styles.statusBtn, { borderColor: inputBorder, backgroundColor: colors.primary }]}>
            <Text style={{ color: colors.background }}>{status}</Text>
          </RNView>
        </RNView>
      ) : (
        <RNView style={styles.statusRow}>
          {([STATUS_PEDIDO.ABERTO, STATUS_PEDIDO.EM_PREPARO, STATUS_PEDIDO.ENTREGANDO, STATUS_PEDIDO.FECHADO] as const).map((s) => {
            const active = status === s;
            return (
              <TouchableOpacity
                key={s}
                onPress={() => setStatus(s)}
                style={[styles.statusBtn, { borderColor: inputBorder }, active && { backgroundColor: colors.primary }]}
              >
                <Text style={{ color: active ? colors.background : textColor }}>{s}</Text>
              </TouchableOpacity>
            );
          })}
        </RNView>
      )}
```

- [ ] **Step 4: Trocar `renderProduto` pra usar `ListItem` (qty stepper vira `trailing`)**

Old:
```tsx
  const renderProduto = ({ item }: { item: any }) => (
    <RNView style={styles.prodItem}>
      <RNView style={{ flex: 1 }}>
        <Text style={styles.prodNome}>{item.nome ?? item.produtoId}</Text>
        <Text style={styles.unitPrice}>{`R$ ${Number(item.preco ?? 0).toFixed(2)} / un.`}</Text>
      </RNView>
      {clienteBloqueado ? (
        <Text style={styles.qtyText}>{item.quantidade}</Text>
      ) : (
        <RNView style={styles.quantityRow}>
          <TouchableOpacity onPress={() => changeQuantidade(item.produtoId, -1)} style={styles.qtyBtn}><Text style={styles.qtyBtnText}>-</Text></TouchableOpacity>
          <Text style={styles.qtyText}>{item.quantidade}</Text>
          <TouchableOpacity onPress={() => changeQuantidade(item.produtoId, 1)} style={styles.qtyBtn}><Text style={styles.qtyBtnText}>+</Text></TouchableOpacity>
        </RNView>
      )}
    </RNView>
  );
```

New:
```tsx
  const renderProduto = ({ item }: { item: any }) => (
    <ListItem
      title={item.nome ?? item.produtoId}
      subtitle={`R$ ${Number(item.preco ?? 0).toFixed(2)} / un.`}
      trailing={
        clienteBloqueado ? (
          <Text style={[styles.qtyText, { color: textColor }]}>{item.quantidade}</Text>
        ) : (
          <RNView style={styles.quantityRow}>
            <TouchableOpacity onPress={() => changeQuantidade(item.produtoId, -1)} style={[styles.qtyBtn, { backgroundColor: colors.primary, borderColor: colors.text }]}>
              <Text style={[styles.qtyBtnText, { color: colors.background }]}>-</Text>
            </TouchableOpacity>
            <Text style={[styles.qtyText, { color: textColor }]}>{item.quantidade}</Text>
            <TouchableOpacity onPress={() => changeQuantidade(item.produtoId, 1)} style={[styles.qtyBtn, { backgroundColor: colors.primary, borderColor: colors.text }]}>
              <Text style={[styles.qtyBtnText, { color: colors.background }]}>+</Text>
            </TouchableOpacity>
          </RNView>
        )
      }
    />
  );
```

- [ ] **Step 5: Trocar botões de ação (Add Item / Gerar Venda / Fechar / Salvar / Excluir) pra `Button`**

Old:
```tsx
      {!clienteBloqueado && (
        <RNView style={styles.buttonsRow}>
          <TouchableOpacity style={[styles.btn, styles.btnSpacing]} onPress={handleEditInConta}><Text style={styles.btnText}>Add Item</Text></TouchableOpacity>
          {!isCliente && (
            <TouchableOpacity style={styles.btn} onPress={handleGerarVenda}><Text style={styles.btnText}>Gerar Venda</Text></TouchableOpacity>
          )}
        </RNView>
      )}
```

New:
```tsx
      {!clienteBloqueado && (
        <RNView style={styles.buttonsRow}>
          <Button title="Add Item" onPress={handleEditInConta} variant="outline" style={styles.btnSpacing} />
          {!isCliente && <Button title="Gerar Venda" onPress={handleGerarVenda} style={{ flex: 1 }} />}
        </RNView>
      )}
```

Old (dentro do `Modal` do picker de produto):
```tsx
          <RNView style={{height:12}} />
          <TouchableOpacity style={[styles.btn, { marginTop: 8 }]} onPress={() => setPickerVisible(false)}><Text style={styles.btnText}>Fechar</Text></TouchableOpacity>
        </RNView>
      </Modal>
```

New:
```tsx
          <RNView style={{height:12}} />
          <Button title="Fechar" onPress={() => setPickerVisible(false)} variant="outline" style={{ marginTop: spacing.sm }} />
        </RNView>
      </Modal>
```

Old (rodapé — excluir/salvar):
```tsx
      {clienteBloqueado ? (
        <RNView style={[styles.totalRow, { backgroundColor: 'transparent', marginTop: 12 }]}>
          <Text style={{ color: subText, fontStyle: 'italic' }}>Pedido enviado — sem edição</Text>
        </RNView>
      ) : (
        <RNView style={styles.buttonsRow}>
          {!isCliente && (
            <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
              <FontAwesome name="trash" size={18} color="#fff" />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave}><Text style={styles.btnText}>Salvar Pedido</Text></TouchableOpacity>
        </RNView>
      )}
```

New:
```tsx
      {clienteBloqueado ? (
        <RNView style={[styles.totalRow, { backgroundColor: 'transparent', marginTop: 12 }]}>
          <Text style={{ color: subText, fontStyle: 'italic' }}>Pedido enviado — sem edição</Text>
        </RNView>
      ) : (
        <RNView style={styles.buttonsRow}>
          {!isCliente && (
            <TouchableOpacity style={[styles.deleteBtn, { backgroundColor: Colors.status.danger }]} onPress={handleDelete}>
              <FontAwesome name="trash" size={18} color="#fff" />
            </TouchableOpacity>
          )}
          <Button title="Salvar Pedido" onPress={handleSave} style={{ flex: 7 }} />
        </RNView>
      )}
```

- [ ] **Step 6: Retokenizar a busca de produto dentro do picker (linha já parcialmente themed, só falta o item da lista)**

Old:
```tsx
          <FlatList data={searchResults} keyExtractor={(it: any) => it.id} renderItem={({ item }) => (
            <TouchableOpacity style={[styles.prodPickItem, { backgroundColor: surface }]} onPress={() => addProdutoToPedido(item)}>
              <Text style={[styles.prodNome, { color: textColor }]}>{item.nome}</Text>
              <Text style={{ color: subText }}>{`R$ ${Number(item.preco || 0).toFixed(2)}`}</Text>
            </TouchableOpacity>
          )} />
```

New:
```tsx
          <FlatList data={searchResults} keyExtractor={(it: any) => it.id} renderItem={({ item }) => (
            <ListItem
              title={item.nome}
              subtitle={`R$ ${Number(item.preco || 0).toFixed(2)}`}
              onPress={() => addProdutoToPedido(item)}
            />
          )} />
```

- [ ] **Step 7: Remover do `StyleSheet.create` os estilos que ficaram mortos** (`prodItem`, `prodNome`, `unitPrice`, `prodPickItem`, `btn`, `btnText`, `saveBtn` — substituídos por `ListItem`/`Button`). Manter `qtyBtn`/`qtyBtnText`/`qtyText`/`quantityRow`/`statusBtn`/`statusRow`/`deleteBtn`/`btnSpacing`/`buttonsRow`/`totalRow`/`totalLabel`/`totalValue`/`modalOverlay`/`modalContainer`/`input`/`label`/`title`/`container` (ainda usados). Remover também `statusActive` (cor virou inline no Step 3).

- [ ] **Step 8: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 9: Rodar suíte (regressão)**

Run: `npm test`
Expected: 13 testes continuam passando.

- [ ] **Step 10: Commit**

```bash
git add app/modais/pedidoModal.tsx
git commit -m "refactor(mobile): pedidoModal usa Button/ListItem/tokens de cor"
```

---

## Task 28: `app/modais/relatorioModal.tsx` (diff — só chrome de UI, paleta do gráfico intocada)

**Files:**
- Modify: `app/modais/relatorioModal.tsx` (578 linhas)

**Interfaces:**
- Consumes: `Colors` (Task 1).
- **Fora do escopo desta tarefa**: `chartConfig` (fundo branco fixo + labels pretos) e `getColor()` (paleta categórica de 10 cores pro gráfico de pizza) — já são preto/branco onde importa (chrome), e a paleta categórica precisa de várias cores pra ser legível, mesma razão do `tipoColors`. O gráfico não ganha dark mode nesta tarefa (limitação pré-existente da lib `react-native-chart-kit` no uso atual, não é cor errada) — registrar como pendência conhecida, não bloqueia o resto.

- [ ] **Step 1: Adicionar import e ler `colors`**

Old:
```tsx
import { Picker } from "@react-native-picker/picker";
import { PieChart, ProgressChart } from 'react-native-chart-kit';
import { Ionicons } from '@expo/vector-icons';
```

New:
```tsx
import { Picker } from "@react-native-picker/picker";
import { PieChart, ProgressChart } from 'react-native-chart-kit';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
```

Old:
```tsx
  const { getRelatorioPorPeriodo } = useVendasDatabase();
  const colorScheme = useColorScheme();
```

New:
```tsx
  const { getRelatorioPorPeriodo } = useVendasDatabase();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
```

- [ ] **Step 2: Retokenizar header (título + botão fechar)**

Old:
```tsx
      <View style={styles.header}>
        <Text style={styles.title}>Relatório de Vendas</Text>
        <TouchableOpacity 
          style={styles.closeButton}
          onPress={() => router.back()}
        >
          <Text style={styles.closeButtonText}>X</Text>
        </TouchableOpacity>
      </View>
```

New:
```tsx
      <View style={[styles.header, { backgroundColor: colors.text, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.background }]}>Relatório de Vendas</Text>
        <TouchableOpacity 
          style={styles.closeButton}
          onPress={() => router.back()}
        >
          <Text style={[styles.closeButtonText, { color: colors.background }]}>X</Text>
        </TouchableOpacity>
      </View>
```

- [ ] **Step 3: Retokenizar pickers (2 ocorrências: tipo de gráfico + tipo de produto)**

Old (2x, mesmo padrão):
```tsx
                style={colorScheme === "dark" ? { color: "#fff" } : { color: "#000" }}
                dropdownIconColor={colorScheme === "dark" ? "#fff" : "#000"}
```

New:
```tsx
                style={{ color: colors.text }}
                dropdownIconColor={colors.text}
```

- [ ] **Step 4: Retokenizar spinner de loading**

Old:
```tsx
              <ActivityIndicator size="large" color="#2196F3" />
```

New:
```tsx
              <ActivityIndicator size="large" color={colors.primary} />
```

- [ ] **Step 5: Retokenizar cabeçalho da lista + botão de compartilhar**

Old:
```tsx
            <ListHeader />
```
(`ListHeader` é definida acima usando `styles.listHeaderContainer`/`styles.listHeaderText` — trocar essas duas entradas do `StyleSheet`.)

Old (dentro de `StyleSheet.create`):
```ts
  listHeaderContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#2196F3',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  listHeaderText: {
    fontWeight: 'bold',
    fontSize: 16,
    color: 'white',
    textAlign: 'center',
  },
```

Como `styles` aqui é módulo-level (não fecha sobre `colors`), a troca precisa virar override inline no componente `ListHeader`:

Old:
```tsx
  const ListHeader = () => (
    <View style={styles.listHeaderContainer}>
      <Text style={styles.listHeaderText}>Produto</Text>
      <Text style={styles.listHeaderText}>Nº Vendas</Text>
      <Text style={styles.listHeaderText}>Total</Text>
    </View>
  );
```

New:
```tsx
  const ListHeader = () => (
    <View style={[styles.listHeaderContainer, { backgroundColor: colors.text, borderBottomColor: colors.border }]}>
      <Text style={[styles.listHeaderText, { color: colors.background }]}>Produto</Text>
      <Text style={[styles.listHeaderText, { color: colors.background }]}>Nº Vendas</Text>
      <Text style={[styles.listHeaderText, { color: colors.background }]}>Total</Text>
    </View>
  );
```

(remover `backgroundColor`/`color` fixos de dentro do `StyleSheet.create` pra esses 2 — ficam só layout: `listHeaderContainer` sem `backgroundColor`/`borderBottomColor`, `listHeaderText` sem `color`.)

- [ ] **Step 6: Retokenizar botão de compartilhar**

Old:
```tsx
            <TouchableOpacity 
              style={styles.shareButton}
              onPress={() => compartilharRelatorio(relatorioData, dataInicial, dataFinal)}
            >
              <Ionicons name="share-outline" size={20} color="white" />
              <Text style={styles.shareButtonText}>Compartilhar</Text>
            </TouchableOpacity>
```

New:
```tsx
            <TouchableOpacity 
              style={[styles.shareButton, { backgroundColor: colors.text }]}
              onPress={() => compartilharRelatorio(relatorioData, dataInicial, dataFinal)}
            >
              <Ionicons name="share-outline" size={20} color={colors.background} />
              <Text style={[styles.shareButtonText, { color: colors.background }]}>Compartilhar</Text>
            </TouchableOpacity>
```

(remover `backgroundColor: '#2196F3'` de `shareButton` e `color: 'white'` de `shareButtonText` no `StyleSheet.create`.)

- [ ] **Step 7: Retokenizar bordas soltas (`pickerSmallContainer`, `dateInfoContainer`, `itemContainer`)**

Como são módulo-level e usadas sem override hoje, a troca mais simples e de menor risco é substituir o hex fixo direto no `StyleSheet.create` por um neutro que já funciona em ambos os temas (essas 3 já eram cinza-claro fixo, não branco/preto puro — não preciam de theming dinâmico pra ficarem consistentes com "preto e branco", só precisam não ser azul). Sem mudança necessária além da já feita nos Steps 1-6 — confirmar que não sobrou nenhum `#2196F3`/`#999`/`#ddd` associado a estado "ativo" (só bordas neutras, que já eram cinza, ficam como estão).

Run: `grep -n "2196F3" app/modais/relatorioModal.tsx` (Bash/PowerShell) — Expected: nenhuma ocorrência restante.

- [ ] **Step 8: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 9: Commit**

```bash
git add app/modais/relatorioModal.tsx
git commit -m "refactor(mobile): relatorioModal chrome preto/branco (paleta do grafico intocada)"
```

---

## Task 29: Regressão final + checklist manual

**Files:** nenhum arquivo novo — só verificação.

- [ ] **Step 1: Rodar a suíte completa**

Run: `npm test`
Expected: todos os testes passam (13 originais + 4 novos de `status.test.ts` = 17).

- [ ] **Step 2: Typecheck do projeto inteiro**

Run: `npx tsc --noEmit`
Expected: 0 erros.

- [ ] **Step 3: Conferir que não sobrou cor antiga de referência**

Run (Bash ou PowerShell, na raiz do repo mobile):
```bash
grep -rn "2196F3\|007bff\|007BFF\|007AFF\|#4CAF50\|#F44336\|#dc3545\|#28a745" app components --include="*.tsx"
```
Expected: nenhuma ocorrência (fora de comentários) — se aparecer algo, é um arquivo que ficou pra trás numa tarefa anterior, voltar e corrigir antes de prosseguir.

- [ ] **Step 4: Checklist manual (não automatizável — sem `@testing-library/react-native` nem simulador controlado por este plano)**

Run: `npx expo start` e abrir no dispositivo/emulador ou web. Alternar light/dark mode do SO e conferir cada tela:
- `login` — logo novo aparece, contraste ok nos dois temas.
- `index` (Vender) — filtro de tipo, badges de categoria, botão "Ver Conta", EmptyState com busca vazia.
- `pedidos` — cards com badge de status colorida (vermelho/âmbar/azul/cinza), EmptyState sem pedidos.
- `produtos` — mesma badge de categoria do `index`, EmptyState.
- `historico` — calendário, botões de ação (ver/imprimir/excluir), EmptyState.
- `configs` — seções usuário/impressora, botões nativos agora usando `Button`.
- Modais: `adicionalModal`, `produtoModal` (Picker), `contaModal` (carrinho + Gerar Pedido/Vender Direto), `contaHistoricoModal` (ListItem), `pedidoModal` (status pills + ListItem + qty stepper), `relatorioModal` (header preto/branco, gráfico intacto).

- [ ] **Step 5: Abrir PR**

Sem `gh` CLI neste ambiente (ver `CLAUDE.md`) — abrir manualmente via URL de compare:
`https://github.com/<org>/TozzoBurger/compare/dev...feat/design-system-mobile?expand=1`

Branch de destino: `dev` (não `main` — promoção é decisão separada, ver `plano.md`).

---

## Self-Review

- **Cobertura da spec**: tokens (Task 1-2) ✓, 6 componentes `ui/` (Task 3-8) ✓, logo (Task 15-16) ✓, todas as 6 telas (Tasks 17-22) ✓, todos os 6 modais (Tasks 23-28) ✓, bugs do audit (`FiltroTipos` dark mode → Task 10, dead code `pedidos.tsx` → Task 19, contraste `historico.tsx` → Task 21) ✓, testes (Task 29) ✓.
- **Placeholders**: nenhum "TBD"/"implementar depois" — toda tarefa tem código completo ou diff exato.
- **Consistência de tipos**: `Colors` (light/dark/status), `getStatusColor`/`getStatusLabel`/`PedidoStatus`, `spacing/radius/type/tipoColors`, `Button/Card/Badge/ListItem/EmptyState/IngredientesModal` — nomes conferidos iguais em toda tarefa que consome.

