import React, { useState, useRef } from "react";
import { Animated, Pressable, useColorScheme, Modal, Easing, Button } from "react-native";
import { Text, View } from "@/components/Themed";
import { ProductDatabase } from "@/database/types/Produto";
import { FontAwesome } from "@expo/vector-icons";
import Colors from "@/constants/Colors";

type Props = {
  data: ProductDatabase;
  tipoNome?: string;
  onAddToCart: (product: ProductDatabase) => void;
  onAdicionaltoCart: (product: ProductDatabase, ehAdd: boolean) => void;
};
export function ProductItemVenda({ data, onAddToCart, onAdicionaltoCart, tipoNome }: Props) {
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

  const tipoColors: Record<number, string> = {
    1: "#ef4444",
    2: "#f59e0b",
    3: "#10b981",
    4: "#3b82f6",
    5: "#8b5cf6",
    6: "#ec4899",
    7: "#14b8a6",
    8: "#06b6d4",
  };

  const tipoLabel = tipoNome ?? (data as any).tipoNome ?? `Tipo ${data.tipoProdutoId}`;

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
      <View style={{ flex: 1 }} lightColor="#f9f9f9" darkColor="grey">
        <Text style={{ fontSize: 16, fontWeight: "bold" }}>{data.nome}</Text>
        <Text style={{ fontSize: 14 }}>Preço: R$ {data.preco.toFixed(2)}</Text>
      </View>

      <Pressable
        onPress={handleImagePress}
        style={{
          minWidth: 120,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 12,
          paddingVertical: 4,
          borderRadius: 999,
          backgroundColor: tipoColors[data.tipoProdutoId] ?? '#888',
          borderColor: '#fff',
          borderWidth: 1,
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>{tipoLabel}</Text>
      </Pressable>
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
        <Pressable
          onPress={() => {
            triggerAnimation(buttonScaleAnim);
            onAddToCart(data);
          }}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: Colors["light"].tint, alignItems: 'center', justifyContent: 'center', marginLeft: 8 }}
        >
          <Text style={{ color: '#fff', fontSize: 20, fontWeight: '700' }}>+</Text>
        </Pressable>
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
