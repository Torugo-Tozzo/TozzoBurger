import React from 'react';
import { Modal, View, Text, StyleSheet, useColorScheme } from 'react-native';
import Colors from '@/constants/Colors';
import { Button } from './Button';
import { radius, spacing, type } from '@/constants/theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  nomeProduto: string;
  ingredientes?: string | null;
};

export function IngredientesModal({ visible, onClose, nomeProduto, ingredientes }: Props) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.box, { backgroundColor: colors.background, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>Ingredientes do {nomeProduto}:</Text>
          <Text style={[styles.body, { color: colors.text }]}>
            {ingredientes ?? 'Os ingredientes não foram informados no cadastro deste produto'}
          </Text>
          <Button title="Fechar" onPress={onClose} variant="outline" />
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
