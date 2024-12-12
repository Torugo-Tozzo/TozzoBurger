import { View, Text, Button, Image } from "react-native";
import { ProductDatabase } from "@/database/useProductDatabase";

const productImages: Record<number, any> = {
  1: require("../assets/images/1-removebg-preview.png"),
  2: require("../assets/images/2-removebg-preview.png"),
  3: require("../assets/images/3-removebg-preview.png"),
  4: require("../assets/images/4-removebg-preview.png"),
  5: require("../assets/images/5-removebg-preview.png"),
  6: require("../assets/images/6-removebg-preview.png"),
  7: require("../assets/images/7-removebg-preview.png"),
};

type CartItem = {
  productId: number;
  quantidade: number;
};

type ProductItemVendaProps = {
  data: ProductDatabase;
  onAddToCart: (product: ProductDatabase) => void;
};

export function ProductItemVenda({ data, onAddToCart }: ProductItemVendaProps) {
  return (
    <View
      style={{
        padding: 16,
        borderWidth: 1,
        borderColor: "#ccc",
        borderRadius: 8,
        backgroundColor: "#f9f9f9",
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <Image
        source={productImages[data.tipoProdutoId]}
        style={{ width: 50, height: 50, marginRight: 16 }}
        resizeMode="contain"
      />
      <View>
        <Text style={{ fontSize: 18, fontWeight: "bold" }}>{data.nome}</Text>
        <Text style={{ fontSize: 15 }}>Preço: R$ {data.preco.toFixed(2)}</Text>
      </View>
      <Button title="Adicionar" onPress={() => onAddToCart(data)} />
    </View>
  );
}
