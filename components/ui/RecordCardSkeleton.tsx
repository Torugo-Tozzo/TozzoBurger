import React from 'react';
import { View, StyleSheet, useColorScheme } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import Colors from '@/constants/Colors';
import { spacing, radius } from '@/constants/theme';

export function RecordCardSkeleton() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  return (
    <Card padding={0} style={styles.container}>
      <View style={[styles.accent, { backgroundColor: colors.textMuted }]} />
      <View style={styles.content}>
        <View style={styles.mainRow}>
          <View style={styles.textBlock}>
            <Skeleton width="60%" height={16} />
            <Skeleton width="80%" height={13} style={styles.spacingTop} />
            <Skeleton width="40%" height={11} style={styles.spacingTop} />
          </View>
          <View style={styles.trailing}>
            <Skeleton width={60} height={16} />
            <Skeleton width={70} height={20} borderRadius={radius.full} style={styles.spacingTop} />
          </View>
        </View>
        <View style={[styles.actionsRow, { borderTopColor: colors.border }]}>
          <Skeleton width={36} height={36} borderRadius={8} />
          <Skeleton width={36} height={36} borderRadius={8} />
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
  spacingTop: { marginTop: spacing.xs },
  trailing: { alignItems: 'flex-end', gap: spacing.xs },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});

export default RecordCardSkeleton;
