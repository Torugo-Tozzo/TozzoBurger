import React from 'react';
import { Pressable, PressableProps, StyleSheet, Text, ActivityIndicator, View, useColorScheme } from 'react-native';
import Colors from '@/constants/Colors';
import { radius, spacing, type } from '@/constants/theme';

type ButtonVariant = 'primary' | 'danger' | 'outline';

type Props = PressableProps & {
  title: string;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
};

export function Button({ title, variant = 'primary', loading = false, disabled = false, style, ...rest }: Props) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const isDisabled = disabled || loading;

  if (variant === 'outline') {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.outlineBase,
          { borderColor: colors.text, opacity: isDisabled ? 0.5 : pressed ? 0.7 : 1 },
          style as any,
        ]}
        disabled={isDisabled}
        {...rest}
      >
        {loading ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <Text style={[styles.text, { color: colors.text }]}>{title}</Text>
        )}
      </Pressable>
    );
  }

  const contentBg = variant === 'danger' ? Colors.status.danger : colors.text;
  const contentText = variant === 'danger' ? '#fff' : colors.background;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.frame,
        { backgroundColor: colors.text, opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1 },
        style as any,
      ]}
      disabled={isDisabled}
      {...rest}
    >
      <View style={[styles.line, { backgroundColor: colors.background }]}>
        <View style={[styles.content, { backgroundColor: contentBg }]}>
          {loading ? (
            <ActivityIndicator color={contentText} />
          ) : (
            <Text style={[styles.text, { color: contentText }]}>{title}</Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: { borderRadius: radius.md, padding: 2 },
  line: { borderRadius: radius.sm, padding: 2 },
  content: {
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineBase: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { fontSize: type.body, fontWeight: '700' },
});
