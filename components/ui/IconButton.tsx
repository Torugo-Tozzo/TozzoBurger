import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, useColorScheme } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import Colors from '@/constants/Colors';

type Props = {
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  label: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
  loading?: boolean;
  size?: number;
  color?: string; // sobrescreve a cor padrão — usado quando o ícone fica sobre um
                  // fundo colorido (ex.: dentro de um botão circular preenchido)
                  // e a lógica padrão (texto/muted/danger) daria baixo contraste.
};

export function IconButton({ icon, label, onPress, disabled, destructive, loading, size = 18, color: colorOverride }: Props) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const isDisabled = disabled || loading;
  const color = colorOverride ?? (isDisabled ? colors.textMuted : destructive ? Colors.status.danger : colors.text);

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={isDisabled}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.base, pressed && !isDisabled ? styles.pressed : null]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={color} />
      ) : (
        <FontAwesome name={icon} size={size} color={color} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  pressed: {
    opacity: 0.6,
  },
});
