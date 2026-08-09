import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { spacing, radius } from '@/constants/theme';

export function ProductCardSkeleton() {
  return (
    <Card style={styles.container}>
      <View style={styles.leftInfo}>
        <Skeleton width="70%" height={16} />
        <Skeleton width="40%" height={13} style={styles.spacingTop} />
      </View>
      <Skeleton width={70} height={22} borderRadius={radius.full} />
      <View style={styles.actions}>
        <Skeleton width={36} height={36} borderRadius={8} />
        <Skeleton width={36} height={36} borderRadius={8} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md, gap: spacing.md },
  leftInfo: { flex: 1 },
  spacingTop: { marginTop: spacing.xs },
  actions: { flexDirection: 'row', gap: spacing.sm },
});

export default ProductCardSkeleton;
