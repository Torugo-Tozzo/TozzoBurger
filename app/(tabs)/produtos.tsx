import React, { useCallback } from "react";
import { ActivityIndicator, StyleSheet, FlatList, Alert, RefreshControl } from "react-native";
import { View } from "@/components/Themed";
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
import { useTranslation } from 'react-i18next';

export default function ProdutosScreen() {
  const { t } = useTranslation();
  const { remove } = useProductDatabase();
  const { products, productTypes, productTypeId, filterByProductType, setSearch, isLoading, isLoadingMore, loadMore } = useProductList()
  const { refreshing, onRefresh } = useSyncRefresh();

  useFocusEffect(
    useCallback(() => {
      filterByProductType(null);
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
      ListEmptyComponent={<EmptyState icon="cutlery" title={t('products.empty')} message={t('products.addFirst')} />}
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
      ListFooterComponent={isLoadingMore ? <ActivityIndicator style={styles.footerLoader} /> : null}
      ItemSeparatorComponent={ListDivider}
      renderItem={({ item }) => {
        const productType = productTypes?.find((t: any) => Number(t.id) === Number(item.productTypeId))?.description;

        return (
          <Product
            data={item}
            tipoNome={productType}
            onDelete={() => {
              Alert.alert(
                t('products.removeTitle'),
                t('products.deleteConfirm'),
                [
                  { text: t('common.cancel'), style: 'cancel' },
                  {
                    text: t('products.remove'),
                    onPress: () => {
                      remove(item.id);
                      filterByProductType(Number(productTypeId));
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
      <Input placeholder={t('common.search')} accessibilityLabel={t('common.search')} onChangeText={setSearch} style={styles.input} />
      <FiltroTipos
        data={productTypes}
        selectedId={Number(productTypeId)}
        onSelect={filterByProductType}
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
    borderColor: 'black',
    borderWidth: 1,
  },
  input: {
    marginHorizontal: 16,
  },
  footerLoader: {
    paddingVertical: 16,
  },
});
