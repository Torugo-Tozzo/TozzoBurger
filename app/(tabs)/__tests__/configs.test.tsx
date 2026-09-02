import React from 'react';
import { act, create } from 'react-test-renderer';
import { I18nextProvider } from 'react-i18next';

import ConfigsScreen from '@/app/(tabs)/configs';
import { Text as ThemedText } from '@/components/Themed';
import * as api from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { i18n } from '@/i18n';
import { getReportCountThisMonth } from '@/services/reportQuota';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async (_key: string, _value: string) => undefined),
  },
}));

jest.mock('@/services/api', () => ({
  __esModule: true,
  getEstablishment: jest.fn(),
}));

jest.mock('@/context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

jest.mock('@/database/usePrintLogDatabase', () => ({
  usePrintLogDatabase: jest.fn(() => ({
    countPrintsToday: jest.fn(async () => 0),
  })),
}));

jest.mock('@/services/reportQuota', () => ({
  getReportCountThisMonth: jest.fn(async () => 0),
}));

jest.mock('@/services/printerPreferences', () => ({
  getPrinterWidth: jest.fn(async () => '80mm'),
  setPrinterWidth: jest.fn(async (value: string) => value),
}));

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

jest.mock('expo-web-browser', () => ({
  __esModule: true,
  openBrowserAsync: jest.fn(async () => undefined),
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

const mockGetEstablishment = api.getEstablishment as jest.MockedFunction<typeof api.getEstablishment>;
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const mockGetReportCount = getReportCountThisMonth as jest.MockedFunction<typeof getReportCountThisMonth>;

function renderedText(renderer: ReturnType<typeof create>): string {
  return renderer.root
    .findAllByType(ThemedText)
    .map((node) => {
      const children = node.props.children;
      return Array.isArray(children) ? children.join(' ') : String(children ?? '');
    })
    .join('\n');
}

async function renderScreen(): Promise<ReturnType<typeof create>> {
  let renderer!: ReturnType<typeof create>;
  await act(async () => {
    renderer = create(
      <I18nextProvider i18n={i18n}>
        <ConfigsScreen />
      </I18nextProvider>,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return renderer;
}

describe('Settings plan section', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await act(async () => {
      await i18n.changeLanguage('en');
    });
    mockUseAuth.mockReturnValue({
      user: { id: 'user-1', establishmentId: 'estab-1', role: 'DONO' } as any,
      token: 'token-1',
      loading: false,
      login: jest.fn(async () => true),
      logout: jest.fn(async () => undefined),
    } as ReturnType<typeof useAuth>);
  });

  it('mostra o tier e os contadores de uso pro plano FREE', async () => {
    mockGetEstablishment.mockResolvedValue({ id: 'estab-1', plan: 'FREE', _count: { devices: 2 } } as any);
    const { usePrintLogDatabase } = jest.requireMock('@/database/usePrintLogDatabase') as {
      usePrintLogDatabase: jest.Mock;
    };
    usePrintLogDatabase.mockReturnValue({ countPrintsToday: jest.fn(async () => 5) });
    mockGetReportCount.mockResolvedValue(1);

    const renderer = await renderScreen();
    const text = renderedText(renderer);

    expect(text).toMatch(/Free/i);
    expect(text).toMatch(/5.*30/);
    expect(text).toMatch(/1.*5/);
    expect(text).toMatch(/2/);
  });

  it('mostra ilimitado para o plano pago', async () => {
    mockGetEstablishment.mockResolvedValue({ id: 'estab-1', plan: 'PAGO', _count: { devices: 4 } } as any);
    const { usePrintLogDatabase } = jest.requireMock('@/database/usePrintLogDatabase') as {
      usePrintLogDatabase: jest.Mock;
    };
    usePrintLogDatabase.mockReturnValue({ countPrintsToday: jest.fn(async () => 99) });
    mockGetReportCount.mockResolvedValue(99);

    const renderer = await renderScreen();
    const text = renderedText(renderer);

    expect(text).toMatch(/unlimited/i);
    expect(text).not.toMatch(/99.*30/);
  });
});
