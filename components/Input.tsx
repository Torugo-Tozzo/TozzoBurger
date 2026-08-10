import React from "react";
import { TextInput, TextInputProps, useColorScheme } from "react-native";
import Colors from '@/constants/Colors';
import { spacing } from '@/constants/theme';

// Exceção ao design system (cantos retos): input de pesquisa mantém
// borda arredondada a pedido do usuário.
const INPUT_BORDER_RADIUS = 12;

export function Input({ style, ...rest }: TextInputProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

  return (
    <TextInput
      style={[
        {
          height: 54,
          borderWidth: 1,
          borderRadius: INPUT_BORDER_RADIUS,
          borderColor: colors.border,
          paddingHorizontal: spacing.lg,
          marginTop: spacing.md,
          marginBottom: spacing.md,
          color: colors.text,
        },
        style,
      ]}
      placeholderTextColor={colors.textMuted}
      {...rest}
    />
  );
}
