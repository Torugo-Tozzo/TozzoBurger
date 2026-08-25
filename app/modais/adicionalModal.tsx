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
import { useTranslation } from 'react-i18next';

export default function AdicionalModalScreen() {
  const { create } = useProductDatabase();
  const [name, setNome] = useState('');
  const [price, setPreco] = useState('');
  const router = useRouter();
  const { addToCart } = useCart();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const { t } = useTranslation();

  async function handleSave() {
    try {
      if (!name || !price) {
        Alert.alert(t('common.error'), t('errors.required'));
        return;
      }

      // create gera UUID string — o antigo insertedRowId numérico virava NaN aqui
      const response = await create({
        name,
        price: parseFloat(price),
        productTypeId: 8,
      });

      await addToCart({
        id: response.id,
        name,
        price: parseFloat(price),
        productTypeId: 8,
        quantity: 1,
        updated_at: Date.now(),
      });

      router.back();
    } catch (error) {
      console.error('Erro ao salvar produto:', error);
      Alert.alert(t('common.error'), t('errors.saveFailed'));
    }
  }

  return (
    <View style={{ flex: 1, padding: spacing.xl, borderColor: 'black', borderWidth: 1 }}>
      <Text style={{ fontSize: type.heading, fontWeight: 'bold' }}>{t('products.addOnTitle')}</Text>
      <View style={{ marginVertical: spacing.xl, height: 1, backgroundColor: colors.border }} />

      <Text style={{ fontSize: type.body, marginVertical: spacing.md, fontWeight: 'bold' }}>{t('products.name')}</Text>
      <TextInput
        style={{ padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, color: colors.text }}
        placeholder={t('products.namePlaceholder')}
        value={name}
        onChangeText={setNome}
        placeholderTextColor={colors.textMuted}
      />

      <Text style={{ fontSize: type.body, marginVertical: spacing.md, fontWeight: 'bold' }}>{t('products.price')}</Text>
      <TextInput
        style={{ padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, color: colors.text }}
        placeholder={t('products.pricePlaceholder')}
        value={price}
        keyboardType="numeric"
        onChangeText={setPreco}
        placeholderTextColor={colors.textMuted}
      />

      <Button title={t('common.save')} onPress={handleSave} />
    </View>
  );
}
