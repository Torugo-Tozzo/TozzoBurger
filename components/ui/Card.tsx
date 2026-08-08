import React from 'react';
import { View, ViewProps, StyleSheet, useColorScheme } from 'react-native';
import Colors from '@/constants/Colors';
import { radius, spacing } from '@/constants/theme';

type Props = ViewProps & {
  padding?: number;
};

export function Card({ style, padding = spacing.lg, children, ...rest }: Props) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  return (
    <View
      style={[styles.base, { backgroundColor: colors.surface, borderColor: colors.border, padding }, style as any]}
      {...rest}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    borderWidth: 1,
  },
});
