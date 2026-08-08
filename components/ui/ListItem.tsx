import React from 'react';
import { Pressable, PressableProps, View, Text, StyleSheet, useColorScheme } from 'react-native';
import Colors from '@/constants/Colors';
import { spacing, type } from '@/constants/theme';

type Props = PressableProps & {
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
};

export function ListItem({ title, subtitle, trailing, style, ...rest }: Props) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  return (
    <Pressable style={[styles.container, { borderColor: colors.border }, style as any]} {...rest}>
      <View style={styles.textBlock}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>{subtitle}</Text>
        ) : null}
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  textBlock: { flex: 1, marginRight: spacing.md },
  title: { fontSize: type.body, fontWeight: '600' },
  subtitle: { fontSize: type.bodySm, marginTop: 2 },
  trailing: { flexDirection: 'row', alignItems: 'center' },
});
