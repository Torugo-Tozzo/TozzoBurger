import { FlatList, TouchableOpacity, StyleSheet } from "react-native";
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { View, Text } from "@/components/Themed";

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

  const colorScheme = useColorScheme();

  const styles = StyleSheet.create({
    container: {
      marginBottom: 0,
    },
    flatList: {
      flexGrow: 0,
    },
    contentContainer: {
      paddingHorizontal: 16,
      paddingVertical: 0,
      gap: 1,
    },
    button: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      backgroundColor: colorScheme === "dark" ? "grey" : "whitesmoke",
      borderRadius: 5,
      marginRight: 10,
      marginBottom: 10,
      marginTop: 5,
      alignItems: "center",
      justifyContent: "center",
      height: 45,
    },
    selectedButton: {
      backgroundColor: Colors.light.tint
    },
    text: {
      fontSize: 14,
    },
    branco: {
      color: 'white'
    }
  });

  return (
    <View style={styles.container}>
      <FlatList
        data={data}
        horizontal
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => onSelect(selectedId == item.id ? null : item.id)}
            style={[
              styles.button,
              selectedId === item.id && styles.selectedButton
            ]}
          >
            <Text style={{ fontSize: 16, fontWeight: "bold" }}>{item.descricao}</Text>
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.contentContainer}
        style={styles.flatList}
      />
    </View>
  );
}

