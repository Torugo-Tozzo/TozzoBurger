import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Platform, StyleSheet, TextInput, Button, Alert } from 'react-native';
import { Picker } from "@react-native-picker/picker";
import { Text, View } from '@/components/Themed';
import { useProductDatabase } from '@/database/useProductDatabase';
import { useLocalSearchParams, useRouter } from 'expo-router';

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
  const [tipoProdutoId, setTipoProdutoId] = useState<number | undefined>();
  const [tiposProdutos, setTiposProdutos] = useState<{ id: number; descricao: string }[]>([]);
  const router = useRouter();

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
        Alert.alert('Erro', 'Por favor, preencha todos os campos.');
        return;
      }

      if (productId) {
        await update({
          id: Number(productId),
          nome,
          preco: parseFloat(preco),
          tipoProdutoId,
        });
      } else {
        await create({
          nome,
          preco: parseFloat(preco),
          tipoProdutoId,
        });
      }
      router.back();
    } catch (error) {
      console.error('Erro ao salvar produto:', error);
      Alert.alert('Erro', 'Houve um erro ao salvar o produto.');
    }

  }

  return (
    <View style={styles.container}>
      <Text style={styles.title} lightColor="black" darkColor="white">
        {productId ? 'Editar Produto' : 'Cadastrar Produto'}
      </Text>
      <View style={styles.separator} lightColor="#eee" darkColor="rgba(255,255,255,0.1)" />

      <TextInput
        style={styles.input}
        placeholder="Nome do Produto"
        value={nome}
        onChangeText={setNome}
      />

      <TextInput
        style={styles.input}
        placeholder="Preço do Produto"
        value={preco}
        keyboardType="numeric"
        onChangeText={setPreco}
      />

      <Picker
        selectedValue={tipoProdutoId}
        style={styles.input}
        onValueChange={(itemValue) => setTipoProdutoId(Number(itemValue))}
      >
        <Picker.Item label="Selecione um tipo" value={undefined} />
        {tiposProdutos.map((tipo) => (
          <Picker.Item key={tipo.id} label={tipo.descricao} value={tipo.id} />
        ))}
      </Picker>

      <Button title="Salvar" onPress={handleSave} />

      <StatusBar style={Platform.OS === 'ios' ? 'light' : 'auto'} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 20,
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
  },
});
