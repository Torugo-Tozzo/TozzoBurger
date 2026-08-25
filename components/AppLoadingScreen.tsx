import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useColorScheme } from '@/components/useColorScheme';
import { useTranslation } from 'react-i18next';

export type AppLoadingStage = 'initializing' | 'authenticating' | 'preparing';

const APP_LOADING_MESSAGES: Record<AppLoadingStage, string> = {
  initializing: 'Preparing the app…',
  authenticating: 'Checking your session…',
  preparing: 'Preparing your data…',
};

const APP_LOADING_KEYS: Record<AppLoadingStage, string> = {
  initializing: 'common.initializing',
  authenticating: 'common.authenticating',
  preparing: 'common.preparing',
};

export function getAppLoadingMessage(stage: AppLoadingStage): string {
  return APP_LOADING_MESSAGES[stage];
}

type AppLoadingScreenProps = { stage?: AppLoadingStage };

export default function AppLoadingScreen({ stage = 'initializing' }: AppLoadingScreenProps) {
  const isDark = useColorScheme() === 'dark';
  const { t } = useTranslation();
  const message = t(APP_LOADING_KEYS[stage], { defaultValue: getAppLoadingMessage(stage) });
  return (
    <View accessibilityLabel={message} accessibilityRole="progressbar" style={[styles.container, { backgroundColor: isDark ? '#000' : '#fff' }]}>
      <ActivityIndicator size="large" color={isDark ? '#fff' : '#000'} />
      <Text style={[styles.message, { color: isDark ? '#fff' : '#000' }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  message: { marginTop: 16, fontSize: 16, fontWeight: '600', textAlign: 'center' },
});
