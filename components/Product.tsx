import { Pressable, PressableProps, Text, TouchableOpacity, View, Image } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import FontAwesome from "@expo/vector-icons/FontAwesome";

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
  return (
    <Pressable
      style={{
        backgroundColor: "#F5F5F5",
        padding: 16,
        borderRadius: 8,
        flexDirection: "row",
        alignItems: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
      }}
      {...rest}
    >
      <Image
        source={productImages[data.tipoProdutoId]}
        style={{ width: 50, height: 50, marginRight: 16 }}
        resizeMode="contain"
      />

      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, fontWeight: "bold", marginBottom: 4 }}>
          {data.nome}
        </Text>
        <Text style={{ fontSize: 14, color: "#666" }}>
          Preço: R$ {data.preco.toFixed(2)}
        </Text>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <TouchableOpacity onPress={onOpen}>
          <FontAwesome name="edit" size={28} color="blue" style={{marginLeft: 16}} />
        </TouchableOpacity>

        <TouchableOpacity onPress={onDelete}>
          <FontAwesome name="trash" size={24} color="red" style={{marginLeft: 16}} />
        </TouchableOpacity>
      </View>
    </Pressable>
  );
}