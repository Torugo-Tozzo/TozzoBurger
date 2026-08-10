import React from 'react';
import { View, ViewProps, useColorScheme } from 'react-native';
import Colors from '@/constants/Colors';

export function ListFrame({ style, children, ...rest }: ViewProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  return (
    <View style={[{ borderWidth: 1, borderColor: colors.border }, style]} {...rest}>
      {children}
    </View>
  );
}

export default ListFrame;
