import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { SQLiteProvider } from 'expo-sqlite';  // Importar o SQLiteProvider
import { initializeDatabase } from '@/database/initializeDatabase';  // Importe sua função de inicialização
import { CartProvider } from '@/context/CartContext';
import { AuthProvider } from '@/context/AuthContext';
import { useAuth } from '@/context/AuthContext';
import { AutoSyncProvider } from '@/context/AutoSyncContext';
import SyncIndicator from '@/components/SyncIndicator';
import { useRouter } from 'expo-router';

import { useColorScheme } from '@/components/useColorScheme';
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

  if (!loaded) {
    return null;
  }

  return (
    <SQLiteProvider databaseName="database.db" onInit={initializeDatabase}>
      <AuthProvider>
        <AutoSyncProvider>
          <CartProvider>
            <RootLayoutNav />
          </CartProvider>
        </AutoSyncProvider>
      </AuthProvider>
    </SQLiteProvider>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { user, loading } = useAuth();
  const router = useRouter();
  // Redirect to login or main tabs depending on auth
  // Use replace so user can't go back to the wrong screen
  useEffect(() => {
    if (loading) return;
    const pathname = (router as any).pathname as string | undefined;
    if (!user && pathname !== '/login') {
      (router as any).replace('/login');
    } else if (user && pathname === '/login') {
      (router as any).replace('/(tabs)');
    }
  }, [loading, user, router]);

  // While auth is rehydrating, don't render navigation (prevents flicker)
  if (loading) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar 
        style={colorScheme === 'dark' ? 'light' : 'dark'} 
        backgroundColor={colorScheme === 'dark' ? '#000' : '#fff'} 
        translucent={true}
      />
      <Stack screenOptions={{ headerRight: () => <SyncIndicator /> }}>
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
