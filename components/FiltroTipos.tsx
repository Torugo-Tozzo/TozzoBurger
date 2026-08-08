import { FlatList, TouchableOpacity, StyleSheet } from "react-native";
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { View, Text } from "@/components/Themed";
import { radius, spacing, type } from '@/constants/theme';

type TipoProduto = {
  id: number;
  descricao: string;
};

type FiltroTiposProps = {
  data: TipoProduto[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
};

export function FiltroTipos({ data, selectedId, onSelect }: FiltroTiposProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  const styles = StyleSheet.create({
    container: { marginBottom: 0 },
    flatList: { flexGrow: 0 },
    contentContainer: { paddingHorizontal: spacing.lg, paddingVertical: 0, gap: 1 },
    button: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.sm,
      marginRight: spacing.md,
      marginBottom: spacing.md,
      marginTop: spacing.xs,
      alignItems: "center",
      justifyContent: "center",
      height: 45,
    },
    selectedButton: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    selectedText: { color: colors.background },
  });

  return (
    <View style={styles.container}>
      <FlatList
        data={data}
        horizontal
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => {
          const selected = selectedId === item.id;
          return (
            <TouchableOpacity
              onPress={() => onSelect(selected ? null : item.id)}
              style={[styles.button, selected && styles.selectedButton]}
            >
              <Text style={[{ fontSize: type.body, fontWeight: "bold" }, selected && styles.selectedText]}>
                {item.descricao}
              </Text>
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={styles.contentContainer}
        style={styles.flatList}
      />
    </View>
  );
}
