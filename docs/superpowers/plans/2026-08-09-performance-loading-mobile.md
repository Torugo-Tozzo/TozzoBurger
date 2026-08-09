# Performance + loading UX mobile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Matar o N+1 duplicado em `PedidoItem` (a tela de pedidos já busca produtos em lote, o componente ignora e busca de novo) e trazer o padrão de skeleton do site (`useMinLoadingDuration` + placeholders) pras 4 telas de lista mobile, que hoje não têm nenhum indicador de loading real.

**Architecture:** Dois primitivos novos (`Skeleton`, `useMinLoadingDuration`) + dois skeletons de silhueta (`RecordCardSkeleton`, `ProductCardSkeleton`) em `components/ui/`. `PedidoItem` vira componente puro (recebe `produtos` via prop, igual `VendaItem` já é). 4 telas ganham (ou reaproveitam) estado de loading e trocam spinner/vazio por skeleton.

**Tech Stack:** React Native (Expo SDK 52) + TypeScript, `Animated` (RN) pra pulse do skeleton.

## Global Constraints

- Branch: `feat/design-system-mobile-listas` (mesma da leva anterior, sem branch nova — Fase 5 é uma leva grande).
- Comando de teste correto: `npx jest --watchAll=false` (não `npm test`, que trava).
- `tsc --noEmit` limpo é requisito de cada task.
- Sem teste de snapshot/render novo pros componentes de skeleton (puramente visuais, mesmo padrão do resto do design system mobile).
- Skeleton só aparece quando não há dado nenhum pra mostrar (`isLoading && length === 0`) — refetch em background com dado já carregado não deve re-exibir skeleton. Exceção: `historico.tsx` reaproveita o `loading` boolean que já existe (não introduz o refinamento `length === 0` ali — ver nota da Task 7).

---

## Task 1: `hooks/useMinLoadingDuration.ts` (novo — porta literal do front)

**Files:**
- Create: `hooks/useMinLoadingDuration.ts`

**Interfaces:**
- Consumes: nada (lógica pura).
- Produces: `useMinLoadingDuration(isLoading: boolean, minMs?: number): boolean`. Consumido por Tasks 6, 7, 9, 10.

- [ ] **Step 1: Criar o arquivo (cópia literal de `front/front-tozzo.uk/src/hooks/useMinLoadingDuration.ts`, sem alteração — é lógica pura em TS, sem dependência de DOM)**

```ts
import { useEffect, useRef, useState } from 'react';

/**
 * Mantem o estado de loading "true" por pelo menos minMs, mesmo que a
 * requisicao real termine antes - evita o skeleton piscar rapido demais
 * (efeito mecanico) quando a resposta volta quase instantanea.
 */
export function useMinLoadingDuration(isLoading: boolean, minMs = 400): boolean {
  const [shown, setShown] = useState(isLoading);
  const startedAtRef = useRef<number | null>(isLoading ? Date.now() : null);

  useEffect(() => {
    if (isLoading) {
      startedAtRef.current = Date.now();
      setShown(true);
      return;
    }

    const elapsed = startedAtRef.current != null ? Date.now() - startedAtRef.current : minMs;
    const remaining = Math.max(0, minMs - elapsed);
    const timer = setTimeout(() => setShown(false), remaining);
    return () => clearTimeout(timer);
  }, [isLoading, minMs]);

  return shown;
}

export default useMinLoadingDuration;
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add hooks/useMinLoadingDuration.ts
git commit -m "feat(mobile): useMinLoadingDuration (porta do front)"
```

---

## Task 2: `components/ui/Skeleton.tsx` (novo)

**Files:**
- Create: `components/ui/Skeleton.tsx`

**Interfaces:**
- Consumes: `Colors`, `radius` (`constants/theme.ts`).
- Produces: `Skeleton({ width: DimensionValue, height: number, borderRadius?: number, style?: ViewStyle })` — retângulo com opacidade pulsante (`Animated.loop`). Consumido por Tasks 3, 4.

- [ ] **Step 1: Criar o componente**

```tsx
import React, { useEffect, useRef } from 'react';
import { Animated, DimensionValue, StyleSheet, ViewStyle, useColorScheme } from 'react-native';
import Colors from '@/constants/Colors';
import { radius } from '@/constants/theme';

type Props = {
  width: DimensionValue;
  height: number;
  borderRadius?: number;
  style?: ViewStyle;
};

export function Skeleton({ width, height, borderRadius = radius.sm, style }: Props) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { width, height, borderRadius, backgroundColor: colors.border, opacity },
        style,
      ]}
    />
  );
}

export default Skeleton;
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add components/ui/Skeleton.tsx
git commit -m "feat(mobile): componente Skeleton (retângulo com pulse)"
```

---

## Task 3: `components/ui/RecordCardSkeleton.tsx` (novo)

**Files:**
- Create: `components/ui/RecordCardSkeleton.tsx`

**Interfaces:**
- Consumes: `Card` (`components/ui/Card.tsx`), `Skeleton` (Task 2), `Colors`, `spacing` (`constants/theme.ts`).
- Produces: `RecordCardSkeleton()` — sem props, silhueta fixa do `RecordCard` (barra cinza + 3 linhas de texto + total + badge + 2 ações). Consumido por Tasks 6, 7.

- [ ] **Step 1: Criar o componente**

```tsx
import React from 'react';
import { View, StyleSheet, useColorScheme } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import Colors from '@/constants/Colors';
import { spacing, radius } from '@/constants/theme';

export function RecordCardSkeleton() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  return (
    <Card padding={0} style={styles.container}>
      <View style={[styles.accent, { backgroundColor: colors.border }]} />
      <View style={styles.content}>
        <View style={styles.mainRow}>
          <View style={styles.textBlock}>
            <Skeleton width="60%" height={16} />
            <Skeleton width="80%" height={13} style={styles.spacingTop} />
            <Skeleton width="40%" height={11} style={styles.spacingTop} />
          </View>
          <View style={styles.trailing}>
            <Skeleton width={60} height={16} />
            <Skeleton width={70} height={20} borderRadius={radius.full} style={styles.spacingTop} />
          </View>
        </View>
        <View style={[styles.actionsRow, { borderTopColor: colors.border }]}>
          <Skeleton width={36} height={36} borderRadius={8} />
          <Skeleton width={36} height={36} borderRadius={8} />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', marginBottom: spacing.md, overflow: 'hidden', padding: 0 },
  accent: { width: 4 },
  content: { flex: 1 },
  mainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: spacing.md,
    gap: spacing.sm,
  },
  textBlock: { flex: 1 },
  spacingTop: { marginTop: spacing.xs },
  trailing: { alignItems: 'flex-end', gap: spacing.xs },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});

export default RecordCardSkeleton;
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add components/ui/RecordCardSkeleton.tsx
git commit -m "feat(mobile): RecordCardSkeleton (placeholder de pedidos/histórico)"
```

---

## Task 4: `components/ui/ProductCardSkeleton.tsx` (novo)

**Files:**
- Create: `components/ui/ProductCardSkeleton.tsx`

**Interfaces:**
- Consumes: `Card`, `Skeleton` (Task 2), `spacing`/`radius` (`constants/theme.ts`).
- Produces: `ProductCardSkeleton()` — sem props, silhueta fixa de `Product`/`ProductItemVenda` (nome+preço + badge + 2 ações). Consumido por Tasks 9, 10.

- [ ] **Step 1: Criar o componente**

```tsx
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { spacing, radius } from '@/constants/theme';

export function ProductCardSkeleton() {
  return (
    <Card style={styles.container}>
      <View style={styles.leftInfo}>
        <Skeleton width="70%" height={16} />
        <Skeleton width="40%" height={13} style={styles.spacingTop} />
      </View>
      <Skeleton width={70} height={22} borderRadius={radius.full} />
      <View style={styles.actions}>
        <Skeleton width={36} height={36} borderRadius={8} />
        <Skeleton width={36} height={36} borderRadius={8} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md, gap: spacing.md },
  leftInfo: { flex: 1 },
  spacingTop: { marginTop: spacing.xs },
  actions: { flexDirection: 'row', gap: spacing.sm },
});

export default ProductCardSkeleton;
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add components/ui/ProductCardSkeleton.tsx
git commit -m "feat(mobile): ProductCardSkeleton (placeholder de produtos/venda)"
```

---

## Task 5: `components/PedidoItem.tsx` — mata a query duplicada

**Files:**
- Modify: `components/PedidoItem.tsx`

**Interfaces:**
- Consumes: nada de novo.
- Produces: `PedidoItem({ data: PedidoDatabase, produtos: string[], onEdit: () => void, onDelete?: () => void })` — assinatura muda: `produtos: string[]` novo (obrigatório), `index?` sai (nunca foi usado). Task 6 (o único caller) passa `pedido.produtos` (já vem pronto de `listPedidosRecentes`/`listPedidosRecentesPorUsuario`).

- [ ] **Step 1: Substituir o arquivo inteiro**

```tsx
import React from 'react';
import { RecordCard, RecordCardAction } from '@/components/ui/RecordCard';
import { getStatusColor, getStatusLabel } from '@/constants/status';
import { PedidoDatabase } from '@/database/types/Pedido';

type Props = {
  data: PedidoDatabase;
  produtos: string[];
  onEdit: () => void;
  onDelete?: () => void;
};

export function PedidoItem({ data, produtos, onEdit, onDelete }: Props) {
  const statusLabel = data.status ?? 'DESCONHECIDO';

  const horaFormatada = new Date(data.horario).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const autorTrecho = data.criado_por_nome ? `Criado por ${data.criado_por_nome} · ` : '';

  const actions: RecordCardAction[] = [
    { icon: 'pencil', label: 'Editar pedido', onPress: onEdit },
  ];
  if (onDelete) {
    actions.push({ icon: 'trash', label: 'Excluir pedido', onPress: onDelete, destructive: true });
  }

  return (
    <RecordCard
      accentColor={getStatusColor(statusLabel)}
      badge={{ label: getStatusLabel(statusLabel), color: getStatusColor(statusLabel) }}
      title={(data.cliente && String(data.cliente).trim().length > 0) ? data.cliente : 'Cliente não Informado'}
      subtitle={produtos.length > 0 ? produtos.join(', ') : undefined}
      meta={`${autorTrecho}${horaFormatada}`}
      total={data.total ?? 0}
      actions={actions}
    />
  );
}

export default PedidoItem;
```

**Nota**: `produtos` já chega formatado como `"( 2x ) Nome"` por item (é o que `listPedidosRecentes`/`listPedidosRecentesPorUsuario` já produzem, já truncado em 3 + "..." — ver `database/usePedidoDatabase.ts:286-288`/`379-380`). `subtitle` só faz `join(', ')`, sem reformatar — mesmo texto final que aparecia antes, só sem a query redundante que produzia esse mesmo texto uma segunda vez.

- [ ] **Step 2: Verificar tipos** (vai falhar até a Task 6 atualizar o único caller — ok, a Task 6 é sequencial logo em seguida)

Run: `npx tsc --noEmit`
Expected: erro em `app/(tabs)/pedidos.tsx` (`produtos` faltando, `index` não existe mais em `Props`) — esperado, a Task 6 corrige.

- [ ] **Step 3: Commit**

```bash
git add components/PedidoItem.tsx
git commit -m "refactor(mobile): PedidoItem para de buscar produtos sozinho, recebe via prop"
```

---

## Task 6: `app/(tabs)/pedidos.tsx` — consome o prop novo + adiciona skeleton

**Files:**
- Modify: `app/(tabs)/pedidos.tsx`

**Interfaces:**
- Consumes: `PedidoItem` (Task 5, `produtos` prop novo), `RecordCardSkeleton` (Task 3), `useMinLoadingDuration` (Task 1).
- Produces: mesma tela pública, sem mudança de rota.

- [ ] **Step 1: Substituir o arquivo inteiro**

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Alert, FlatList, RefreshControl } from 'react-native';
import { View, Text } from '@/components/Themed';
import { usePedidosDatabase } from '@/database/usePedidoDatabase';
import { useAutoSync } from '@/context/AutoSyncContext';
import PedidoItem from '@/components/PedidoItem';
import { EmptyState } from '@/components/ui/EmptyState';
import { RecordCardSkeleton } from '@/components/ui/RecordCardSkeleton';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useSyncRefresh } from '@/hooks/useSyncRefresh';
import { useMinLoadingDuration } from '@/hooks/useMinLoadingDuration';
import { spacing, type } from '@/constants/theme';
import { PedidoDatabase } from '@/database/types/Pedido';

type PedidoComProdutos = PedidoDatabase & { produtos: string[] };

export default function Pedidos() {
  const { listPedidosRecentes, listPedidosRecentesPorUsuario, removePedido } = usePedidosDatabase();
  const { lastSync } = useAutoSync();
  const { user } = useAuth();
  const { refreshing, onRefresh } = useSyncRefresh();
  const isCliente = user?.role === 'CLIENTE';
  const [pedidosPorData, setPedidosPorData] = useState<Record<string, PedidoComProdutos[]>>({});
  const [isLoading, setIsLoading] = useState(true);

  async function load() {
    setIsLoading(true);
    try {
      const data = isCliente && user?.id
        ? await listPedidosRecentesPorUsuario(user.id)
        : await listPedidosRecentes();
      setPedidosPorData(data);
    } catch (err) {
      console.error('Erro ao carregar pedidos:', err);
    } finally {
      setIsLoading(false);
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

  const renderPedido = (pedido: PedidoComProdutos) => (
    <PedidoItem
      key={pedido.id}
      data={pedido}
      produtos={pedido.produtos}
      onEdit={() => handleEdit(pedido.id)}
      onDelete={isCliente ? undefined : () => handleDelete(pedido.id)}
    />
  );

  const hasData = Object.keys(pedidosPorData).length > 0;
  const showSkeleton = useMinLoadingDuration(isLoading && !hasData);

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
            {(pedidosPorData[dataKey] || []).map((p) => renderPedido(p))}
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

**Nota**: `index` sumiu de `renderPedido`/`PedidoItem` (nunca era usado, `PedidoItem` novo também não recebe mais). O gatilho de refetch (`useFocusEffect` + `useEffect([lastSync])`) **não muda** — investigado no brainstorm: `pedidoModal.tsx` grava local e só sincroniza depois (assíncrono), então o refetch-ao-focar é o que mostra a edição do próprio usuário na hora; removê-lo causaria dado velho até o sync de rede terminar. Só a UI de loading muda (skeleton em vez de lista vazia), a lógica de quando recarregar fica igual.

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: limpo agora (Task 5 + esta task se completam).

- [ ] **Step 3: Rodar suíte**

Run: `npx jest --watchAll=false`

- [ ] **Step 4: Commit**

```bash
git add app/\(tabs\)/pedidos.tsx
git commit -m "perf(mobile): pedidos.tsx usa produtos em lote + skeleton no primeiro load"
```

---

## Task 7: `app/(tabs)/historico.tsx` — troca spinner por skeleton

**Files:**
- Modify: `app/(tabs)/historico.tsx`

**Interfaces:**
- Consumes: `RecordCardSkeleton` (Task 3).
- Produces: mesma tela pública, sem mudança de comportamento de busca/print/delete.

**Nota de escopo**: esta task **não** muda o gatilho de `loading` (continua exatamente como já é — `fetchVendas`/`handleSearch` já setam `loading`). Diferente de `pedidos.tsx` (Task 6), aqui não se aplica o refinamento "só quando não há dado" — o `loading` já é usado tanto pro load inicial quanto pra busca por data (`handleSearch`, ação do usuário, onde re-exibir o indicador ao trocar de data é o comportamento esperado, não um flash indesejado). Só a representação visual muda: lista de `RecordCardSkeleton` no lugar do `ActivityIndicator` de tela cheia.

- [ ] **Step 1: Trocar o bloco de loading**

Trocar (final do arquivo, dentro do `return`):

```tsx
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
```

por:

```tsx
      {loading ? (
        <>
          <RecordCardSkeleton />
          <RecordCardSkeleton />
          <RecordCardSkeleton />
          <RecordCardSkeleton />
        </>
      ) : (
        <FlatList
```

- [ ] **Step 2: Remover o import e o estilo que ficaram sem uso**

Trocar o import (linha 2):

```tsx
import { StyleSheet, FlatList, Alert, TouchableOpacity, useColorScheme, ActivityIndicator, Modal, RefreshControl } from 'react-native';
```

por:

```tsx
import { StyleSheet, FlatList, Alert, TouchableOpacity, useColorScheme, Modal, RefreshControl } from 'react-native';
```

Adicionar o import do skeleton (junto dos outros de `components/ui`):

```tsx
import { RecordCardSkeleton } from '@/components/ui/RecordCardSkeleton';
```

Remover a entrada `loadingContainer` de `StyleSheet.create` (não é mais referenciada — `ActivityIndicator` era o único filho dela).

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Rodar suíte**

Run: `npx jest --watchAll=false`

- [ ] **Step 5: Commit**

```bash
git add app/\(tabs\)/historico.tsx
git commit -m "perf(mobile): historico.tsx troca spinner de tela cheia por skeleton"
```

---

## Task 8: `hooks/useProductList.ts` — expõe `isLoading`

**Files:**
- Modify: `hooks/useProductList.ts`

**Interfaces:**
- Consumes: nada de novo.
- Produces: hook ganha `isLoading: boolean` no retorno — `true` durante `list()`/`filterByTipo()` (busca de produtos), independente de `loadTiposProduto()` (não bloqueia o skeleton, é rápido e não é o que trava a tela). Consumido por Tasks 9, 10.

- [ ] **Step 1: Substituir o arquivo inteiro**

```ts
import { useState, useEffect } from "react"
import {  useProductDatabase } from "@/database/useProductDatabase"
import { ProductDatabase } from "@/database/types/Produto"
import { useAutoSync } from '@/context/AutoSyncContext'

export function useProductList() {
  const [search, setSearch] = useState("")
  const [products, setProducts] = useState<ProductDatabase[]>([])
  const [tiposProduto, setTiposProduto] = useState<{ id: number; descricao: string }[]>([])
  const [tipoProdutoId, setTipoProdutoId] = useState("")
  const [isLoading, setIsLoading] = useState(true)

  const productDatabase = useProductDatabase()

  // Função para listar os produtos
  const list = async () => {
    setIsLoading(true)
    try {
      const response = await productDatabase.searchByName(search)
      setProducts(response)
    } catch (error) {
      console.log(error)
    } finally {
      setIsLoading(false)
    }
  }

  // Função para carregar os tipos de produto
  const loadTiposProduto = async () => {
    try {
      const tipos = await productDatabase.getTipoProdutos()
      setTiposProduto(tipos)
    } catch (error) {
      console.log(error)
    }
  }

  // Função para filtrar produtos por tipo
  const filterByTipo = async (tipoId: number | null) => {
    if (tipoId) {
      setTipoProdutoId(String(tipoId))
      setIsLoading(true)
      try {
        const filtered = await productDatabase.filterByTipo(tipoId)
        setProducts(filtered)
      } catch (error) {
        console.log(error)
      } finally {
        setIsLoading(false)
      }
    } else {
      setTipoProdutoId("")
      await list()
    }
  }

  // Carregar os produtos e tipos de produto quando a pesquisa mudar
  // e também recarregar quando uma sincronização remota for aplicada (lastSync)
  const { lastSync } = useAutoSync();
  useEffect(() => {
    list()
    loadTiposProduto()
  }, [search, lastSync])

  return {
    search,
    setSearch,
    products,
    tiposProduto,
    tipoProdutoId,
    setTipoProdutoId,
    filterByTipo,
    setProducts,
    setTiposProduto,
    isLoading,
  }
}

export default useProductList
```

**Nota**: `filterByTipo`'s try/catch foi reestruturado (o `try` externo que envolvia o `if/else` inteiro virou um `try/catch` só no branch `if (tipoId)`, já que agora esse branch tem seu próprio `try/finally` pro `isLoading`) — mesmo comportamento de erro (loga e não propaga), só reorganizado pra caber o `finally`.

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add hooks/useProductList.ts
git commit -m "feat(mobile): useProductList expõe isLoading"
```

---

## Task 9: `app/(tabs)/produtos.tsx` — skeleton

**Files:**
- Modify: `app/(tabs)/produtos.tsx`

**Interfaces:**
- Consumes: `isLoading` (Task 8), `ProductCardSkeleton` (Task 4), `useMinLoadingDuration` (Task 1).
- Produces: mesma tela pública.

- [ ] **Step 1: Substituir o arquivo inteiro**

```tsx
import React, { useCallback } from "react";
import { StyleSheet, FlatList, Alert, RefreshControl } from "react-native";
import { Text, View } from "@/components/Themed";
import { useProductDatabase } from "@/database/useProductDatabase";
import { useFocusEffect } from "@react-navigation/native";
import { FiltroTipos } from "@/components/FiltroTipos";
import { useProductList } from "@/hooks/useProductList"
import { Input } from "@/components/Input"
import { Product } from "@/components/Product"
import { router } from "expo-router"
import { useSyncRefresh } from "@/hooks/useSyncRefresh";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProductCardSkeleton } from "@/components/ui/ProductCardSkeleton";
import { useMinLoadingDuration } from "@/hooks/useMinLoadingDuration";

export default function ProdutosScreen() {
  const { remove } = useProductDatabase();
  const { products, tiposProduto, tipoProdutoId, filterByTipo, setSearch, isLoading } = useProductList()
  const { refreshing, onRefresh } = useSyncRefresh();

  useFocusEffect(
    useCallback(() => {
      filterByTipo(null);
      return;
    }, [])
  );

  const showSkeleton = useMinLoadingDuration(isLoading && products.length === 0);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Gerenciamento de Produtos</Text>
      <Input placeholder="Pesquisar" onChangeText={setSearch} />
      <FiltroTipos
        data={tiposProduto}
        selectedId={Number(tipoProdutoId)}
        onSelect={filterByTipo}
      />
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<EmptyState icon="cutlery" title="Nenhum produto cadastrado" message="Toque no + pra adicionar o primeiro item." />}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 16,
  },
});
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Rodar suíte**

Run: `npx jest --watchAll=false`

- [ ] **Step 4: Commit**

```bash
git add app/\(tabs\)/produtos.tsx
git commit -m "perf(mobile): produtos.tsx ganha skeleton no primeiro load"
```

---

## Task 10: `app/(tabs)/index.tsx` — skeleton

**Files:**
- Modify: `app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: `isLoading` (Task 8), `ProductCardSkeleton` (Task 4), `useMinLoadingDuration` (Task 1).
- Produces: mesma tela pública.

- [ ] **Step 1: Substituir o arquivo inteiro**

```tsx
import { FlatList, RefreshControl, StyleSheet } from 'react-native';
import { View } from '@/components/Themed';
import { ProductItemVenda } from '@/components/ProductItemVenda';
import { FiltroTipos } from '@/components/FiltroTipos';
import { Input } from '@/components/Input';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProductCardSkeleton } from '@/components/ui/ProductCardSkeleton';
import { useMinLoadingDuration } from '@/hooks/useMinLoadingDuration';
import { spacing } from '@/constants/theme';
import useProductList from '@/hooks/useProductList';
import { useProductDatabase } from "@/database/useProductDatabase";
import { ProductDatabase } from '@/database/types/Produto';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback } from 'react';
import { useCart, useCartActions } from '@/context/CartContext';
import { useSyncRefresh } from '@/hooks/useSyncRefresh';

/** Componente isolado — só ele re-renderiza quando o cart muda */
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

export default function VendaScreen() {
  const { products, tiposProduto, tipoProdutoId, filterByTipo, setSearch, search, isLoading } = useProductList();
  const { searchOrigemProdutoId, create, showAdd } = useProductDatabase();
  // Apenas funções estáveis — NÃO lê `cart`, então não re-renderiza quando cart muda
  const { addToCart, addIfNotInCart } = useCartActions();
  const { refreshing, onRefresh } = useSyncRefresh();

  useFocusEffect(
    useCallback(() => {
      filterByTipo(null);
      return;
    }, [])
  );

  const handleAddToConta = useCallback((product: ProductDatabase) => {
    addToCart(product);
  }, [addToCart]);

  const handleAdicional = useCallback(async (product: ProductDatabase) => {
    const produtosAdds = await searchOrigemProdutoId(product.id);

    if (produtosAdds?.length) {
      for (const produtoAdd of produtosAdds) {
        if (addIfNotInCart(produtoAdd)) return;
      }
    }

    const novoProdutoData = {
      nome: `${product.nome} Add`,
      preco: product.preco,
      tipoProdutoId: product.tipoProdutoId,
      origemProdutoId: product.id,
    };

    const response = await create(novoProdutoData);
    const novoProduto = await showAdd(response.id);

    if (novoProduto) {
      addToCart(novoProduto);
    }
  }, [searchOrigemProdutoId, create, showAdd, addToCart, addIfNotInCart]);

  const renderItem = useCallback(({ item }: { item: ProductDatabase }) => {
    const tipo = tiposProduto?.find((t: any) => Number(t.id) === Number(item.tipoProdutoId))?.descricao;
    return <ProductItemVenda data={item} tipoNome={tipo} onAddToCart={handleAddToConta} onAdicionaltoCart={handleAdicional} />;
  }, [tiposProduto, handleAddToConta, handleAdicional]);

  const keyExtractor = useCallback((item: ProductDatabase) => String(item.id), []);

  const showSkeleton = useMinLoadingDuration(isLoading && products.length === 0);

  return (
    <View style={styles.container}>
      <Input placeholder="Pesquisar" onChangeText={setSearch} value={search} />

      <FiltroTipos
        data={tiposProduto}
        selectedId={Number(tipoProdutoId)}
        onSelect={filterByTipo}
      />

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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListEmptyComponent={<EmptyState icon="cutlery" title="Nenhum produto encontrado" message="Ajuste a busca ou o filtro de tipo." />}
        />
      )}

      <CartButton />
    </View>
  );
}

const listContentStyle = { gap: 16 };

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

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Rodar suíte**

Run: `npx jest --watchAll=false`

- [ ] **Step 4: Commit**

```bash
git add app/\(tabs\)/index.tsx
git commit -m "perf(mobile): venda (index.tsx) ganha skeleton no primeiro load"
```

---

## Task 11: Regressão final + checklist visual manual

**Files:** nenhum (validação).

**Interfaces:** N/A.

- [ ] **Step 1: `tsc` e suíte limpos**

Run: `npx tsc --noEmit` — sem erros.
Run: `npx jest --watchAll=false` — todos os testes existentes passando.

- [ ] **Step 2: Rebuild Android e validar visualmente no emulador**

Run: `npx expo run:android` (ou confirmar que o Metro já em execução refletiu via Fast Refresh).

Checklist manual, light + dark mode:
- [ ] `pedidos.tsx`: primeiro load mostra skeleton (5 cards), depois troca pra lista real. Trocar de aba (sair e voltar) várias vezes seguidas deve parecer nitidamente mais rápido que antes — sem skeleton re-aparecendo a cada troca (só troca o conteúdo, sem flash).
- [ ] Editar um pedido (`pedidoModal`) e voltar pra `pedidos.tsx` — a edição aparece na hora (confirma que o refetch-ao-focar continua funcionando, só ficou mais rápido).
- [ ] `historico.tsx`: skeleton no lugar do spinner de tela cheia, mesmo comportamento de busca por data de antes.
- [ ] `produtos.tsx` e `index.tsx` (venda): skeleton no primeiro load, filtro por tipo/busca por nome não causa flash de skeleton se já havia produtos na tela.
- [ ] Nenhum skeleton com texto/ícone invisível em dark mode (cor de fundo do skeleton é `colors.border`, testar contraste contra o fundo do `Card` nos dois temas).

- [ ] **Step 3: Push**

```bash
git push -u origin feat/design-system-mobile-listas
```
