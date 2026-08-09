import { ActivityIndicator, FlatList, RefreshControl, StyleSheet } from 'react-native';
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
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={isLoadingMore ? <ActivityIndicator style={styles.footerLoader} /> : null}
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
  footerLoader: {
    paddingVertical: 16,
  },
});
