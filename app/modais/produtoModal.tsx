import React, { useEffect, useState } from 'react';
import { TextInput, Alert } from 'react-native';
import { Picker } from "@react-native-picker/picker";
import { Text, View } from '@/components/Themed';
import { Button } from '@/components/ui/Button';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { spacing, radius, type } from '@/constants/theme';
import { useProductDatabase } from '@/database/useProductDatabase';
import { useLocalSearchParams, useRouter } from 'expo-router';

export default function ProdutoModalScreen() {
  const { productId } = useLocalSearchParams();
  const { show, create, update, getProductTypes } = useProductDatabase();

  const [name, setNome] = useState('');
  const [price, setPreco] = useState('');
  const [ingredients, setIngredientes] = useState('');
  const [productTypeId, setTipoProdutoId] = useState<number | undefined>();
  const [tiposProdutos, setTiposProdutos] = useState<{ id: number; description: string }[]>([]);
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  useEffect(() => {
    async function fetchTiposProdutos() {
      try {
        const types = await getProductTypes();
        setTiposProdutos(types);
      } catch (error) {
        console.error('Erro ao carregar tipos de produtos:', error);
      }
    }

    fetchTiposProdutos();
  }, []);

  useEffect(() => {
    if (productId != null) {
      const prodId = String(productId);
      async function fetchProduct() {
        try {
          const product = await show(prodId);
          if (product) {
            setNome(product.name);
            setPreco(product.price.toString());
            setTipoProdutoId(product.productTypeId);
            setIngredientes(product.ingredients?.toString() || '');
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
      if (!name || !price || !productTypeId) {
        Alert.alert('Erro', 'Por favor, preencha os campos obrigatórios: \nnome, preço e tipo.');
        return;
      }

      if (productId) {
        await update({ id: String(productId), name, price: parseFloat(price), productTypeId, ingredients });
      } else {
        await create({ name, price: parseFloat(price), productTypeId, ingredients });
      }
      router.back();
    } catch (error) {
      console.error('Erro ao salvar produto:', error);
      Alert.alert('Erro', 'Houve um erro ao salvar o produto.');
    }
  }

  return (
    <View style={{ flex: 1, padding: spacing.xl, borderColor: 'black', borderWidth: 1 }}>
      <Text style={{ fontSize: type.heading, fontWeight: 'bold' }}>
        {productId ? 'Editar Produto' : 'Cadastrar Produto'}
      </Text>
      <View style={{ marginVertical: spacing.xl, height: 1, backgroundColor: colors.border }} />

      <Text style={{ fontSize: type.body, marginVertical: spacing.md, fontWeight: 'bold' }}>Nome do Produto</Text>
      <TextInput
        style={{ padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, color: colors.text }}
        placeholder="Digite o Nome..."
        value={name}
        onChangeText={setNome}
        placeholderTextColor={colors.textMuted}
      />

      <Text style={{ fontSize: type.body, marginVertical: spacing.md, fontWeight: 'bold' }}>Preço do Produto</Text>
      <TextInput
        style={{ padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, color: colors.text }}
        placeholder="Digite o Preço.."
        value={price}
        keyboardType="numeric"
        onChangeText={setPreco}
        placeholderTextColor={colors.textMuted}
      />

      <Text style={{ fontSize: type.body, marginVertical: spacing.md, fontWeight: 'bold' }}>Ingredientes do Produto</Text>
      <TextInput
        style={{ padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, color: colors.text, height: 100, textAlignVertical: 'top' }}
        placeholder="Digite os Ingredientes.."
        value={ingredients}
        onChangeText={setIngredientes}
        placeholderTextColor={colors.textMuted}
        multiline
      />

      <Text style={{ fontSize: type.body, marginVertical: spacing.md, fontWeight: 'bold' }}>Tipo do Produto</Text>
      <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, marginBottom: spacing.md }}>
        <Picker
          selectedValue={productTypeId}
          onValueChange={(itemValue) => setTipoProdutoId(Number(itemValue))}
          style={{ color: colors.textMuted }}
          dropdownIconColor={colors.text}
        >
          <Picker.Item label="Selecione um tipo" value={undefined} />
          {tiposProdutos.map((tipo) => (
            <Picker.Item key={tipo.id} label={tipo.description} value={tipo.id} />
          ))}
        </Picker>
      </View>

      <Button title="Salvar" onPress={handleSave} />
    </View>
  );
}
