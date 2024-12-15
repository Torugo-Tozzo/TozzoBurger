import { Pressable, PressableProps, TouchableOpacity, Image, StyleSheet } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useColorScheme } from "react-native";
import { View, Text } from "@/components/Themed";

const productImages: Record<number, any> = {
  1: require("../assets/images/1-removebg-preview.png"),
  2: require("../assets/images/2-removebg-preview.png"),
  3: require("../assets/images/3-removebg-preview.png"),
  4: require("../assets/images/4-removebg-preview.png"),
  5: require("../assets/images/5-removebg-preview.png"),
  6: require("../assets/images/6-removebg-preview.png"),
  7: require("../assets/images/7-removebg-preview.png"),
};

type Props = PressableProps & {
  data: {
    nome: string;
    preco: number;
    tipoProdutoId: number;
  };
  onDelete: () => void;
  onOpen: () => void;
};

export function Product({ data, onDelete, onOpen, ...rest }: Props) {
  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === "dark";

  const containerStyle = {
    backgroundColor: isDarkMode ? "grey" : "whitesmoke",
    shadowColor: isDarkMode ? "#000" : "#666",
  };

  return (
    <Pressable
      style={[
        styles.container,
        containerStyle, // Adiciona as cores dinâmicas
      ]}
      {...rest}
    >
      <Image
        source={productImages[data.tipoProdutoId]}
        style={{ width: 50, height: 50, marginRight: 16 }}
        resizeMode="contain"
      />

      <View style={{ flex: 1 }} lightColor="#f9f9f9" darkColor="grey">
        <Text
          style={{
            fontSize: 16,
            fontWeight: "bold",
            marginBottom: 4,
          }}
        >
          {data.nome}
        </Text>
        <Text style={{ fontSize: 14 }}>
          Preço: R$ {data.preco.toFixed(2)}
        </Text>
      </View>

      <View style={styles.buttonContainer} lightColor="#f9f9f9" darkColor="grey">
        <TouchableOpacity onPress={onOpen}>
          <FontAwesome name="edit" size={28} color="blue" style={{ marginLeft: 16 }} />
        </TouchableOpacity>

        <TouchableOpacity onPress={onDelete}>
          <FontAwesome name="trash" size={24} color="red" style={{ marginLeft: 16 }} />
        </TouchableOpacity>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
});
