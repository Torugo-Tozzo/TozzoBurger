import { FlatList, TouchableOpacity, StyleSheet } from "react-native";
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { View, Text } from "@/components/Themed";
import { spacing, type } from '@/constants/theme';
import { useTranslation } from 'react-i18next';
import { getProductTypeLabel } from '@/components/productTypeLabel';

type TipoProduto = {
  id: number;
  description: string;
};

type FiltroTiposProps = {
  data: TipoProduto[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
};

const BUTTON_HEIGHT = 45;

function Divider({ color }: { color: string }) {
  return <View style={{ height: BUTTON_HEIGHT, borderLeftWidth: 1, borderStyle: 'dashed', borderLeftColor: color }} />;
}

export function FiltroTipos({ data, selectedId, onSelect }: FiltroTiposProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const { t } = useTranslation();

  const styles = StyleSheet.create({
    container: {
      marginBottom: 0,
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.border,
    },
    flatList: { flexGrow: 0 },
    button: {
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
      height: BUTTON_HEIGHT,
    },
    selectedButton: {
      backgroundColor: colors.primary,
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
              accessibilityRole="button"
              accessibilityLabel={getProductTypeLabel(item.id, item.description, t)}
              accessibilityState={{ selected }}
            >
              <Text style={[{ fontSize: type.body, fontWeight: "bold" }, selected && styles.selectedText]}>
                {getProductTypeLabel(item.id, item.description, t)}
              </Text>
            </TouchableOpacity>
          );
        }}
        ItemSeparatorComponent={() => <Divider color={colors.border} />}
        style={styles.flatList}
      />
    </View>
  );
}
