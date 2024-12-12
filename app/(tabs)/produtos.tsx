import React, { useCallback } from "react";
import { StyleSheet, FlatList, Alert } from "react-native";
import { Text, View } from "@/components/Themed";
import { useProductDatabase, ProductDatabase } from "@/database/useProductDatabase";
import { useFocusEffect } from "@react-navigation/native";
import { FiltroTipos } from "@/components/FiltroTipos";
import { useProductList } from "@/hooks/useProductList"
import { Input } from "@/components/Input"
import { Product } from "@/components/Product"
import { router } from "expo-router"

export default function ProdutosScreen() {
  const { remove } = useProductDatabase(); 
  const { products, tiposProduto, tipoProdutoId, filterByTipo, setSearch } = useProductList()

  useFocusEffect(
    useCallback(() => {
      filterByTipo(null);
      return;
    }, [])
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
      <FlatList
  data={products}
  keyExtractor={(item) => String(item.id)}
  renderItem={({ item }) => (
    <Product
      data={item}
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
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 16,
  },
});
