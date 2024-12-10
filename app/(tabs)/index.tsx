import { FlatList, StyleSheet } from 'react-native';
import { View } from '@/components/Themed';
import { ProductItemVenda } from '@/components/ProductItemVenda';
import { FiltroTipos } from '@/components/FiltroTipos';
import { Input } from '@/components/Input';
import useProductList from '@/hooks/useProductList';
import { ProductDatabase } from "@/database/useProductDatabase";
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

export default function VendaScreen() {
  const { products, tiposProduto, tipoProdutoId, filterByTipo, setSearch, search } = useProductList();

  useFocusEffect(
    useCallback(() => {
      filterByTipo(null);
      return;
    }, [])
  );

  function handleAddToConta(product: ProductDatabase) {
    console.log('adicionei no carrim kk');
  }

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

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: "#fff",
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