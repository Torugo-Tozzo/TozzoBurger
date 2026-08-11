import React, { useState } from 'react';
import { TextInput, Alert } from 'react-native';
import { Text, View } from '@/components/Themed';
import { Button } from '@/components/ui/Button';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { spacing, radius, type } from '@/constants/theme';
import { useProductDatabase } from '@/database/useProductDatabase';
import { useRouter } from 'expo-router';
import { useCart } from '@/context/CartContext';

export default function AdicionalModalScreen() {
  const { create } = useProductDatabase();
  const [nome, setNome] = useState('');
  const [preco, setPreco] = useState('');
  const router = useRouter();
  const { addToCart } = useCart();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  async function handleSave() {
    try {
      if (!nome || !preco) {
        Alert.alert('Erro', 'Por favor, preencha todos os campos.');
        return;
      }

      // create gera UUID string — o antigo insertedRowId numérico virava NaN aqui
      const response = await create({
        nome,
        preco: parseFloat(preco),
        tipoProdutoId: 8,
      });

      await addToCart({
        id: response.id,
        nome,
        preco: parseFloat(preco),
        tipoProdutoId: 8,
        quantidade: 1,
        updated_at: Date.now(),
      });

      router.back();
    } catch (error) {
      console.error('Erro ao salvar produto:', error);
      Alert.alert('Erro', 'Houve um erro ao salvar o produto.');
    }
  }

  return (
    <View style={{ flex: 1, padding: spacing.xl, borderColor: 'black', borderWidth: 1 }}>
      <Text style={{ fontSize: type.heading, fontWeight: 'bold' }}>Produto Adicional</Text>
      <View style={{ marginVertical: spacing.xl, height: 1, backgroundColor: colors.border }} />

      <Text style={{ fontSize: type.body, marginVertical: spacing.md, fontWeight: 'bold' }}>Nome do Produto</Text>
      <TextInput
        style={{ padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, color: colors.text }}
        placeholder="Digite o Nome..."
        value={nome}
        onChangeText={setNome}
        placeholderTextColor={colors.textMuted}
      />

      <Text style={{ fontSize: type.body, marginVertical: spacing.md, fontWeight: 'bold' }}>Preço do Produto</Text>
      <TextInput
        style={{ padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, color: colors.text }}
        placeholder="Digite o Preço..."
        value={preco}
        keyboardType="numeric"
        onChangeText={setPreco}
        placeholderTextColor={colors.textMuted}
      />

      <Button title="Salvar" onPress={handleSave} />
    </View>
  );
}
