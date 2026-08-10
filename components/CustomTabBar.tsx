import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

/**
 * Tab bar 100% custom. As props nativas da lib (tabBarActiveBackgroundColor +
 * tabBarButton/tabBarBackground customizado) tem um bug real nessa versao do
 * @react-navigation/bottom-tabs: qualquer tabBarButton/tabBarBackground
 * proprio quebra o icone+label do item ativo (fica em branco), e sem eles a
 * borda por item (tabBarItemStyle.borderRightWidth) so aparece em 2 dos 5
 * botoes de forma inconsistente. Testado: config original, StyleSheet.
 * hairlineWidth, tabBarButton custom, tabBarBackground custom (com e sem as
 * linhas divisorias) - todas as variantes reproduzem um dos dois problemas.
 * Renderizar os 5 botoes na mao aqui evita esses hooks parciais da lib
 * inteiramente - controle total sobre borda/fundo/icone, sem depender do
 * comportamento interno dela.
 */
export function CustomTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  // `href` e opcao especifica do expo-router (esconde a tab quando null),
  // nao existe no tipo BottomTabNavigationOptions da lib base.
  const routes = state.routes.filter((route) => (descriptors[route.key].options as any).href !== null);

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: insets.bottom },
      ]}
    >
      {routes.map((route) => {
        const { options } = descriptors[route.key];
        const routeIndex = state.routes.findIndex((r) => r.key === route.key);
        const focused = state.index === routeIndex;
        const color = focused ? colors.background : colors.text;
        const label = typeof options.title === 'string' ? options.title : route.name;

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name, route.params);
          }
        };

        const onLongPress = () => {
          navigation.emit({ type: 'tabLongPress', target: route.key });
        };

        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={options.tabBarAccessibilityLabel}
            onPress={onPress}
            onLongPress={onLongPress}
            style={[
              styles.item,
              {
                backgroundColor: focused ? colors.text : 'transparent',
                borderRightColor: colors.border,
              },
            ]}
          >
            {options.tabBarIcon?.({ focused, color, size: 28 })}
            <Text style={[styles.label, { color }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: 1,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRightWidth: 1,
  },
  label: {
    fontSize: 11,
    marginTop: 2,
  },
});

export default CustomTabBar;
