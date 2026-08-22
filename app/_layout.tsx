import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { Suspense, useEffect } from 'react';
import 'react-native-reanimated';
import { SQLiteProvider } from 'expo-sqlite';  // Importar o SQLiteProvider
import { initializeDatabase } from '@/database/initializeDatabase';  // Importe sua função de inicialização
import { CartProvider } from '@/context/CartContext';
import { AuthProvider } from '@/context/AuthContext';
import { useAuth } from '@/context/AuthContext';
import { AutoSyncProvider } from '@/context/AutoSyncContext';
import { useRouter, usePathname } from 'expo-router';

import { useColorScheme } from '@/components/useColorScheme';
import AppLoadingScreen from '@/components/AppLoadingScreen';
import { StatusBar } from 'expo-status-bar';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) return <AppLoadingScreen stage="initializing" />;

  return (
    <Suspense fallback={<AppLoadingScreen stage="initializing" />}>
      <SQLiteProvider databaseName="database.db" onInit={initializeDatabase} useSuspense>
        <AuthProvider>
          <AutoSyncProvider>
            <CartProvider>
              <RootLayoutNav />
            </CartProvider>
          </AutoSyncProvider>
        </AuthProvider>
      </SQLiteProvider>
    </Suspense>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // Redirect to login or main tabs depending on auth
  // Use replace so user can't go back to the wrong screen
  useEffect(() => {
    if (loading) return;
    if (!user && pathname !== '/login') {
      (router as any).replace('/login');
      return;
    }

    if (user && pathname === '/login') {
      (router as any).replace('/(tabs)');
    }
  }, [loading, user, router, pathname]);

  if (loading) return <AppLoadingScreen stage={user ? 'preparing' : 'authenticating'} />;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar 
        style={colorScheme === 'dark' ? 'light' : 'dark'} 
        backgroundColor={colorScheme === 'dark' ? '#000' : '#fff'} 
        translucent={true}
      />
      <Stack>
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modais/contaModal" options={{ presentation: 'modal', title: 'Conta' }} />
        <Stack.Screen name="modais/produtoModal" options={{ presentation: 'modal', title: 'Produto' }} />
        <Stack.Screen name="modais/contaHistoricoModal" options={{ presentation: 'modal', title: 'Conta Fechada' }} />
        <Stack.Screen name="modais/adicionalModal" options={{ presentation: 'modal', title: 'Adicional' }} />
        <Stack.Screen name="modais/relatorioModal" options={{ presentation: 'modal', title: 'Relatório' }} />
      </Stack>
    </ThemeProvider>
  );
}
