import React from 'react';
import { View, useColorScheme } from 'react-native';
import Colors from '@/constants/Colors';

export function ListDivider() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  return <View style={{ borderTopWidth: 1, borderStyle: 'dashed', borderTopColor: colors.border }} />;
}

export default ListDivider;
