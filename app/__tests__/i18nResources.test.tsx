import React from 'react';
import { act, create } from 'react-test-renderer';
import { I18nextProvider } from 'react-i18next';
import { i18n, initializeI18n } from '@/i18n';
import LoginScreen from '@/app/login';
import TabLayout from '@/app/(tabs)/_layout';

const mockUseAuth = jest.fn();

jest.mock('expo-localization', () => ({
  getLocales: jest.fn(() => [{ languageTag: 'en-US' }]),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
  },
}));

jest.mock('@/components/useColorScheme', () => ({ useColorScheme: () => 'light' }));
jest.mock('@/context/AuthContext', () => ({ useAuth: () => mockUseAuth() }));
jest.mock('@/components/CustomTabBar', () => ({ CustomTabBar: () => null }));
jest.mock('@/components/SyncIndicator', () => () => null);
jest.mock('@/components/ui/Button', () => ({
  Button: ({ title, onPress }: { title: string; onPress: () => void }) => {
    const { createElement } = require('react');
    return createElement('button', { title, onPress });
  },
}));

jest.mock('@expo/vector-icons/FontAwesome', () => {
  const FontAwesome = () => null;
  FontAwesome.font = {};
  return { __esModule: true, default: FontAwesome };
});

jest.mock('@expo/vector-icons/MaterialIcons', () => {
  const MaterialIcons = () => null;
  return { __esModule: true, default: MaterialIcons };
});

jest.mock('expo-router', () => {
  const { createElement } = require('react');
  const Tabs = ({ children }: { children: unknown }) => createElement('tabs', null, children);
  Tabs.Screen = (props: Record<string, unknown>) => createElement('tab-screen', props);

  return {
    Tabs,
    Link: ({ children }: { children: unknown }) => createElement('link', null, children),
    useFocusEffect: jest.fn(),
  };
});

describe('7B translations against the real bundled resources', () => {
  beforeEach(async () => {
    mockUseAuth.mockReturnValue({ user: { role: 'CUSTOMER' } });
    await initializeI18n();
  });

  it.each([
    {
      locale: 'en',
      emailPlaceholder: 'you@example.com',
      passwordPlaceholder: 'Enter your password',
      menuTitle: 'Menu',
      salesTitle: 'Sales',
    },
    {
      locale: 'pt-BR',
      emailPlaceholder: 'voce@exemplo.com',
      passwordPlaceholder: 'Digite sua senha',
      menuTitle: 'Cardápio',
      salesTitle: 'Vendas',
    },
  ])('resolves auth, navigation, and sales lookups for $locale', async (fixture) => {
    await act(async () => {
      await i18n.changeLanguage(fixture.locale);
    });

    const renderer = create(
      <I18nextProvider i18n={i18n}>
        <>
          <LoginScreen />
          <TabLayout />
        </>
      </I18nextProvider>,
    );

    const inputs = renderer.root.findAll((node) => String(node.type) === 'TextInput');
    const menuScreen = renderer.root
      .findAll((node) => String(node.type) === 'tab-screen')
      .find((screen) => screen.props.name === 'index');

    expect(inputs.map((input) => input.props.placeholder)).toEqual([
      fixture.emailPlaceholder,
      fixture.passwordPlaceholder,
    ]);
    expect(menuScreen?.props.options.title).toBe(fixture.menuTitle);
    expect(i18n.t('sales.title')).toBe(fixture.salesTitle);
    expect([
      ...inputs.map((input) => input.props.placeholder),
      menuScreen?.props.options.title,
      i18n.t('sales.title'),
    ]).not.toContain(expect.stringMatching(/^(auth|navigation|sales)[.:]/));
  });
});
