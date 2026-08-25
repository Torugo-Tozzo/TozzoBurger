import React from 'react';
import { Modal, View, Text, StyleSheet, useColorScheme } from 'react-native';
import Colors from '@/constants/Colors';
import { Button } from './Button';
import { radius, spacing, type } from '@/constants/theme';
import { useTranslation } from 'react-i18next';

type Props = {
  visible: boolean;
  onClose: () => void;
  nomeProduto: string;
  ingredients?: string | null;
};

export function IngredientesModal({ visible, onClose, nomeProduto, ingredients }: Props) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const { t } = useTranslation();

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.box, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>{t('catalog.ingredientsFor', { name: nomeProduto })}</Text>
          <Text style={[styles.body, { color: colors.text }]}>
            {ingredients ?? t('catalog.ingredientsMissing')}
          </Text>
          <Button title={t('common.close')} onPress={onClose} variant="outline" />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  box: { padding: spacing.xl, borderRadius: radius.lg, borderWidth: 1, width: '80%' },
  title: { fontSize: type.title, fontWeight: 'bold', marginBottom: spacing.lg },
  body: { fontSize: type.body, marginBottom: spacing.xl },
});
