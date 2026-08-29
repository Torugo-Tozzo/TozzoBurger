import React from 'react';
import { act, create } from 'react-test-renderer';
import { Alert } from 'react-native';
import { I18nextProvider } from 'react-i18next';

import BluetoothScreen from '@/app/(tabs)/configs';
import {
  LOCALE_PREFERENCE_KEY,
  SUPPORTED_LOCALES,
  i18n,
} from '@/i18n';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async (_key: string, _value: string) => undefined),
  },
}));

const mockSetItem = jest.requireMock('@react-native-async-storage/async-storage').default.setItem as jest.Mock;

jest.mock('@/database/usePrinterDatabase', () => ({
  usePrinterDatabase: () => ({
    setPrinter: jest.fn(async () => undefined),
    getPrinter: jest.fn(async () => null),
    removePrinter: jest.fn(async () => undefined),
  }),
}));

jest.mock('@/useBLE', () => ({
  listNearbyDevices: jest.fn(async () => []),
  connectToDevice: jest.fn(async () => null),
  disconnectFromDevice: jest.fn(async () => true),
}));

jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    login: jest.fn(async () => true),
    logout: jest.fn(async () => undefined),
  }),
}));

jest.mock('@/hooks/useSyncRefresh', () => ({
  useSyncRefresh: () => ({
    refreshing: false,
    onRefresh: jest.fn(),
  }),
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.0.0' } },
}));

jest.mock('@expo/vector-icons/FontAwesome', () => {
  const FontAwesome = () => null;
  FontAwesome.font = {};
  return { __esModule: true, default: FontAwesome };
});

jest.mock('@react-native-picker/picker', () => {
  const React = require('react') as typeof import('react');
  const Picker = ((props: any) => React.createElement(
    'Picker',
    props,
    props.children as React.ReactNode,
  )) as any;
  Picker.Item = (props: any) => React.createElement('PickerItem', props);
  return { Picker };
});

describe('Settings language selector', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  });

  it('offers exactly the six supported locales', () => {
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <I18nextProvider i18n={i18n}>
          <BluetoothScreen />
        </I18nextProvider>,
      );
    });

    const items = renderer!.root.findAll(
      (node) => (node.type as string) === 'PickerItem' && (SUPPORTED_LOCALES as readonly string[]).includes(node.props.value),
    );
    expect(items.map((item) => item.props.value)).toEqual([...SUPPORTED_LOCALES]);
  });

  it('does not show a restart warning when changing locale', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <I18nextProvider i18n={i18n}>
          <BluetoothScreen />
        </I18nextProvider>,
      );
    });
    const picker = renderer!.root.find(
      (node) =>
        (node.type as string) === 'Picker' &&
        (SUPPORTED_LOCALES as readonly string[]).includes(node.props.selectedValue),
    );

    await act(async () => {
      await picker.props.onValueChange('pt-BR');
    });

    expect(mockSetItem).toHaveBeenCalledWith(LOCALE_PREFERENCE_KEY, 'pt-BR');
    expect(alert).not.toHaveBeenCalled();
    alert.mockRestore();
  });

  it('offers exactly the five printer paper widths', () => {
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <I18nextProvider i18n={i18n}>
          <BluetoothScreen />
        </I18nextProvider>,
      );
    });

    const items = renderer!.root.findAll(
      (node) => (node.type as string) === 'PickerItem' && ['44mm', '58mm', '76mm', '80mm', '110mm'].includes(node.props.value),
    );
    expect(items.map((item) => item.props.value)).toEqual(['44mm', '58mm', '76mm', '80mm', '110mm']);
  });
});
