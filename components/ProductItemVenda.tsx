import React, { useState, useRef } from "react";
import { Animated, Pressable, useColorScheme, Easing, View, StyleSheet } from "react-native";
import { Text } from "@/components/Themed";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { IconButton } from "@/components/ui/IconButton";
import { IngredientesModal } from "@/components/ui/IngredientesModal";
import { Product } from "@/database/types/Product";
import { FontAwesome } from "@expo/vector-icons";
import Colors from "@/constants/Colors";
import { tipoColors, spacing, type, radius } from "@/constants/theme";
import { useTranslation } from 'react-i18next';
import { getProductTypeLabel } from '@/components/productTypeLabel';

type Props = {
  data: Product;
  tipoNome?: string;
  onAddToCart: (product: Product) => void;
  onAdicionaltoCart: (product: Product, ehAdd: boolean) => void;
};

function ProductItemVendaInner({ data, onAddToCart, onAdicionaltoCart, tipoNome }: Props) {
  const [modalVisible, setModalVisible] = useState(false);
  const { t, i18n } = useTranslation();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  const buttonScaleAnim = useRef(new Animated.Value(1)).current;
  const iconScaleAnim = useRef(new Animated.Value(1)).current;

  const triggerAnimation = (anim: Animated.Value) => {
    Animated.sequence([
      Animated.timing(anim, { toValue: 0.8, duration: 100, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.timing(anim, { toValue: 1, duration: 100, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start();
  };

  const tipoLabel = getProductTypeLabel(data.productTypeId, tipoNome ?? (data as any).tipoNome, t);
  const price = new Intl.NumberFormat(i18n.language, { style: 'currency', currency: 'BRL' }).format(data.price);

  return (
    <Card bordered={false} style={styles.container}>
      <View style={styles.info}>
        <Text style={styles.name}>{data.name}</Text>
        <Text style={styles.price}>{t('products.price')}: {price}</Text>
      </View>

      <Pressable onPress={() => setModalVisible(true)}>
        <Badge label={tipoLabel} color={tipoColors[data.productTypeId] ?? '#888'} />
      </Pressable>

      <Animated.View style={{ transform: [{ scale: iconScaleAnim }] }}>
        <Pressable
          onPress={() => { triggerAnimation(iconScaleAnim); onAdicionaltoCart(data, true); }}
          style={{ flexDirection: "row" }}
        >
          <FontAwesome name="flash" size={25} color={colors.primary} style={{ marginRight: spacing.xl, marginLeft: spacing.md }} />
        </Pressable>
      </Animated.View>

      <Animated.View style={{ transform: [{ scale: buttonScaleAnim }] }}>
        <View style={[styles.addButton, { backgroundColor: colors.primary }]}>
          <IconButton
            icon="plus"
            label={t('common.addToOrder')}
            onPress={() => { triggerAnimation(buttonScaleAnim); onAddToCart(data); }}
            size={20}
            color={colors.background}
          />
        </View>
      </Animated.View>

      <IngredientesModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        nomeProduto={data.name}
        ingredients={data.ingredients}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  info: { flex: 1 },
  name: { fontSize: type.body, fontWeight: "bold" },
  price: { fontSize: type.bodySm },
  addButton: { width: 44, height: 44, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', marginLeft: spacing.sm },
});

export const ProductItemVenda = React.memo(ProductItemVendaInner);
