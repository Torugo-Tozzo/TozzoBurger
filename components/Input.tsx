import React from "react";
import { TextInput, TextInputProps, useColorScheme } from "react-native";
import Colors from '@/constants/Colors';
import { spacing } from '@/constants/theme';

// Excecao deliberada ao "tudo quadrado" do resto do design system - pedido
// explicito do usuario so pro input de busca, radius fixo (nao usa o token
// `radius`, que e 0 em todo o resto do app).
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
          marginBottom: spacing.xs,
          color: colors.text,
        },
        style,
      ]}
      placeholderTextColor={colors.textMuted}
      {...rest}
    />
  );
}
