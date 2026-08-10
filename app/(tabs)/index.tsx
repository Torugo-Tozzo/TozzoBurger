import { ActivityIndicator, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { View } from '@/components/Themed';
import { ProductItemVenda } from '@/components/ProductItemVenda';
import { FiltroTipos } from '@/components/FiltroTipos';
import { Input } from '@/components/Input';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProductCardSkeleton } from '@/components/ui/ProductCardSkeleton';
import { ListFrame } from '@/components/ui/ListFrame';
import { ListDivider } from '@/components/ui/ListDivider';
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
  const { products, tiposProduto, tipoProdutoId, filterByTipo, setSearch, search, isLoading, isLoadingMore, loadMore } = useProductList();
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

  // Skeleton cheio so no primeiro load (sem dado nenhum ainda) - mostrar ele
  // toda vez que ja tem dado na tela fazia a lista "piscar" (dado -> skeleton
  // -> dado de novo), parecendo recarregar 2x. Com dado ja carregado, o
  // refetch em foco usa o spinner do RefreshControl (nao esconde a lista).
  const hasData = products.length > 0;
  const showSkeleton = useMinLoadingDuration(isLoading && !hasData);

  const productList = (
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
  );

  return (
    <View style={styles.container}>
      <Input placeholder="Pesquisar" onChangeText={setSearch} value={search} style={styles.input} />

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

      <CartButton />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  input: {
    marginHorizontal: 16,
  },
  buttonWrap: {
    marginTop: spacing.lg,
    marginHorizontal: 16,
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
  footerLoader: {
    paddingVertical: 16,
  },
});
