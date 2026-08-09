import React from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { IconButton } from '@/components/ui/IconButton';
import Colors from '@/constants/Colors';
import { spacing, type } from '@/constants/theme';

export type RecordCardAction = {
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  label: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
  loading?: boolean;
};

type Props = {
  accentColor: string;
  title: string;
  subtitle?: string;
  meta?: string;
  total: number;
  badge?: { label: string; color: string };
  strikethrough?: boolean;
  actions: RecordCardAction[];
};

export function RecordCard({ accentColor, title, subtitle, meta, total, badge, strikethrough, actions }: Props) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const strike = strikethrough ? { textDecorationLine: 'line-through' as const, color: colors.textMuted } : null;

  return (
    <Card padding={0} style={styles.container}>
      <View style={[styles.accent, { backgroundColor: accentColor }]} />
      <View style={styles.content}>
        <View style={styles.mainRow}>
          <View style={styles.textBlock}>
            <Text style={[styles.title, { color: colors.text }, strike]} numberOfLines={1}>{title}</Text>
            {subtitle ? (
              <Text style={[styles.subtitle, { color: colors.textMuted }, strike]} numberOfLines={1}>{subtitle}</Text>
            ) : null}
            {meta ? (
              <Text style={[styles.meta, { color: colors.textMuted }, strike]} numberOfLines={1}>{meta}</Text>
            ) : null}
          </View>
          <View style={styles.trailing}>
            <Text style={[styles.total, { color: colors.text }, strike]}>R$ {total.toFixed(2)}</Text>
            {badge ? <Badge label={badge.label} color={badge.color} /> : null}
          </View>
        </View>
        <View style={[styles.actionsRow, { borderTopColor: colors.border }]}>
          {actions.map((action) => (
            <IconButton
              key={action.label}
              icon={action.icon}
              label={action.label}
              onPress={action.onPress}
              disabled={action.disabled}
              destructive={action.destructive}
              loading={action.loading}
            />
          ))}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', marginBottom: spacing.md, overflow: 'hidden', padding: 0 },
  accent: { width: 4 },
  content: { flex: 1 },
  mainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: spacing.md,
    gap: spacing.sm,
  },
  textBlock: { flex: 1 },
  title: { fontSize: type.body, fontWeight: '700' },
  subtitle: { fontSize: type.bodySm, marginTop: 2 },
  meta: { fontSize: type.caption, marginTop: 2 },
  trailing: { alignItems: 'flex-end', gap: spacing.xs },
  total: { fontSize: type.body, fontWeight: '700' },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
  },
});
