import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { radius, spacing, type } from '@/constants/theme';

type Props = {
  label: string;
  color: string;
};

export function Badge({ label, color }: Props) {
  return (
    <View style={[styles.container, { backgroundColor: color }]}>
      <Text style={styles.text} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minWidth: 90,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderColor: '#fff',
    borderWidth: 1,
  },
  text: {
    color: '#fff',
    fontWeight: '700',
    fontSize: type.caption,
    textAlign: 'center',
  },
});
