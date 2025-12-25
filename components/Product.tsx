import { Pressable, PressableProps, TouchableOpacity, StyleSheet, Modal, Button, useColorScheme } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { View, Text } from "@/components/Themed";
import Colors from '@/constants/Colors';
import { useState } from "react";
import { ProductDatabase } from "@/database/types/Produto";

type Props = PressableProps & {
  data: ProductDatabase;
  tipoNome?: string;
  onDelete: () => void;
  onOpen: () => void;
};

export function Product({ data, onDelete, onOpen, tipoNome, ...rest }: Props) {
  const colorScheme = useColorScheme();
  const [modalVisible, setModalVisible] = useState(false);
  const isDarkMode = colorScheme === "dark";

  const containerStyle = {
    backgroundColor: isDarkMode ? "grey" : "whitesmoke",
    shadowColor: isDarkMode ? "#000" : "#666",
  };

  const handleImagePress = () => {
    setModalVisible(true); // Abre o modal ao pressionar no tipo
  };

  const tipoColors: Record<number, string> = {
    1: "#ef4444",
    2: "#f59e0b",
    3: "#10b981",
    4: "#3b82f6",
    5: "#8b5cf6",
    6: "#ec4899",
    7: "#14b8a6",
  };

  const tipoLabel = tipoNome ?? (data as any).tipoNome ?? `Tipo ${data.tipoProdutoId}`;

  return (
    <Pressable
      style={[
        styles.container,
        containerStyle, // Adiciona as cores dinâmicas
      ]}
      {...rest}
    >
      <View style={styles.leftInfo} lightColor="#f9f9f9" darkColor="grey">
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

      <Pressable
        onPress={handleImagePress}
        style={[
          styles.centerBadgeContainer,
          { backgroundColor: tipoColors[data.tipoProdutoId] ?? '#888', borderColor: '#fff', borderWidth: 1 },
        ]}
      >
        <Text style={[styles.typeBadgeText, { color: '#fff' }]}>{tipoLabel}</Text>
      </Pressable>

      <View style={styles.buttonContainer} lightColor="#f9f9f9" darkColor="grey">
        <TouchableOpacity onPress={onOpen}>
          <FontAwesome name="edit" size={28} color={Colors[colorScheme ?? 'light'].tint} style={{ marginLeft: 16 }} />
        </TouchableOpacity>

        <TouchableOpacity onPress={onDelete}>
          <FontAwesome name="trash" size={24} color="red" style={{ marginLeft: 16 }} />
        </TouchableOpacity>
        {/* Modal para mostrar os ingredientes */}
        <Modal
          visible={modalVisible}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setModalVisible(false)} // Fechar o modal
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
                backgroundColor: colorScheme === "dark" ? "#333" : "#fff",
                padding: 20,
                borderRadius: 10,
                width: "80%",
              }}
            >
              <Text style={{ fontSize: 20, fontWeight: "bold", marginBottom: 15 }}>
                Ingredientes do {data.nome}:
              </Text>
              <Text style={{ marginBottom: 20 }}>{data.ingredientes ?? 'Os ingredientes não foram informados no cadastro deste produto'}</Text>
              <Button title="Fechar" onPress={() => setModalVisible(false)} />
            </View>
          </View>
        </Modal>
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
  leftInfo: {
    flex: 1,
  },
  centerBadgeContainer: {
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  typeBadgeText: {
    fontWeight: '700',
    fontSize: 12,
    textAlign: 'center'
  }
});
