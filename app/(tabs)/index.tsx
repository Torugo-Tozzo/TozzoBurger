import { FlatList, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { View } from '@/components/Themed';
import { ProductItemVenda } from '@/components/ProductItemVenda';
import { FiltroTipos } from '@/components/FiltroTipos';
import { Input } from '@/components/Input';
import useProductList from '@/hooks/useProductList';
import { ProductDatabase } from "@/database/useProductDatabase";
import { Link, router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { useCart } from '@/context/CartContext';

export default function VendaScreen() {
  const { products, tiposProduto, tipoProdutoId, filterByTipo, setSearch, search } = useProductList();
  const { addToCart, cart } = useCart();

  useFocusEffect(
    useCallback(() => {
      filterByTipo(null);
      return;
    }, [])
  );

  function handleAddToConta(product: ProductDatabase) {
    addToCart(product);
  }

  const totalItemsInCart = cart.reduce((total, item) => total + (item.quantidade ?? 0), 0);

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
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <ProductItemVenda data={item} onAddToCart={handleAddToConta} />
        )}
        contentContainerStyle={{ gap: 16 }}
      />

      {/* Botão "Ver Conta" que só aparece se houver itens no carrinho */}
      {totalItemsInCart > 0 && (
        <TouchableOpacity style={styles.button} onPress={() => router.push('/modais/contaModal')}>
          <Text style={styles.buttonText}>Ver Conta ({totalItemsInCart})</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: "#fff",
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
