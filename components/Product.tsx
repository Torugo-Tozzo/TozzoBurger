import { Pressable, PressableProps, TouchableOpacity, StyleSheet, useColorScheme, View } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Text } from "@/components/Themed";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { IngredientesModal } from "@/components/ui/IngredientesModal";
import Colors from '@/constants/Colors';
import { tipoColors, spacing, type } from '@/constants/theme';
import { useState } from "react";
import { ProductDatabase } from "@/database/types/Produto";

type Props = PressableProps & {
  data: ProductDatabase;
  tipoNome?: string;
  onDelete: () => void;
  onOpen: () => void;
};

export function Product({ data, onDelete, onOpen, tipoNome, ...rest }: Props) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const [modalVisible, setModalVisible] = useState(false);

  const tipoLabel = tipoNome ?? (data as any).tipoNome ?? `Tipo ${data.tipoProdutoId}`;

  return (
    <Pressable {...rest}>
      <Card style={styles.container}>
        <View style={styles.leftInfo}>
          <Text style={styles.nome}>{data.nome}</Text>
          <Text style={styles.preco}>Preço: R$ {data.preco.toFixed(2)}</Text>
        </View>

        <Pressable onPress={() => setModalVisible(true)}>
          <Badge label={tipoLabel} color={tipoColors[data.tipoProdutoId] ?? '#888'} />
        </Pressable>

        <View style={styles.buttonContainer}>
          <TouchableOpacity onPress={onOpen}>
            <FontAwesome name="edit" size={28} color={colors.primary} style={{ marginLeft: spacing.lg }} />
          </TouchableOpacity>

          <TouchableOpacity onPress={onDelete}>
            <FontAwesome name="trash" size={24} color={Colors.status.danger} style={{ marginLeft: spacing.lg }} />
          </TouchableOpacity>
        </View>

        <IngredientesModal
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
          nomeProduto={data.nome}
          ingredientes={data.ingredientes}
        />
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: "row", alignItems: "center" },
  leftInfo: { flex: 1 },
  nome: { fontSize: type.body, fontWeight: "bold", marginBottom: 4 },
  preco: { fontSize: type.bodySm },
  buttonContainer: { flexDirection: "row", alignItems: "center", gap: spacing.md },
});
