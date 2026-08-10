import React, { useCallback } from "react";
import { ActivityIndicator, StyleSheet, FlatList, Alert, RefreshControl } from "react-native";
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
import { ListFrame } from "@/components/ui/ListFrame";
import { ListDivider } from "@/components/ui/ListDivider";
import { useMinLoadingDuration } from "@/hooks/useMinLoadingDuration";

export default function ProdutosScreen() {
  const { remove } = useProductDatabase();
  const { products, tiposProduto, tipoProdutoId, filterByTipo, setSearch, isLoading, isLoadingMore, loadMore } = useProductList()
  const { refreshing, onRefresh } = useSyncRefresh();

  useFocusEffect(
    useCallback(() => {
      filterByTipo(null);
      return;
    }, [])
  );

  // Skeleton cheio so no primeiro load (sem dado nenhum ainda) - mostrar ele
  // toda vez que ja tem dado na tela fazia a lista "piscar" (dado -> skeleton
  // -> dado de novo), parecendo recarregar 2x. Com dado ja carregado, o
  // refetch em foco usa o spinner do RefreshControl (nao esconde a lista).
  const hasData = products.length > 0;
  const showSkeleton = useMinLoadingDuration(isLoading && !hasData);

  const productList = (
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
  );

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
      ) : products.length > 0 ? (
        <ListFrame style={{ flex: 1 }}>{productList}</ListFrame>
      ) : (
        productList
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
  footerLoader: {
    paddingVertical: 16,
  },
});
