import { Pressable, PressableProps, StyleSheet, View } from "react-native";
import { Text } from "@/components/Themed";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/IconButton";
import { IngredientesModal } from "@/components/ui/IngredientesModal";
import { tipoColors, spacing, type } from '@/constants/theme';
import { useState } from "react";
import { Product } from "@/database/types/Product";

type Props = PressableProps & {
  data: Product;
  tipoNome?: string;
  onDelete: () => void;
  onOpen: () => void;
};

export function Product({ data, onDelete, onOpen, tipoNome, ...rest }: Props) {
  const [modalVisible, setModalVisible] = useState(false);

  const tipoLabel = tipoNome ?? (data as any).tipoNome ?? `Tipo ${data.productTypeId}`;

  return (
    <Pressable {...rest}>
      <Card bordered={false} style={styles.container}>
        <View style={styles.leftInfo}>
          <Text style={styles.name}>{data.name}</Text>
          <Text style={styles.price}>Preço: R$ {data.price.toFixed(2)}</Text>
        </View>

        <Pressable onPress={() => setModalVisible(true)}>
          <Badge label={tipoLabel} color={tipoColors[data.productTypeId] ?? '#888'} />
        </Pressable>

        <View style={styles.buttonContainer}>
          <IconButton icon="pencil" label="Editar produto" onPress={onOpen} />
          <IconButton icon="trash" label="Excluir produto" onPress={onDelete} destructive />
        </View>

        <IngredientesModal
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
          nomeProduto={data.name}
          ingredients={data.ingredients}
        />
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "center" },
  leftInfo: { flex: 1 },
  name: { fontSize: type.body, fontWeight: "bold", marginBottom: 4 },
  price: { fontSize: type.bodySm },
  buttonContainer: { flexDirection: "row", alignItems: "center", gap: spacing.md },
});
