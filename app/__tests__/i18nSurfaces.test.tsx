import React from 'react';
import { act, create } from 'react-test-renderer';

const mockInitializeI18n = jest.fn(() => Promise.resolve('en'));
const mockI18n = { language: 'en' };
const mockT = jest.fn((key: string) => key);
const mockUseAuth = jest.fn();

jest.mock('@/i18n', () => ({
  i18n: mockI18n,
  initializeI18n: mockInitializeI18n,
}));

jest.mock('react-i18next', () => ({
  I18nextProvider: ({ children, i18n }: { children: unknown; i18n: unknown }) => {
    const { createElement } = require('react');
    return createElement('i18next-provider', { i18n }, children);
  },
  useTranslation: () => ({ t: mockT }),
}));

jest.mock('expo-font', () => ({
  useFonts: () => [true, null],
}));

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(),
  hideAsync: jest.fn(),
}));

jest.mock('@react-navigation/native', () => ({
  DarkTheme: {},
  DefaultTheme: {},
  ThemeProvider: ({ children }: { children: unknown }) => children,
}));

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

jest.mock('react-native-reanimated', () => ({}));

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
  const Stack = ({ children }: { children: unknown }) => createElement('stack', null, children);
  Stack.Screen = (props: Record<string, unknown>) => createElement('stack-screen', props);

  const Tabs = ({ children }: { children: unknown }) => createElement('tabs', null, children);
  Tabs.Screen = (props: Record<string, unknown>) => createElement('tab-screen', props);

  return {
    Stack,
    Tabs,
    Link: ({ children }: { children: unknown }) => createElement('link', null, children),
    router: { push: jest.fn() },
    useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
    usePathname: () => '/(tabs)',
    useFocusEffect: jest.fn(),
  };
});

jest.mock('@/context/AuthContext', () => ({
  AuthProvider: ({ children }: { children: unknown }) => children,
  useAuth: mockUseAuth,
}));

jest.mock('@/context/AutoSyncContext', () => ({
  AutoSyncProvider: ({ children }: { children: unknown }) => children,
}));

jest.mock('@/context/CartContext', () => ({
  CartProvider: ({ children }: { children: unknown }) => children,
}));

jest.mock('@/components/AppLoadingScreen', () => () => {
  const { createElement } = require('react');
  return createElement('app-loading');
});
jest.mock('@/components/useColorScheme', () => ({ useColorScheme: () => 'light' }));
jest.mock('@/components/useClientOnlyValue', () => ({ useClientOnlyValue: (_web: unknown, native: unknown) => native }));
jest.mock('@/components/CustomTabBar', () => ({ CustomTabBar: () => null }));
jest.mock('@/components/SyncIndicator', () => () => null);

jest.mock('@/components/ui/Button', () => ({
  Button: ({ title, onPress }: { title: string; onPress: () => void }) => {
    const { createElement } = require('react');
    return createElement('button', { title, onPress });
  },
}));

jest.mock('@/context/CartContext', () => ({
  CartProvider: ({ children }: { children: unknown }) => children,
  useCart: () => ({ cart: [] }),
  useCartActions: () => ({ addToCart: jest.fn(), addIfNotInCart: jest.fn() }),
}));

describe('mobile i18n integration surfaces', () => {
  beforeEach(() => {
    mockT.mockClear();
    mockInitializeI18n.mockClear();
    mockInitializeI18n.mockImplementation(() => Promise.resolve('en'));
    mockUseAuth.mockReturnValue({ user: null, loading: false, login: jest.fn() });
  });

  it('bootstraps the shared i18n instance before rendering the navigation provider', async () => {
    const { default: RootLayout } = require('@/app/_layout');
    let renderer: ReturnType<typeof create>;

    await act(async () => {
      renderer = create(<RootLayout />);
      await Promise.resolve();
    });

    expect(mockInitializeI18n).toHaveBeenCalledTimes(1);
    expect(renderer!.root.findAll((node) => String(node.type) === 'i18next-provider')[0].props.i18n).toBe(mockI18n);
  });

  it('looks up translated login labels and keeps email/password inputs technical', () => {
    const { default: LoginScreen } = require('@/app/login');
    const renderer = create(<LoginScreen />);
    const inputs = renderer.root.findAll((node) => String(node.type) === 'TextInput');

    expect(inputs.map((input) => input.props.placeholder)).toEqual([
      'auth.emailPlaceholder',
      'auth.passwordPlaceholder',
    ]);
    expect(mockT).toHaveBeenCalledWith('auth.email');
    expect(mockT).toHaveBeenCalledWith('auth.password');
    expect(mockT).toHaveBeenCalledWith('auth.login');
    expect(inputs.every((input) => input.props.style)).toBe(true);
  });

  it('translates tab titles without changing customer/staff route visibility', () => {
    const { default: TabLayout } = require('@/app/(tabs)/_layout');

    mockUseAuth.mockReturnValue({ user: { role: 'CUSTOMER' } });
    let renderer = create(<TabLayout />);
    let screens = renderer.root.findAll((node) => String(node.type) === 'tab-screen');

    expect(screens.map((screen) => screen.props.name)).toEqual([
      'index',
      'pedidos',
      'historico',
      'produtos',
      'configs',
    ]);
    expect(screens.find((screen) => screen.props.name === 'historico')?.props.options.href).toBeNull();
    expect(screens.find((screen) => screen.props.name === 'produtos')?.props.options.href).toBeNull();
    expect(mockT).toHaveBeenCalledWith('navigation.menu');
    expect(mockT).toHaveBeenCalledWith('navigation.orders');

    mockT.mockClear();
    mockUseAuth.mockReturnValue({ user: { role: 'EMPLOYEE' } });
    renderer = create(<TabLayout />);
    screens = renderer.root.findAll((node) => String(node.type) === 'tab-screen');

    expect(screens.find((screen) => screen.props.name === 'historico')?.props.options.href).toBe('/historico');
    expect(screens.find((screen) => screen.props.name === 'produtos')?.props.options.href).toBe('/produtos');
    expect(mockT).toHaveBeenCalledWith('navigation.sell');
  });

  it('keeps the translated navigation tree gated when i18n bootstrap rejects', async () => {
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockInitializeI18n.mockRejectedValueOnce(new Error('resource bootstrap failed'));
    const { default: RootLayout } = require('@/app/_layout');
    let renderer: ReturnType<typeof create>;

    await act(async () => {
      renderer = create(<RootLayout />);
      await Promise.resolve();
    });

    expect(mockInitializeI18n).toHaveBeenCalledTimes(1);
    expect(renderer!.root.findAll((node) => String(node.type) === 'i18next-provider')).toHaveLength(1);
    expect(renderer!.root.findAll((node) => String(node.type) === 'app-loading')).toHaveLength(1);
    expect(renderer!.root.findAll((node) => String(node.type) === 'stack')).toHaveLength(0);

    warning.mockRestore();
  });
});
