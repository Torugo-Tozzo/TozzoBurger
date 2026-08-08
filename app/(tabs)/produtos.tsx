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
import { useSyncRefresh } from "@/hooks/useSyncRefresh"
import { EmptyState } from "@/components/ui/EmptyState"

export default function ProdutosScreen() {
  const { remove } = useProductDatabase();
  const { products, tiposProduto, tipoProdutoId, filterByTipo, setSearch } = useProductList()
  const { refreshing, onRefresh } = useSyncRefresh();

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
