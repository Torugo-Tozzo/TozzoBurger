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
import { useTranslation } from 'react-i18next';
import { getProductTypeLabel } from '@/components/productTypeLabel';

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
  const { t } = useTranslation();

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
        Alert.alert(t('common.error'), t('errors.required'));
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
      Alert.alert(t('common.error'), t('errors.saveFailed'));
    }
  }

  return (
    <View style={{ flex: 1, padding: spacing.xl, borderColor: 'black', borderWidth: 1 }}>
      <Text style={{ fontSize: type.heading, fontWeight: 'bold' }}>
        {productId ? t('products.editProduct') : t('products.registerTitle')}
      </Text>
      <View style={{ marginVertical: spacing.xl, height: 1, backgroundColor: colors.border }} />

      <Text style={{ fontSize: type.body, marginVertical: spacing.md, fontWeight: 'bold' }}>{t('products.name')}</Text>
      <TextInput
        style={{ padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, color: colors.text }}
        placeholder={t('products.namePlaceholder')}
        accessibilityLabel={t('products.name')}
        value={name}
        onChangeText={setNome}
        placeholderTextColor={colors.textMuted}
      />

      <Text style={{ fontSize: type.body, marginVertical: spacing.md, fontWeight: 'bold' }}>{t('products.price')}</Text>
      <TextInput
        style={{ padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, color: colors.text }}
        placeholder={t('products.pricePlaceholder')}
        accessibilityLabel={t('products.price')}
        value={price}
        keyboardType="numeric"
        onChangeText={setPreco}
        placeholderTextColor={colors.textMuted}
      />

      <Text style={{ fontSize: type.body, marginVertical: spacing.md, fontWeight: 'bold' }}>{t('products.ingredients')}</Text>
      <TextInput
        style={{ padding: spacing.md, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, color: colors.text, height: 100, textAlignVertical: 'top' }}
        placeholder={t('products.ingredientsPlaceholder')}
        accessibilityLabel={t('products.ingredients')}
        value={ingredients}
        onChangeText={setIngredientes}
        placeholderTextColor={colors.textMuted}
        multiline
      />

      <Text style={{ fontSize: type.body, marginVertical: spacing.md, fontWeight: 'bold' }}>{t('products.productType')}</Text>
      <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, marginBottom: spacing.md }}>
        <Picker
          selectedValue={productTypeId}
          onValueChange={(itemValue) => setTipoProdutoId(Number(itemValue))}
          style={{ color: colors.textMuted }}
          dropdownIconColor={colors.text}
          accessibilityLabel={t('products.productType')}
        >
          <Picker.Item label={t('products.selectType')} value={undefined} />
          {tiposProdutos.map((tipo) => (
            <Picker.Item key={tipo.id} label={getProductTypeLabel(tipo.id, tipo.description, t)} value={tipo.id} />
          ))}
        </Picker>
      </View>

      <Button title={t('common.save')} onPress={handleSave} />
    </View>
  );
}
