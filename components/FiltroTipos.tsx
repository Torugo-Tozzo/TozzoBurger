import { FlatList, TouchableOpacity, Text, View, StyleSheet } from "react-native";

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
  return (
    <View style={styles.container}>
      <FlatList
        data={data}
        horizontal
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <TouchableOpacity
            //onPress={() => onSelect(item.id)}
            onPress={() => onSelect(selectedId == item.id ? null : item.id)}
            style={[
              styles.button,
              selectedId === item.id && styles.selectedButton,
            ]}
          >
            <Text style={{fontSize:16, fontWeight: "bold"}}>{item.descricao}</Text>
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.contentContainer}
        style={styles.flatList}
      />
    </View>
  );
}

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
    backgroundColor: "#CECECE",
    borderRadius: 5,
    marginRight: 10,
    marginBottom: 10,
    marginTop: 5,
    alignItems: "center",
    justifyContent: "center",
    height: 45,
  },
  selectedButton: {
    backgroundColor: "#007BFF",
  },
  text: {
    fontSize: 14,
  },
});