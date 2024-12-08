import React, { useEffect, useState } from "react";
import { StyleSheet, FlatList, TouchableOpacity, Alert } from "react-native";
import { Text, View } from "@/components/Themed";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useProductDatabase, ProductDatabase } from "@/database/useProductDatabase";

export default function ProdutosScreen() {
  const { remove, searchByName } = useProductDatabase(); // Obtem funções de remover e listar produtos.
  const [produtos, setProdutos] = useState<ProductDatabase[]>([]);

  useEffect(() => {
    carregarProdutos();
  }, []);

  async function carregarProdutos() {
    try {
      const lista = await searchByName("");
      setProdutos(lista);
    } catch (error) {
      Alert.alert("Erro", "Não foi possível carregar os produtos.");
      console.error(error);
    }
  }

  async function handleRemove(id: number) {
    Alert.alert(
      "Confirmação",
      "Tem certeza que deseja remover este produto?",
      [
        {
          text: "Cancelar",
          style: "cancel",
        },
        {
          text: "Remover",
          onPress: async () => {
            try {
              await remove(id);
              Alert.alert("Sucesso", "Produto removido com sucesso.");
              carregarProdutos(); // Recarrega a lista de produtos após remoção.
            } catch (error) {
              Alert.alert("Erro", "Não foi possível remover o produto.");
              console.error(error);
            }
          },
        },
      ]
    );
  }

  function renderProduto({ item }: { item: ProductDatabase }) {
    return (
      <View style={styles.produtoContainer}>
        <View style={styles.produtoInfo}>
          <Text style={styles.produtoNome}>{item.nome}</Text>
          <Text style={styles.produtoPreco}>R$ {item.preco.toFixed(2)}</Text>
        </View>
        <View style={styles.produtoAcoes}>
          <TouchableOpacity onPress={() => Alert.alert("Editar produto ainda não implementado.")}>
            <FontAwesome name="edit" size={24} color="blue" style={styles.icon} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => handleRemove(item.id)}>
            <FontAwesome name="trash" size={24} color="red" style={styles.icon} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Gerenciamento de Produtos</Text>
      <FlatList
        data={produtos}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderProduto}
        style={styles.lista}
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
  lista: {
    marginTop: 16,
  },
  produtoContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#f9f9f9",
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  produtoInfo: {
    flex: 1,
  },
  produtoNome: {
    fontSize: 16,
    fontWeight: "bold",
  },
  produtoPreco: {
    fontSize: 14,
    color: "#666",
    marginTop: 4,
  },
  produtoAcoes: {
    flexDirection: "row",
    alignItems: "center",
  },
  icon: {
    marginLeft: 16,
  },
});
