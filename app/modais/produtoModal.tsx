import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet, TextInput, Alert, useColorScheme, Pressable, Text as RNText } from 'react-native';
import { Picker } from "@react-native-picker/picker";
import { Text, View } from '@/components/Themed';
import { useProductDatabase } from '@/database/useProductDatabase';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Input } from '@/components/Input';

type ProdutoModalScreenProps = {
  route: {
    params: { productId?: number };
  };
};

export default function ProdutoModalScreen({ route }: ProdutoModalScreenProps) {
  const { productId } = useLocalSearchParams();
  const { show, create, update, getTipoProdutos } = useProductDatabase();

  const [nome, setNome] = useState('');
  const [preco, setPreco] = useState('');
  const [ingredientes, setIngredientes] = useState('');
  const [tipoProdutoId, setTipoProdutoId] = useState<number | undefined>();
  const [tiposProdutos, setTiposProdutos] = useState<{ id: number; descricao: string }[]>([]);
  const router = useRouter();

  const colorScheme = useColorScheme();
  const placeholderColor = 'grey';

  useEffect(() => {
    async function fetchTiposProdutos() {
      try {
        const tipos = await getTipoProdutos();
        setTiposProdutos(tipos);
      } catch (error) {
        console.error('Erro ao carregar tipos de produtos:', error);
      }
    }

    fetchTiposProdutos();
  }, []);

  useEffect(() => {
    if (productId != null) {
      let prodId = Number(productId);
      async function fetchProduct() {
        try {
          const product = await show(prodId);
          if (product) {
            setNome(product.nome);
            setPreco(product.preco.toString());
            setTipoProdutoId(product.tipoProdutoId);
            setIngredientes(product.ingredientes?.toString() || '');
          }
        } catch (error) {
          console.error('Erro ao carregar o produto:', error);
        }
      }

      fetchProduct();
    }
  }, [productId]);

  async function handleSave() {
    try {
      if (!nome || !preco || !tipoProdutoId) {
        Alert.alert('Erro', 'Por favor, preencha os campos obrigatórios: \nnome, preço e tipo.');
        return;
      }

      if (productId) {
        await update({
          id: Number(productId),
          nome,
          preco: parseFloat(preco),
          tipoProdutoId,
          ingredientes
        });
      } else {
        await create({
          nome,
          preco: parseFloat(preco),
          tipoProdutoId,
          ingredientes
        });
      }
      router.back();
    } catch (error) {
      console.error('Erro ao salvar produto:', error);
      Alert.alert('Erro', 'Houve um erro ao salvar o produto.');
    }
  }

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      padding: 20,
    },
    title: {
      fontSize: 30,
      fontWeight: 'bold',
    },
    separator: {
      marginVertical: 20,
      height: 1,
      width: '80%',
    },
    input: {
      width: '100%',
      padding: 10,
      marginVertical: 10,
      borderWidth: 1,
      borderColor: '#ccc',
      borderRadius: 5,
      color: colorScheme === "dark" ? "#fff" : "#000"
    },
    picker: {
      color: 'grey',
    },
    buttonContainer: {
      width: '100%',
      marginTop: 20,
      backgroundColor: '#007BFF',
      paddingVertical: 12,
      borderRadius: 5,
      alignItems: 'center',
    },
    buttonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: 'bold',
    },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title} lightColor="black" darkColor="white">
        {productId ? 'Editar Produto' : 'Cadastrar Produto'}
      </Text>
      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />
      <Text style={{ fontSize: 16, margin: 10, fontWeight: "bold" }}>Nome do Produto</Text>
      <TextInput
        style={styles.input}
        placeholder="Digite o Nome..."
        value={nome}
        onChangeText={setNome}
        placeholderTextColor={placeholderColor}
      />
      <Text style={{ fontSize: 16, margin: 10, fontWeight: "bold" }}>Preço do Produto</Text>
      <TextInput
        style={styles.input}
        placeholder="Digite o Preço.."
        value={preco}
        keyboardType="numeric"
        onChangeText={setPreco}
        placeholderTextColor={placeholderColor}
      />
      <Text style={{ fontSize: 16, margin: 10, fontWeight: "bold" }}>Ingredientes do Produto </Text>
      <TextInput
        style={[styles.input, { height: 100, textAlignVertical: 'top' }]} // Ajuste a altura para 3-4 linhas
        placeholder="Digite os Ingredientes.."
        value={ingredientes}
        onChangeText={setIngredientes}
        placeholderTextColor={placeholderColor}
        multiline={true} // Permite múltiplas linhas
      />
      <Text style={{ fontSize: 16, margin: 10, fontWeight: "bold" }}>Tipo do Produto</Text>
      <View style={styles.input}>
        <Picker
          selectedValue={tipoProdutoId}
          onValueChange={(itemValue) => setTipoProdutoId(Number(itemValue))}
          style={styles.picker}
          dropdownIconColor={colorScheme === "dark" ? "#fff" : "#000"}
        >
          <Picker.Item label="Selecione um tipo" value={undefined} />
          {tiposProdutos.map((tipo) => (
            <Picker.Item key={tipo.id} label={tipo.descricao} value={tipo.id} />
          ))}
        </Picker>
      </View>
      <Pressable style={styles.buttonContainer} onPress={handleSave}>
        <RNText style={styles.buttonText}>Salvar</RNText>
      </Pressable>
    </View>
  );
}
