import React from 'react';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Link, Tabs } from 'expo-router';
import { Pressable, View } from 'react-native';
import SyncIndicator from '@/components/SyncIndicator';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';

// You can explore the built-in icon families and icons on the web at https://icons.expo.fyi/
function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>['name'];
  color: string;
}) {
  return <FontAwesome size={28} style={{ marginBottom: -3 }} {...props} />;
}

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: useClientOnlyValue(false, true),
        headerRight: () => <SyncIndicator />,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Vender',
          headerTitleAlign: 'center',
          tabBarIcon: ({ color }) => <TabBarIcon name="dollar" color={color} />,
          headerLeft: () => (
            <Link href="/modais/adicionalModal" asChild>
              <Pressable>
                {({ pressed }) => (
                  <FontAwesome
                    name="flash"
                    size={30}
                    color={Colors[colorScheme ?? 'light'].tint}
                    style={{ marginLeft: 20, opacity: pressed ? 0.5 : 1 }}
                  />
                )}
              </Pressable>
            </Link>
          ),
        }}
      />
      <Tabs.Screen
        name='relatorio'
        options={{
          title: 'Relatório',
          tabBarIcon: ({ color }) => <TabBarIcon name="area-chart" color={color} />,
        }}
      />
      <Tabs.Screen
        name="historico"
        options={{
          title: 'Histórico',
          tabBarIcon: ({ color }) => <TabBarIcon name="clock-o" color={color} />,
        }}
      />
      <Tabs.Screen
        name="produtos"
        options={{
          title: 'Produtos',
          tabBarIcon: ({ color }) => <TabBarIcon name="book" color={color} />,
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Link href="/modais/produtoModal" asChild>
                <Pressable>
                  {({ pressed }) => (
                    <FontAwesome
                      name="plus-circle"
                      size={30}
                      color={Colors[colorScheme ?? 'light'].tint}
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
          title: 'Configurações',
          tabBarIcon: ({ color }) => <TabBarIcon name="cog" color={color} />,
        }}
      />
    </Tabs>
  );
}
