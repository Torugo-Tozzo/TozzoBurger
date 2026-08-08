import React from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Colors from '@/constants/Colors';
import { spacing, type } from '@/constants/theme';

type Props = {
  icon?: React.ComponentProps<typeof FontAwesome>['name'];
  title: string;
  message?: string;
};

export function EmptyState({ icon = 'inbox', title, message }: Props) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  return (
    <View style={styles.container}>
      <FontAwesome name={icon} size={40} color={colors.textMuted} />
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {message ? <Text style={[styles.message, { color: colors.textMuted }]}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xl },
  title: { fontSize: type.subtitle, fontWeight: '700', marginTop: spacing.md, textAlign: 'center' },
  message: { fontSize: type.bodySm, marginTop: spacing.xs, textAlign: 'center' },
});
