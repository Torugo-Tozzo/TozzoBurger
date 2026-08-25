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

  it('offers exactly the seven supported locales', () => {
    const renderer = create(
      <I18nextProvider i18n={i18n}>
        <BluetoothScreen />
      </I18nextProvider>,
    );

    const items = renderer.root.findAll((node) => (node.type as string) === 'PickerItem');
    expect(items.map((item) => item.props.value)).toEqual([...SUPPORTED_LOCALES]);
  });

  it('persists Arabic and warns that the direction change waits for restart', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const renderer = create(
      <I18nextProvider i18n={i18n}>
        <BluetoothScreen />
      </I18nextProvider>,
    );
    const picker = renderer.root.find((node) => (node.type as string) === 'Picker');

    await act(async () => {
      await picker.props.onValueChange('ar');
    });

    expect(mockSetItem).toHaveBeenCalledWith(LOCALE_PREFERENCE_KEY, 'ar');
    expect(alert).toHaveBeenCalledWith(
      'Restart required',
      'Changing between left-to-right and right-to-left languages will take effect after the next app restart.',
    );
    alert.mockRestore();
  });
});
