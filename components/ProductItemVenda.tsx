import React, { useState } from "react";
import { Button, Image, Pressable, useColorScheme, Modal } from "react-native";
import { Text, View } from "@/components/Themed";
import { ProductDatabase } from "@/database/useProductDatabase";
import { FontAwesome } from "@expo/vector-icons";
import Colors from "@/constants/Colors";

const productImages: Record<number, any> = {
  1: require("../assets/images/1-removebg-preview.png"),
  2: require("../assets/images/2-removebg-preview.png"),
  3: require("../assets/images/3-removebg-preview.png"),
  4: require("../assets/images/4-removebg-preview.png"),
  5: require("../assets/images/5-removebg-preview.png"),
  6: require("../assets/images/6-removebg-preview.png"),
  7: require("../assets/images/7-removebg-preview.png"),
  8: require("../assets/images/8-removebg-preview.png"),
};

type ProductItemVendaProps = {
  data: ProductDatabase;
  onAddToCart: (product: ProductDatabase) => void;
  onAdicionaltoCart: (product: ProductDatabase, ehAdd: boolean) => void;
};

export function ProductItemVenda({ data, onAddToCart, onAdicionaltoCart }: ProductItemVendaProps) {
  const [modalVisible, setModalVisible] = useState(false); // Estado para controle do modal
  const colorScheme = useColorScheme();

  const handleImagePress = () => {
    setModalVisible(true); // Abre o modal ao pressionar na imagem
  };

  return (
    <View
      lightColor="#f9f9f9"
      darkColor="grey"
      style={{
        padding: 16,
        borderWidth: 1,
        borderColor: "#ccc",
        borderRadius: 8,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <Pressable onPress={handleImagePress}>
        <Image
          source={productImages[data.tipoProdutoId]}
          style={{ width: 50, height: 50, marginRight: 16 }}
          resizeMode="contain"
        />
      </Pressable>
      <View lightColor="#f9f9f9" darkColor="grey">
        <Text style={{ fontSize: 18, fontWeight: "bold" }}>{data.nome}</Text>
        <Text style={{ fontSize: 15 }}>Preço: R$ {data.preco.toFixed(2)}</Text>
      </View>
      <Pressable onPress={() => onAdicionaltoCart(data, true)}>
        {({ pressed }) => (
          <FontAwesome
            name="flash"
            size={20}
            color={Colors[colorScheme ?? "light"].tint}
            style={{ marginRight: 10, marginLeft: 10, opacity: pressed ? 0.5 : 1 }}
          />
        )}
      </Pressable>
      <Button title="Adicionar" onPress={() => onAddToCart(data)} />

      {/* Modal para mostrar os ingredientes */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)} // Fechar o modal
      >
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "rgba(0, 0, 0, 0.5)",
          }}
        >
          <View
            style={{
              backgroundColor: useColorScheme() === "dark" ? "#333" : "#fff",
              padding: 20,
              borderRadius: 10,
              width: "80%",
            }}
          >
            <Text style={{ fontSize: 20, fontWeight: "bold", marginBottom: 15 }}>
              Ingredientes do {data.nome}:
            </Text>
            <Text style={{marginBottom: 20}}>{data.ingredientes ?? 'Os ingredientes não foram informados no cadastro deste produto'}</Text>
            <Button title="Fechar" onPress={() => setModalVisible(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}
