import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';

import { I18N_NAMESPACES, resources } from './resources';

export const SUPPORTED_LOCALES = ['en', 'pt-BR', 'es', 'fr', 'zh', 'hi'] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const LOCALE_PREFERENCE_KEY = '@tozzoburger/locale';

function recognizeLocale(input: unknown): AppLocale | undefined {
  if (typeof input !== 'string') return undefined;

  const locale = input.trim().replace(/_/g, '-').toLowerCase();
  if (locale === 'en' || locale.startsWith('en-')) return 'en';
  if (locale === 'pt' || locale.startsWith('pt-')) return 'pt-BR';
  if (locale === 'es' || locale.startsWith('es-')) return 'es';
  if (locale === 'fr' || locale.startsWith('fr-')) return 'fr';
  if (locale === 'zh' || locale.startsWith('zh-')) return 'zh';
  if (locale === 'hi' || locale.startsWith('hi-')) return 'hi';
  return undefined;
}

export function normalizeLocale(input: unknown): AppLocale {
  return recognizeLocale(input) ?? 'en';
}

export const i18n = createInstance();
const i18nReady = i18n.init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  supportedLngs: [...SUPPORTED_LOCALES],
  load: 'currentOnly',
  nonExplicitSupportedLngs: false,
  ns: [...I18N_NAMESPACES],
  defaultNS: 'common',
  fallbackNS: 'common',
  // The app keeps each namespace in its own local resource file and uses
  // namespace.key IDs at call sites. Keep that contract explicit instead of
  // relying on i18next's default ':' separator.
  nsSeparator: '.',
  keySeparator: false,
  interpolation: { escapeValue: false },
});

function enforceClosedSupportedLocales(): void {
  // i18next adds its internal "cimode" to both the public option and the
  // language utility used by runtime supported-language checks.
  const supportedLocales = [...SUPPORTED_LOCALES];
  i18n.options.supportedLngs = [...supportedLocales];
  i18n.services.languageUtils.supportedLngs = supportedLocales;
}

enforceClosedSupportedLocales();

function getDeviceLocale(): AppLocale {
  try {
    return normalizeLocale(getLocales()[0]?.languageTag);
  } catch {
    return 'en';
  }
}

export async function initializeI18n(): Promise<AppLocale> {
  await i18nReady;

  let locale = getDeviceLocale();
  try {
    const persisted = recognizeLocale(await AsyncStorage.getItem(LOCALE_PREFERENCE_KEY));
    if (persisted) locale = persisted;
  } catch {
    // A storage failure should not prevent the app from starting offline.
  }

  await i18n.changeLanguage(locale);
  return locale;
}

export async function setLocale(input: unknown): Promise<AppLocale> {
  const locale = normalizeLocale(input);
  await i18nReady;
  await i18n.changeLanguage(locale);
  await AsyncStorage.setItem(LOCALE_PREFERENCE_KEY, locale);
  return locale;
}

export { I18N_NAMESPACES, resources };
