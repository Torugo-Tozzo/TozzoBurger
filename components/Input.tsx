import React from "react";
import { TextInput, TextInputProps, useColorScheme } from "react-native";
import Colors from '@/constants/Colors';
import { radius, spacing } from '@/constants/theme';

export function Input({ style, ...rest }: TextInputProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  return (
    <TextInput
      style={[
        {
          height: 54,
          borderWidth: 1,
          borderRadius: radius.sm,
          borderColor: colors.border,
          paddingHorizontal: spacing.lg,
          color: colors.text,
        },
        style,
      ]}
      placeholderTextColor={colors.textMuted}
      {...rest}
    />
  );
}
