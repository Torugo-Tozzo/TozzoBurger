import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';

import {
  LOCALE_PREFERENCE_KEY,
  I18N_NAMESPACES,
  SUPPORTED_LOCALES,
  getLocaleDirection,
  i18n,
  initializeI18n,
  normalizeLocale,
  resources,
  setLocale,
} from '@/i18n';

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
  },
}));

const getLocales = Localization.getLocales as jest.Mock;
const getItem = AsyncStorage.getItem as jest.Mock;
const setItem = AsyncStorage.setItem as jest.Mock;

describe('mobile i18n foundation', () => {
  beforeEach(() => {
    getLocales.mockReset();
    getItem.mockReset();
    setItem.mockReset();
    getLocales.mockReturnValue([{ languageTag: 'en-US' }]);
    getItem.mockResolvedValue(null);
    setItem.mockResolvedValue(undefined);
  });

  it('exposes exactly the supported locales and normalizes locale families', () => {
    expect(SUPPORTED_LOCALES).toEqual(['en', 'pt-BR', 'es', 'fr', 'zh', 'hi', 'ar']);
    expect(normalizeLocale('en-GB')).toBe('en');
    expect(normalizeLocale('pt-PT')).toBe('pt-BR');
    expect(normalizeLocale('es-MX')).toBe('es');
    expect(normalizeLocale('fr-CA')).toBe('fr');
    expect(normalizeLocale('zh-Hans-CN')).toBe('zh');
    expect(normalizeLocale('hi-IN')).toBe('hi');
    expect(normalizeLocale('ar-SA')).toBe('ar');
    expect(normalizeLocale('xx-YY')).toBe('en');
    expect(normalizeLocale(undefined)).toBe('en');
  });

  it('uses the device locale when there is no persisted preference', async () => {
    getLocales.mockReturnValue([{ languageTag: 'es-MX' }]);

    await expect(initializeI18n()).resolves.toBe('es');

    expect(i18n.language).toBe('es');
    expect(getItem).toHaveBeenCalledWith(LOCALE_PREFERENCE_KEY);
    expect(setItem).not.toHaveBeenCalled();
  });

  it('gives a valid persisted preference precedence over the device locale', async () => {
    getLocales.mockReturnValue([{ languageTag: 'hi-IN' }]);
    getItem.mockResolvedValue('fr');

    await expect(initializeI18n()).resolves.toBe('fr');

    expect(i18n.language).toBe('fr');
  });

  it('ignores an unknown persisted preference and keeps the normalized device locale', async () => {
    getLocales.mockReturnValue([{ languageTag: 'pt-BR' }]);
    getItem.mockResolvedValue('xx');

    await expect(initializeI18n()).resolves.toBe('pt-BR');

    expect(i18n.language).toBe('pt-BR');
  });

  it('normalizes, changes, and persists only the locale preference', async () => {
    await expect(setLocale('pt-PT')).resolves.toBe('pt-BR');

    expect(i18n.language).toBe('pt-BR');
    expect(setItem).toHaveBeenCalledTimes(1);
    expect(setItem).toHaveBeenCalledWith(LOCALE_PREFERENCE_KEY, 'pt-BR');
  });

  it('returns rtl only for Arabic', () => {
    expect(getLocaleDirection('ar')).toBe('rtl');
    expect(getLocaleDirection('ar-SA')).toBe('rtl');
    expect(getLocaleDirection('en')).toBe('ltr');
    expect(getLocaleDirection('pt-BR')).toBe('ltr');
    expect(getLocaleDirection('unknown')).toBe('ltr');
  });

  it('configures local resources with a closed fallback language set', () => {
    expect(i18n.options.fallbackLng).toEqual(['en']);
    expect(i18n.options.load).toBe('currentOnly');
    expect(i18n.options.supportedLngs).toEqual(SUPPORTED_LOCALES);
    expect(i18n.t('common.appName')).toBe('TozzoBurger');
  });

  it('keeps the runtime supported-language check closed to app locales', () => {
    expect(i18n.services.languageUtils.supportedLngs).toEqual(SUPPORTED_LOCALES);
    expect(i18n.services.languageUtils.isSupportedCode('en')).toBe(true);
    expect(i18n.services.languageUtils.isSupportedCode('cimode')).toBe(false);
    expect(i18n.services.languageUtils.isSupportedCode('de')).toBe(false);
  });

  it('exposes every supported locale with every required namespace locally', () => {
    expect(Object.keys(resources)).toEqual(SUPPORTED_LOCALES);
    for (const locale of SUPPORTED_LOCALES) {
      expect(Object.keys(resources[locale]).sort()).toEqual([...I18N_NAMESPACES].sort());
    }
  });

  it('normalizes an unsupported setter input to English before persisting', async () => {
    await expect(setLocale('de-DE')).resolves.toBe('en');

    expect(i18n.language).toBe('en');
    expect(setItem).toHaveBeenCalledWith(LOCALE_PREFERENCE_KEY, 'en');
  });
});
