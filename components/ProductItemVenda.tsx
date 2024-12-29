import React, { useState, useRef } from "react";
import { Animated, Button, Image, Pressable, useColorScheme, Modal, Easing } from "react-native";
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
  const [modalVisible, setModalVisible] = useState(false);
  const colorScheme = useColorScheme();

  // Controle de animações separadas
  const buttonScaleAnim = useRef(new Animated.Value(1)).current;
  const iconScaleAnim = useRef(new Animated.Value(1)).current;

  const triggerAnimation = (anim: Animated.Value) => {
    Animated.sequence([
      Animated.timing(anim, {
        toValue: 0.8,
        duration: 100,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(anim, {
        toValue: 1,
        duration: 100,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleImagePress = () => {
    setModalVisible(true);
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
      <View lightColor="#f9f9f9" darkColor="grey" style={{ flex: 1 }}>
        <Text style={{ fontSize: 18, fontWeight: "bold" }}>{data.nome}</Text>
        <Text style={{ fontSize: 15 }}>Preço: R$ {data.preco.toFixed(2)}</Text>
      </View>
      <Animated.View style={{ transform: [{ scale: iconScaleAnim }] }}>
        <Pressable
          onPress={() => {
            triggerAnimation(iconScaleAnim);
            onAdicionaltoCart(data, true);
          }}
          style={{ flexDirection: "row" }}
        >
          <FontAwesome
            name="flash"
            size={25}
            color={Colors[colorScheme ?? "light"].tint}
            style={{ marginRight: 20, marginLeft: 10 }}
          />
        </Pressable>
      </Animated.View>
      <Animated.View style={{ transform: [{ scale: buttonScaleAnim }] }}>
        <Button
          title="Adicionar"
          onPress={() => {
            triggerAnimation(buttonScaleAnim);
            onAddToCart(data);
          }}
        />
      </Animated.View>

      {/* Modal para mostrar os ingredientes */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
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
            <Text style={{ marginBottom: 20 }}>
              {data.ingredientes ?? "Os ingredientes não foram informados no cadastro deste produto"}
            </Text>
            <Button title="Fechar" onPress={() => setModalVisible(false)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}
