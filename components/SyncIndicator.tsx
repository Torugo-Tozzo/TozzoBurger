import React from 'react';
import { TouchableOpacity, View, ActivityIndicator, StyleSheet } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useAutoSync } from '@/context/AutoSyncContext';

export default function SyncIndicator() {
  const { isSyncing, triggerSync } = useAutoSync();

  return (
    <TouchableOpacity onPress={() => triggerSync().catch(() => {})} style={styles.container} accessibilityLabel="sync-button">
      <View style={styles.inner}>
        {isSyncing ? (
          <ActivityIndicator size="small" color="#007AFF" />
        ) : (
          <FontAwesome name="refresh" size={20} color="#007AFF" />
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  inner: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
