import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { Suspense, useEffect } from 'react';
import { useState } from 'react';
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
import { I18nextProvider, useTranslation } from 'react-i18next';
import { i18n, initializeI18n } from '@/i18n';

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
  const [i18nInitialized, setI18nInitialized] = useState(false);

  useEffect(() => {
    let mounted = true;

    void initializeI18n()
      .then(() => {
        if (mounted) setI18nInitialized(true);
      })
      .catch((bootstrapError) => {
        console.warn('Failed to initialize local i18n resources', bootstrapError);
      });

    return () => {
      mounted = false;
    };
  }, []);

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  return (
    <I18nextProvider i18n={i18n}>
      {!loaded || !i18nInitialized ? (
        <AppLoadingScreen stage="initializing" />
      ) : (
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
      )}
    </I18nextProvider>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { user, loading } = useAuth();
  const { t } = useTranslation();
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
        <Stack.Screen name="modais/contaModal" options={{ presentation: 'modal', title: t('navigation.account') }} />
        <Stack.Screen name="modais/produtoModal" options={{ presentation: 'modal', title: t('navigation.product') }} />
        <Stack.Screen name="modais/pedidoModal" options={{ presentation: 'modal', title: t('navigation.orders') }} />
        <Stack.Screen name="modais/contaHistoricoModal" options={{ presentation: 'modal', title: t('navigation.closedAccount') }} />
        <Stack.Screen name="modais/adicionalModal" options={{ presentation: 'modal', title: t('navigation.addOn') }} />
        <Stack.Screen name="modais/relatorioModal" options={{ presentation: 'modal', title: t('navigation.report') }} />
      </Stack>
    </ThemeProvider>
  );
}
