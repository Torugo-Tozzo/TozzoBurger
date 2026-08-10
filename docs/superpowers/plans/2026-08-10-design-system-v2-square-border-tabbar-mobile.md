# Design system mobile v2 — borda quadrada + tab bar + ícones — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a linguagem visual do app mobile de "cantos arredondados + borda cinza + cards com espaço entre eles" pra "cantos quadrados + borda preto/branco por tema + listas contínuas com divisor tracejado entre linhas", redesenhar a tab bar (fundo sólido preto/branco na aba ativa, ícone invertido) e trocar 3 ícones de aba.

**Architecture:** A maior parte é troca de valor de token (`radius.*` zerado, `colors.border` vira preto/branco) que propaga sozinha pros ~21 arquivos que já usam os tokens. Por cima disso: `Card` ganha uma prop `bordered` pra desligar a borda própria nos componentes usados em lista (a lista inteira passa a ter só 1 borda de perímetro + linha tracejada entre itens, via 2 componentes novos `ListFrame`/`ListDivider`); `Button` perde a estrutura dupla que existia só pra imitar contorno grosso; tab bar usa as props nativas do `@react-navigation/bottom-tabs` (`tabBarActiveBackgroundColor`/`tabBarActiveTintColor` invertido) em vez de componente customizado.

**Tech Stack:** React Native/Expo (SDK 52), `expo-router` `Tabs`, `@react-navigation/bottom-tabs` 7.2.0, `@expo/vector-icons` (FontAwesome clássico + `MaterialIcons` pontual).

## Global Constraints

- Sem teste automatizado novo — mudança é quase inteiramente visual/JSX, projeto não tem harness de teste pra componente de UI hoje (confirmado: zero arquivos em `components/**/__tests__/`). Verificação é `tsc --noEmit` limpo + `npx jest --watchAll=false` (suíte existente não deve quebrar) + QA manual no emulador.
- `npx jest --watchAll=false`, nunca `npm test` (trava non-interactive).
- Todo componente usa os tokens `radius`/`colors.border` de `@/constants/theme`/`@/constants/Colors` — nunca valor numérico/cor fixo direto (exceção sendo corrigida na Task 2).
- Spec completa: `docs/superpowers/specs/2026-08-10-design-system-v2-square-border-tabbar-mobile-design.md`.

---

### Task 1: tokens — `constants/theme.ts` + `constants/Colors.ts`

**Files:**
- Modify: `constants/theme.ts:11-16` (`radius`)
- Modify: `constants/Colors.ts:9,21` (`border`)

**Interfaces:** nenhuma nova — só muda o valor de export já consumido em ~21 arquivos.

- [ ] **Step 1: Zerar os tokens de radius**

Em `constants/theme.ts`, troque:

```ts
export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  full: 999,
};
```

por:

```ts
export const radius = {
  sm: 0,
  md: 0,
  lg: 0,
  full: 0,
};
```

- [ ] **Step 2: Trocar a cor de borda pro preto/branco do tema**

Em `constants/Colors.ts`, troque a linha 9 (dentro de `light`):

```ts
    border: '#e2e2e2',
```

por:

```ts
    border: '#000',
```

E a linha 21 (dentro de `dark`):

```ts
    border: '#333',
```

por:

```ts
    border: '#fff',
```

- [ ] **Step 3: Rodar suíte e typecheck**

Run: `npx jest --watchAll=false` — Expected: PASS, sem regressão (nenhum teste hoje afirma o valor numérico desses tokens).
Run: `npx tsc --noEmit` — Expected: limpo.

- [ ] **Step 4: Commit**

```bash
git add constants/theme.ts constants/Colors.ts
git commit -m "feat(mobile): zero corner radius, border color becomes theme-aware black/white"
```

---

### Task 2: `components/ui/IconButton.tsx` — magic number pro token

**Files:**
- Modify: `components/ui/IconButton.tsx:1-5,49`

**Interfaces:** nenhuma mudança de assinatura.

- [ ] **Step 1: Importar o token e trocar o valor fixo**

No topo do arquivo, troque:

```ts
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useColorScheme } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Colors from '@/constants/Colors';
```

por:

```ts
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useColorScheme } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Colors from '@/constants/Colors';
import { radius } from '@/constants/theme';
```

E troque:

```ts
const styles = StyleSheet.create({
  base: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
```

por:

```ts
const styles = StyleSheet.create({
  base: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
```

- [ ] **Step 2: Rodar typecheck**

Run: `npx tsc --noEmit` — Expected: limpo.

- [ ] **Step 3: Commit**

```bash
git add components/ui/IconButton.tsx
git commit -m "fix(mobile): IconButton usa token radius em vez de valor fixo"
```

---

### Task 3: `components/ui/Button.tsx` — simplifica variant primary pra 1 View

**Files:**
- Modify: `components/ui/Button.tsx:43-85`

**Interfaces:** assinatura pública (`Props`, exports) não muda.

- [ ] **Step 1: Simplificar a estrutura tripla**

Troque o bloco do `return` do `variant='primary'`/`'danger'` (linhas 43-63):

```tsx
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
```

por:

```tsx
  return (
    <Pressable
      style={({ pressed }) => [
        styles.content,
        { backgroundColor: contentBg, borderColor: colors.text, opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1 },
        style as any,
      ]}
      disabled={isDisabled}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={contentText} />
      ) : (
        <Text style={[styles.text, { color: contentText }]}>{title}</Text>
      )}
    </Pressable>
  );
```

E troque o `styles` (linhas 66-85):

```ts
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

por:

```ts
const styles = StyleSheet.create({
  content: {
    borderWidth: 1,
    borderRadius: radius.md,
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

(`outlineBase` fica idêntico — não mexe nele, o variant `outline` já usa `colors.text` como cor de borda, só o radius zera via token da Task 1.)

- [ ] **Step 2: Rodar suíte e typecheck**

Run: `npx jest --watchAll=false` — Expected: PASS.
Run: `npx tsc --noEmit` — Expected: limpo.

- [ ] **Step 3: Commit**

```bash
git add components/ui/Button.tsx
git commit -m "refactor(mobile): Button variant primary vira 1 View so (era 3 aninhadas)"
```

---

### Task 4: `components/ui/ListItem.tsx` — divisor vira tracejado

**Files:**
- Modify: `components/ui/ListItem.tsx:29-37`

**Interfaces:** nenhuma mudança de assinatura.

- [ ] **Step 1: Trocar o estilo do divisor**

Troque:

```ts
const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
```

por:

```ts
const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderStyle: 'dashed',
  },
```

- [ ] **Step 2: Rodar typecheck**

Run: `npx tsc --noEmit` — Expected: limpo.

- [ ] **Step 3: Commit**

```bash
git add components/ui/ListItem.tsx
git commit -m "feat(mobile): ListItem usa divisor tracejado 1px em vez de hairline solido"
```

---

### Task 5: novos `components/ui/ListDivider.tsx` + `components/ui/ListFrame.tsx`

**Files:**
- Create: `components/ui/ListDivider.tsx`
- Create: `components/ui/ListFrame.tsx`

**Interfaces:**
- Produces: `export function ListDivider(): JSX.Element` — linha tracejada 1px, sem props, usada como `ItemSeparatorComponent` de `FlatList` ou intercalada manualmente entre itens.
- Produces: `export function ListFrame(props: ViewProps): JSX.Element` — `View` com borda sólida 1px de perímetro, aceita `children`/`style` como qualquer `View`.

- [ ] **Step 1: Criar `ListDivider`**

```tsx
// components/ui/ListDivider.tsx
import React from 'react';
import { View, useColorScheme } from 'react-native';
import Colors from '@/constants/Colors';

export function ListDivider() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  return <View style={{ borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: colors.border }} />;
}

export default ListDivider;
```

- [ ] **Step 2: Criar `ListFrame`**

```tsx
// components/ui/ListFrame.tsx
import React from 'react';
import { View, ViewProps, useColorScheme } from 'react-native';
import Colors from '@/constants/Colors';

export function ListFrame({ style, children, ...rest }: ViewProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  return (
    <View style={[{ borderWidth: 1, borderColor: colors.border }, style]} {...rest}>
      {children}
    </View>
  );
}

export default ListFrame;
```

- [ ] **Step 3: Rodar typecheck**

Run: `npx tsc --noEmit` — Expected: limpo.

- [ ] **Step 4: Commit**

```bash
git add components/ui/ListDivider.tsx components/ui/ListFrame.tsx
git commit -m "feat(mobile): novos ListDivider/ListFrame pra listas continuas"
```

---

### Task 6: `components/ui/Card.tsx` — prop `bordered`

**Files:**
- Modify: `components/ui/Card.tsx`

**Interfaces:**
- Produces: `Card` ganha prop opcional `bordered?: boolean` (default `true`) — quando `false`, não aplica `borderWidth`/`borderColor` (mantém `backgroundColor`/`padding`/`borderRadius`).

- [ ] **Step 1: Adicionar a prop**

Troque o arquivo inteiro:

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

por:

```tsx
import React from 'react';
import { View, ViewProps, StyleSheet, useColorScheme } from 'react-native';
import Colors from '@/constants/Colors';
import { radius, spacing } from '@/constants/theme';

type Props = ViewProps & {
  padding?: number;
  bordered?: boolean;
};

export function Card({ style, padding = spacing.lg, bordered = true, children, ...rest }: Props) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  return (
    <View
      style={[
        styles.base,
        { backgroundColor: colors.surface, padding },
        bordered ? { borderColor: colors.border, borderWidth: 1 } : null,
        style as any,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
  },
});
```

- [ ] **Step 2: Rodar typecheck**

Run: `npx tsc --noEmit` — Expected: limpo. (`bordered` é opcional, todo uso existente de `<Card>` sem a prop continua com `bordered=true`, comportamento idêntico ao de hoje — nada quebra ainda, as próximas tasks é que passam `bordered={false}` explicitamente.)

- [ ] **Step 3: Commit**

```bash
git add components/ui/Card.tsx
git commit -m "feat(mobile): Card ganha prop bordered pra uso dentro de lista continua"
```

---

### Task 7: `RecordCard.tsx` + `RecordCardSkeleton.tsx` — `bordered={false}`, tira o gap

**Files:**
- Modify: `components/ui/RecordCard.tsx:36,73`
- Modify: `components/ui/RecordCardSkeleton.tsx:13,37`

**Interfaces:** nenhuma mudança de assinatura pública.

- [ ] **Step 1: `RecordCard.tsx` — desliga a borda própria e tira o espaçamento entre cards**

Troque:

```tsx
    <Card padding={0} style={styles.container}>
```

por:

```tsx
    <Card padding={0} bordered={false} style={styles.container}>
```

E troque:

```ts
  container: { flexDirection: 'row', marginBottom: spacing.md, overflow: 'hidden', padding: 0 },
```

por:

```ts
  container: { flexDirection: 'row', overflow: 'hidden', padding: 0 },
```

- [ ] **Step 2: `RecordCardSkeleton.tsx` — mesma coisa**

Troque:

```tsx
    <Card padding={0} style={styles.container}>
```

por:

```tsx
    <Card padding={0} bordered={false} style={styles.container}>
```

E troque:

```ts
  container: { flexDirection: 'row', marginBottom: spacing.md, overflow: 'hidden', padding: 0 },
```

por:

```ts
  container: { flexDirection: 'row', overflow: 'hidden', padding: 0 },
```

- [ ] **Step 3: Rodar suíte e typecheck**

Run: `npx jest --watchAll=false` — Expected: PASS.
Run: `npx tsc --noEmit` — Expected: limpo.

- [ ] **Step 4: Commit**

```bash
git add components/ui/RecordCard.tsx components/ui/RecordCardSkeleton.tsx
git commit -m "feat(mobile): RecordCard/RecordCardSkeleton sem borda propria, prontos pra lista continua"
```

---

### Task 8: `Product.tsx` + `ProductItemVenda.tsx` + `ProductCardSkeleton.tsx` — `bordered={false}`

**Files:**
- Modify: `components/Product.tsx:25`
- Modify: `components/ProductItemVenda.tsx:38`
- Modify: `components/ui/ProductCardSkeleton.tsx:9,24`

**Interfaces:** nenhuma mudança de assinatura pública.

- [ ] **Step 1: `Product.tsx`**

Troque:

```tsx
      <Card style={styles.container}>
```

por:

```tsx
      <Card bordered={false} style={styles.container}>
```

- [ ] **Step 2: `ProductItemVenda.tsx`**

Troque:

```tsx
    <Card style={styles.container}>
```

por:

```tsx
    <Card bordered={false} style={styles.container}>
```

- [ ] **Step 3: `ProductCardSkeleton.tsx`**

Troque:

```tsx
    <Card style={styles.container}>
```

por:

```tsx
    <Card bordered={false} style={styles.container}>
```

E troque:

```ts
  container: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md, gap: spacing.md },
```

por:

```ts
  container: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
```

- [ ] **Step 4: Rodar suíte e typecheck**

Run: `npx jest --watchAll=false` — Expected: PASS.
Run: `npx tsc --noEmit` — Expected: limpo.

- [ ] **Step 5: Commit**

```bash
git add components/Product.tsx components/ProductItemVenda.tsx components/ui/ProductCardSkeleton.tsx
git commit -m "feat(mobile): Product/ProductItemVenda/ProductCardSkeleton sem borda propria"
```

---

### Task 9: `app/(tabs)/produtos.tsx` — lista contínua

**Files:**
- Modify: `app/(tabs)/produtos.tsx`

**Interfaces:**
- Consumes: `ListFrame`, `ListDivider` de `@/components/ui/ListFrame`/`@/components/ui/ListDivider` (Task 5).

- [ ] **Step 1: Importar os novos componentes**

No topo do arquivo, adicione junto aos outros imports:

```ts
import { ListFrame } from '@/components/ui/ListFrame';
import { ListDivider } from '@/components/ui/ListDivider';
```

- [ ] **Step 2: Envolver skeleton e lista real em `ListFrame`, trocar gap por divisor**

Troque o bloco de retorno (linhas 44-91 do arquivo original):

```tsx
      {showSkeleton ? (
        <>
          <ProductCardSkeleton />
          <ProductCardSkeleton />
          <ProductCardSkeleton />
          <ProductCardSkeleton />
          <ProductCardSkeleton />
        </>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(item) => String(item.id)}
          refreshControl={<RefreshControl refreshing={refreshing || isLoading} onRefresh={onRefresh} />}
          ListEmptyComponent={<EmptyState icon="cutlery" title="Nenhum produto cadastrado" message="Toque no + pra adicionar o primeiro item." />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={isLoadingMore ? <ActivityIndicator style={styles.footerLoader} /> : null}
          renderItem={({ item }) => {
            const tipo = tiposProduto?.find((t: any) => Number(t.id) === Number(item.tipoProdutoId))?.descricao;

            return (
              <Product
                data={item}
                tipoNome={tipo}
                onDelete={() => {
                  Alert.alert(
                    'Confirmar Remoção',
                    'Tem certeza que deseja remover este produto?',
                    [
                      { text: 'Cancelar', style: 'cancel' },
                      {
                        text: 'Remover',
                        onPress: () => {
                          remove(item.id);
                          filterByTipo(Number(tipoProdutoId));
                        },
                        style: 'destructive',
                      },
                    ]
                  );
                }}
                onOpen={() => router.push(`/modais/produtoModal?productId=${item.id}`)}
              />
            )
          }}
          contentContainerStyle={{ gap: 16 }}
        />
      )}
```

por:

```tsx
      {showSkeleton ? (
        <ListFrame>
          <ProductCardSkeleton />
          <ListDivider />
          <ProductCardSkeleton />
          <ListDivider />
          <ProductCardSkeleton />
          <ListDivider />
          <ProductCardSkeleton />
          <ListDivider />
          <ProductCardSkeleton />
        </ListFrame>
      ) : (
        <ListFrame style={{ flex: 1 }}>
          <FlatList
            data={products}
            keyExtractor={(item) => String(item.id)}
            refreshControl={<RefreshControl refreshing={refreshing || isLoading} onRefresh={onRefresh} />}
            ListEmptyComponent={<EmptyState icon="cutlery" title="Nenhum produto cadastrado" message="Toque no + pra adicionar o primeiro item." />}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            ListFooterComponent={isLoadingMore ? <ActivityIndicator style={styles.footerLoader} /> : null}
            ItemSeparatorComponent={ListDivider}
            renderItem={({ item }) => {
              const tipo = tiposProduto?.find((t: any) => Number(t.id) === Number(item.tipoProdutoId))?.descricao;

              return (
                <Product
                  data={item}
                  tipoNome={tipo}
                  onDelete={() => {
                    Alert.alert(
                      'Confirmar Remoção',
                      'Tem certeza que deseja remover este produto?',
                      [
                        { text: 'Cancelar', style: 'cancel' },
                        {
                          text: 'Remover',
                          onPress: () => {
                            remove(item.id);
                            filterByTipo(Number(tipoProdutoId));
                          },
                          style: 'destructive',
                        },
                      ]
                    );
                  }}
                  onOpen={() => router.push(`/modais/produtoModal?productId=${item.id}`)}
                />
              )
            }}
          />
        </ListFrame>
      )}
```

- [ ] **Step 3: Rodar suíte e typecheck**

Run: `npx jest --watchAll=false` — Expected: PASS.
Run: `npx tsc --noEmit` — Expected: limpo.

- [ ] **Step 4: Commit**

```bash
git add "app/(tabs)/produtos.tsx"
git commit -m "feat(mobile): produtos.tsx vira lista continua com divisor tracejado"
```

---

### Task 10: `app/(tabs)/index.tsx` — lista contínua

**Files:**
- Modify: `app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: `ListFrame`, `ListDivider` de `@/components/ui/ListFrame`/`@/components/ui/ListDivider` (Task 5).

- [ ] **Step 1: Importar os novos componentes**

No topo do arquivo, adicione junto aos outros imports:

```ts
import { ListFrame } from '@/components/ui/ListFrame';
import { ListDivider } from '@/components/ui/ListDivider';
```

- [ ] **Step 2: Envolver skeleton e lista real em `ListFrame`, trocar gap por divisor**

Troque:

```tsx
      {showSkeleton ? (
        <>
          <ProductCardSkeleton />
          <ProductCardSkeleton />
          <ProductCardSkeleton />
          <ProductCardSkeleton />
          <ProductCardSkeleton />
        </>
      ) : (
        <FlatList
          data={products}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={listContentStyle}
          refreshControl={<RefreshControl refreshing={refreshing || isLoading} onRefresh={onRefresh} />}
          ListEmptyComponent={<EmptyState icon="cutlery" title="Nenhum produto encontrado" message="Ajuste a busca ou o filtro de tipo." />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={isLoadingMore ? <ActivityIndicator style={styles.footerLoader} /> : null}
        />
      )}
```

por:

```tsx
      {showSkeleton ? (
        <ListFrame>
          <ProductCardSkeleton />
          <ListDivider />
          <ProductCardSkeleton />
          <ListDivider />
          <ProductCardSkeleton />
          <ListDivider />
          <ProductCardSkeleton />
          <ListDivider />
          <ProductCardSkeleton />
        </ListFrame>
      ) : (
        <ListFrame style={{ flex: 1 }}>
          <FlatList
            data={products}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            refreshControl={<RefreshControl refreshing={refreshing || isLoading} onRefresh={onRefresh} />}
            ListEmptyComponent={<EmptyState icon="cutlery" title="Nenhum produto encontrado" message="Ajuste a busca ou o filtro de tipo." />}
            onEndReached={loadMore}
            onEndReachedThreshold={0.5}
            ListFooterComponent={isLoadingMore ? <ActivityIndicator style={styles.footerLoader} /> : null}
            ItemSeparatorComponent={ListDivider}
          />
        </ListFrame>
      )}
```

Remova também a constante `listContentStyle` (não é mais usada — ficava declarada fora do componente, perto de `styles`):

```ts
const listContentStyle = { gap: 16 };
```

- [ ] **Step 3: Rodar suíte e typecheck**

Run: `npx jest --watchAll=false` — Expected: PASS.
Run: `npx tsc --noEmit` — Expected: limpo (confirma que `listContentStyle` não ficou órfão em nenhuma outra referência).

- [ ] **Step 4: Commit**

```bash
git add "app/(tabs)/index.tsx"
git commit -m "feat(mobile): index.tsx (venda) vira lista continua com divisor tracejado"
```

---

### Task 11: `app/(tabs)/pedidos.tsx` — grupo por data vira lista contínua

**Files:**
- Modify: `app/(tabs)/pedidos.tsx`

**Interfaces:**
- Consumes: `ListFrame`, `ListDivider` de `@/components/ui/ListFrame`/`@/components/ui/ListDivider` (Task 5).

- [ ] **Step 1: Importar os novos componentes**

No topo do arquivo, adicione junto aos outros imports:

```ts
import { ListFrame } from '@/components/ui/ListFrame';
import { ListDivider } from '@/components/ui/ListDivider';
```

- [ ] **Step 2: Skeleton ganha `ListFrame` + divisores**

Troque:

```tsx
  if (showSkeleton) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Pedidos Recentes</Text>
        <RecordCardSkeleton />
        <RecordCardSkeleton />
        <RecordCardSkeleton />
        <RecordCardSkeleton />
        <RecordCardSkeleton />
      </View>
    );
  }
```

por:

```tsx
  if (showSkeleton) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Pedidos Recentes</Text>
        <ListFrame>
          <RecordCardSkeleton />
          <ListDivider />
          <RecordCardSkeleton />
          <ListDivider />
          <RecordCardSkeleton />
          <ListDivider />
          <RecordCardSkeleton />
          <ListDivider />
          <RecordCardSkeleton />
        </ListFrame>
      </View>
    );
  }
```

- [ ] **Step 3: Cada grupo de data vira um `ListFrame`, itens intercalados com `ListDivider`**

Troque:

```tsx
        renderItem={({ item: dataKey }) => (
          <View style={styles.group}>
            <Text style={styles.date}>{dataKey}</Text>
            {(pedidosPorData[dataKey] || []).map((p) => renderPedido(p))}
          </View>
        )}
```

por:

```tsx
        renderItem={({ item: dataKey }) => (
          <View style={styles.group}>
            <Text style={styles.date}>{dataKey}</Text>
            <ListFrame>
              {(pedidosPorData[dataKey] || []).map((p, idx) => (
                <React.Fragment key={p.id}>
                  {idx > 0 ? <ListDivider /> : null}
                  {renderPedido(p)}
                </React.Fragment>
              ))}
            </ListFrame>
          </View>
        )}
```

- [ ] **Step 4: Rodar suíte e typecheck**

Run: `npx jest --watchAll=false` — Expected: PASS.
Run: `npx tsc --noEmit` — Expected: limpo.

- [ ] **Step 5: Commit**

```bash
git add "app/(tabs)/pedidos.tsx"
git commit -m "feat(mobile): pedidos.tsx - cada grupo de data vira lista continua"
```

---

### Task 12: `app/(tabs)/historico.tsx` — lista por dia vira contínua

**Files:**
- Modify: `app/(tabs)/historico.tsx`

**Interfaces:**
- Consumes: `ListFrame`, `ListDivider` de `@/components/ui/ListFrame`/`@/components/ui/ListDivider` (Task 5).

- [ ] **Step 1: Importar os novos componentes**

No topo do arquivo, adicione junto aos outros imports:

```ts
import { ListFrame } from '@/components/ui/ListFrame';
import { ListDivider } from '@/components/ui/ListDivider';
```

- [ ] **Step 2: `renderVendasPorData` envolve a FlatList do dia em `ListFrame` + divisor**

Troque:

```tsx
    return (
      <View key={data}>
        <Text style={styles.dateHeader}>
          {dataRenderizada} - Total: R$ {totalVendas}
        </Text>
        <FlatList data={vendasDoDia} renderItem={renderVendaItem} keyExtractor={(item) => String(item.id)} />
      </View>
    );
  };
```

por:

```tsx
    return (
      <View key={data}>
        <Text style={styles.dateHeader}>
          {dataRenderizada} - Total: R$ {totalVendas}
        </Text>
        <ListFrame>
          <FlatList
            data={vendasDoDia}
            renderItem={renderVendaItem}
            keyExtractor={(item) => String(item.id)}
            ItemSeparatorComponent={ListDivider}
          />
        </ListFrame>
      </View>
    );
  };
```

- [ ] **Step 3: Skeleton ganha `ListFrame` + divisores**

Troque:

```tsx
      {loading && !hasData ? (
        <>
          <RecordCardSkeleton />
          <RecordCardSkeleton />
          <RecordCardSkeleton />
          <RecordCardSkeleton />
        </>
      ) : (
```

por:

```tsx
      {loading && !hasData ? (
        <ListFrame>
          <RecordCardSkeleton />
          <ListDivider />
          <RecordCardSkeleton />
          <ListDivider />
          <RecordCardSkeleton />
          <ListDivider />
          <RecordCardSkeleton />
        </ListFrame>
      ) : (
```

- [ ] **Step 4: Rodar suíte e typecheck**

Run: `npx jest --watchAll=false` — Expected: PASS.
Run: `npx tsc --noEmit` — Expected: limpo.

- [ ] **Step 5: Commit**

```bash
git add "app/(tabs)/historico.tsx"
git commit -m "feat(mobile): historico.tsx - cada grupo de data vira lista continua"
```

---

### Task 13: tab bar — fundo sólido na aba ativa + 3 ícones novos

**Files:**
- Modify: `app/(tabs)/_layout.tsx`

**Interfaces:** nenhuma nova — usa props nativas de `@react-navigation/bottom-tabs` (`tabBarActiveBackgroundColor`, já disponível na versão instalada, 7.2.0).

- [ ] **Step 1: Importar `MaterialIcons`**

No topo do arquivo, troque:

```tsx
import React from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Link, Tabs } from 'expo-router';
```

por:

```tsx
import React from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Link, Tabs } from 'expo-router';
```

- [ ] **Step 2: Fundo sólido + cor invertida na aba ativa**

Troque:

```tsx
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].primary,
        tabBarInactiveTintColor: Colors[colorScheme ?? 'light'].tabIconDefault,
        headerShown: useClientOnlyValue(false, true),
        headerRight: () => <SyncIndicator />,
      }}>
```

por:

```tsx
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].background,
        tabBarInactiveTintColor: Colors[colorScheme ?? 'light'].tabIconDefault,
        tabBarActiveBackgroundColor: Colors[colorScheme ?? 'light'].text,
        tabBarItemStyle: { borderRadius: 0 },
        headerShown: useClientOnlyValue(false, true),
        headerRight: () => <SyncIndicator />,
      }}>
```

(`tabBarItemStyle: { borderRadius: 0 }` garante canto quadrado no fundo da aba ativa mesmo se a lib tiver um arredondamento próprio por padrão — confirmar visualmente no QA manual da Task 14; se já vier quadrado por padrão, essa linha é inofensiva.)

- [ ] **Step 3: Ícone do Index vira casinha**

Troque:

```tsx
          tabBarIcon: ({ color }) => <TabBarIcon name={isCliente ? 'cutlery' : 'dollar'} color={color} />,
```

por:

```tsx
          tabBarIcon: ({ color }) => <TabBarIcon name="home" color={color} />,
```

(Só o ícone muda — o `title` logo acima continua `isCliente ? 'Cardápio' : 'Vender'`, sem alteração.)

- [ ] **Step 4: Ícone de Pedidos vira recibo (MaterialIcons)**

Troque:

```tsx
      <Tabs.Screen
        name='pedidos'
        options={{
          title: 'Pedidos',
          tabBarIcon: ({ color }) => <TabBarIcon name="list" color={color} />,
        }}
      />
```

por:

```tsx
      <Tabs.Screen
        name='pedidos'
        options={{
          title: 'Pedidos',
          tabBarIcon: ({ color }) => <MaterialIcons name="receipt-long" size={28} style={{ marginBottom: -3 }} color={color} />,
        }}
      />
```

- [ ] **Step 5: Ícone de Vendas (histórico) vira `$`**

Troque:

```tsx
      <Tabs.Screen
        name="historico"
        options={{
          title: 'Vendas',
          href: isCliente ? null : '/historico',
          tabBarIcon: ({ color }) => <TabBarIcon name="clock-o" color={color} />,
        }}
      />
```

por:

```tsx
      <Tabs.Screen
        name="historico"
        options={{
          title: 'Vendas',
          href: isCliente ? null : '/historico',
          tabBarIcon: ({ color }) => <TabBarIcon name="dollar" color={color} />,
        }}
      />
```

(`produtos` mantém `book`, `configs` mantém `cog` — sem mudança nesses dois.)

- [ ] **Step 6: Rodar suíte e typecheck**

Run: `npx jest --watchAll=false` — Expected: PASS.
Run: `npx tsc --noEmit` — Expected: limpo.

- [ ] **Step 7: Commit**

```bash
git add "app/(tabs)/_layout.tsx"
git commit -m "feat(mobile): tab bar com fundo solido na aba ativa + 3 icones novos"
```

---

### Task 14: integração final — suíte + QA manual no emulador + `plano.md`

**Files:**
- Modify: `C:/RN/plano.md` (seção da Fase 5)
- Nenhum arquivo de código novo.

**Interfaces:** nenhuma (task de verificação/documentação).

- [ ] **Step 1: Rodar a suíte inteira e o typecheck**

Run: `npx jest --watchAll=false` — Expected: PASS.
Run: `npx tsc --noEmit` — Expected: limpo.

- [ ] **Step 2: Reload no emulador Android**

Reaproveitar o emulador já rodando (Metro faz Fast Refresh automático) — se não pegar sozinho, `adb shell input text "RR"` (reload) ou reabrir o app.

- [ ] **Step 3: QA manual — light e dark, 4 listas, tab bar, modais**

1. Alternar o tema do dispositivo (light/dark) e conferir: `Card`/`Input`/`FiltroTipos`/`Badge` com borda preto (light)/branco (dark), cantos quadrados.
2. `produtos.tsx`, `index.tsx` (Vender): lista contínua, sem espaço entre produtos, linha tracejada entre eles, 1 borda sólida no perímetro.
3. `pedidos.tsx`, `historico.tsx`: cada grupo de data com seu próprio perímetro sólido + divisor tracejado entre os pedidos/vendas daquele dia.
4. Tab bar: aba ativa com fundo preto (light)/branco (dark) cobrindo ícone+label, cor do conteúdo invertida (branco/preto), cantos quadrados. 3 ícones novos: Index=casinha, Vendas=`$`, Pedidos=recibo.
5. Abrir `pedidoModal`/`contaHistoricoModal` (lista de produtos via `ListItem`) — divisor tracejado entre os produtos do pedido/venda.

- [ ] **Step 4: Atualizar `plano.md`**

Em `C:/RN/plano.md`, na seção "Fase 5", adicionar uma entrada nova (mesmo padrão das outras rodadas), algo como:

```markdown
**Rodada 2026-08-10 — Design system mobile v2 (borda quadrada + tab bar + ícones) — ✅ implementado, aguardando QA visual do usuário.** Spec: `TozzoBurger/docs/superpowers/specs/2026-08-10-design-system-v2-square-border-tabbar-mobile-design.md`. Plano (14 tasks): `TozzoBurger/docs/superpowers/plans/2026-08-10-design-system-v2-square-border-tabbar-mobile.md`.
- Cantos quadrados (radius zerado nos tokens) + borda preto/branco por tema (reaproveita o token `border` existente) em praticamente todo componente visual.
- Listas de produtos/pedidos/vendas viram contínuas — 1 borda de perímetro sólida por lista (ou por grupo de data), linha tracejada entre itens, sem espaço entre eles, igual ao padrão de tabela do site.
- Tab bar: aba ativa ganha fundo sólido preto/branco cobrindo ícone+label (via props nativas do `@react-navigation/bottom-tabs`, sem componente customizado). Ícones: Index→casinha, Vendas→`$`, Pedidos→recibo (`MaterialIcons`, único ponto do app que mistura família de ícone).
```

- [ ] **Step 5: Commit**

```bash
git add plano.md
git commit -m "docs(plano): registrar rodada design system mobile v2"
```

## Self-Review (fechado durante a escrita deste plano)

- **Cobertura da spec**: tokens (Task 1), exceção de valor fixo (Task 2), simplificação do Button (Task 3), divisor do ListItem (Task 4), componentes novos (Task 5), `Card.bordered` (Task 6), os 5 componentes de linha (Tasks 7-8), as 4 telas de lista (Tasks 9-12), tab bar + ícones (Task 13), QA + doc (Task 14) — todo item do spec tem task correspondente.
- **Sem placeholders**: todo passo tem código real (before/after), nenhum "ajustar estilo conforme necessário" sem o código exato.
- **Consistência**: `bordered` (Card), `ListFrame`/`ListDivider` (sem props além de `children`/`style` padrão de `View`) usados com o mesmo nome/assinatura em toda task que os consome.
- **Achado durante a escrita**: `@react-navigation/bottom-tabs` 7.2.0 (versão instalada, confirmada em `node_modules/@react-navigation/bottom-tabs/package.json`) já expõe `tabBarActiveBackgroundColor` nativamente — não precisa de `tabBarButton` customizado como o spec cogitou como possibilidade técnica; a Task 13 usa a prop nativa, mais simples e com menos risco.
