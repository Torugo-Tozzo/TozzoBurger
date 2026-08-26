import React from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Link, Tabs } from 'expo-router';
import { Pressable, View } from 'react-native';
import SyncIndicator from '@/components/SyncIndicator';
import { CustomTabBar } from '@/components/CustomTabBar';
import { useAuth } from '@/context/AuthContext';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';
import { useTranslation } from 'react-i18next';

// You can explore the built-in icon families and icons on the web at https://icons.expo.fyi/
function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={28} style={{ marginBottom: -3 }} {...props} />;
}

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const { user } = useAuth();
  const { t } = useTranslation();
  const isCliente = user?.role === 'CUSTOMER';

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerStyle: {
          borderBottomWidth: 1,
          borderBottomColor: Colors[colorScheme ?? 'light'].border,
          elevation: 0,
          shadowOpacity: 0,
        },
        headerShown: useClientOnlyValue(false, true),
        headerRight: () => <SyncIndicator />,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: isCliente ? t('navigation.menu') : t('navigation.sell'),
          headerTitleAlign: 'center',
          tabBarIcon: ({ color }) => <TabBarIcon name="home" color={color} />,
          headerLeft: isCliente ? undefined : () => (
            <Link href="/modais/adicionalModal" asChild>
              <Pressable accessibilityRole="button" accessibilityLabel={t('navigation.addOn')}>
                {({ pressed }) => (
                  <FontAwesome
                    name="flash"
                    size={30}
                    color={Colors[colorScheme ?? 'light'].primary}
                    style={{ marginLeft: 20, opacity: pressed ? 0.5 : 1 }}
                  />
                )}
              </Pressable>
            </Link>
          ),
        }}
      />
      <Tabs.Screen
        name='pedidos'
        options={{
          title: t('navigation.orders'),
          tabBarIcon: ({ color }) => <MaterialIcons name="receipt-long" size={28} style={{ marginBottom: -3 }} color={color} />,
        }}
      />
      <Tabs.Screen
        name="historico"
        options={{
          title: t('navigation.sales'),
          href: isCliente ? null : '/historico',
          tabBarIcon: ({ color }) => <TabBarIcon name="dollar" color={color} />,
        }}
      />
      <Tabs.Screen
        name="produtos"
        options={{
          title: t('navigation.catalog'),
          href: isCliente ? null : '/produtos',
          tabBarIcon: ({ color }) => <TabBarIcon name="book" color={color} />,
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Link href="/modais/produtoModal" asChild>
                <Pressable accessibilityRole="button" accessibilityLabel={t('products.newProduct')}>
                  {({ pressed }) => (
                    <FontAwesome
                      name="plus-circle"
                      size={30}
                      color={Colors[colorScheme ?? 'light'].primary}
                      style={{ marginRight: 8, opacity: pressed ? 0.5 : 1 }}
                    />
                  )}
                </Pressable>
              </Link>
              <SyncIndicator />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="configs"
        options={{
          title: t('navigation.settings'),
          tabBarIcon: ({ color }) => <TabBarIcon name="cog" color={color} />,
        }}
      />
    </Tabs>
  );
}
