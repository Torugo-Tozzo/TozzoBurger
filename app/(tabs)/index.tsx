import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { View } from '@/components/Themed';
import { ProductItemVenda } from '@/components/ProductItemVenda';
import { FiltroTipos } from '@/components/FiltroTipos';
import { Input } from '@/components/Input';
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
    <TouchableOpacity style={styles.button} onPress={() => router.push('/modais/contaModal')}>
      <Text style={styles.buttonText}>Ver Conta ({total})</Text>
    </TouchableOpacity>
  );
}

export default function VendaScreen() {
  const { products, tiposProduto, tipoProdutoId, filterByTipo, setSearch, search } = useProductList();
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

  return (
    <View style={styles.container}>
      <Input placeholder="Pesquisar" onChangeText={setSearch} value={search} />

      <FiltroTipos
        data={tiposProduto}
        selectedId={Number(tipoProdutoId)}
        onSelect={filterByTipo}
      />

      <FlatList
        data={products}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={listContentStyle}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      />

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
