import React from 'react';
import { act, create } from 'react-test-renderer';
import { Alert } from 'react-native';
import { I18nextProvider } from 'react-i18next';

import { FiltroTipos } from '@/components/FiltroTipos';
import PedidoItem from '@/components/PedidoItem';
import SyncIndicator from '@/components/SyncIndicator';
import { formatarVendaParaImpressao } from '@/hooks/formatarVendaImpressao';
import { connectToDevice, sendMessageToDevice } from '@/useBLE';
import { i18n } from '@/i18n';
import { ProductTypeId } from '@/constants/productTypeIds';

const mockUseAutoSync = jest.fn();

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

jest.mock('react-native-ble-plx', () => {
  const manager = {
    connectToDevice: jest.fn(),
    startDeviceScan: jest.fn(),
    stopDeviceScan: jest.fn(),
    cancelDeviceConnection: jest.fn(),
  };

  return {
    __esModule: true,
    BleManager: jest.fn().mockImplementation(() => manager),
    __mockManager: manager,
  };
});

jest.mock('@/context/AutoSyncContext', () => ({
  useAutoSync: () => mockUseAutoSync(),
}));

jest.mock('@expo/vector-icons/FontAwesome', () => {
  const FontAwesome = () => null;
  FontAwesome.font = {};
  return { __esModule: true, default: FontAwesome };
});

const mockBleManager = jest.requireMock('react-native-ble-plx').__mockManager as {
  connectToDevice: jest.Mock;
  cancelDeviceConnection: jest.Mock;
};

const reactNative = require('react-native') as { useColorScheme?: () => 'light' };
Object.defineProperty(reactNative, 'useColorScheme', {
  configurable: true,
  value: jest.fn(() => 'light'),
});

function renderedText(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(renderedText).join('');
  if (value && typeof value === 'object' && 'children' in value) {
    return renderedText((value as { children?: unknown }).children);
  }
  return '';
}

describe('Task 7C presentation i18n', () => {
  let mountedRenderer: ReturnType<typeof create> | undefined;

  afterEach(() => {
    mountedRenderer?.unmount();
    mountedRenderer = undefined;
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  });

  it('translates standard catalog IDs while leaving custom descriptions untouched', () => {
    const renderer = create(
      <I18nextProvider i18n={i18n}>
        <FiltroTipos
          data={[
            { id: ProductTypeId.BURGER, description: 'Hambúrguer' },
            { id: 'custom-type-id', description: 'Custom family recipe' },
          ]}
          selectedId={null}
          onSelect={jest.fn()}
        />
      </I18nextProvider>,
    );

    const text = renderedText(renderer.toJSON());
    expect(text).toContain('Burger');
    expect(text).toContain('Custom family recipe');
    expect(text).not.toContain('Hambúrguer');
  });

  it('does not render an order status badge in order cards', async () => {
    await act(async () => {
      await i18n.changeLanguage('pt-BR');
    });

    const renderer = create(
      <I18nextProvider i18n={i18n}>
        <PedidoItem
          data={{
            id: 'order-1',
            total: 25,
            openedAt: '2026-08-25T15:04:05.000Z',
            customerName: null,
            isOpen: true,
            updated_at: 1,
          }}
          products={[]}
          onEdit={jest.fn()}
        />
      </I18nextProvider>,
    );

    expect(renderedText(renderer.toJSON())).not.toContain('Aberto');
  });

  it('localizes receipt labels and numbers without translating business content or printer controls', async () => {
    await act(async () => {
      await i18n.changeLanguage('pt-BR');
    });

    const receipt = await formatarVendaParaImpressao(
      {
        id: 'sale-1',
        total: 12.5,
        soldAt: '2026-08-25T15:04:05.000Z',
        customerName: 'Cliente Árvore',
        isCancelled: false,
        updated_at: 1,
      },
      [{ name: 'Pão Especial', quantity: 2, price: 12.5 }],
    );

    expect(receipt).toContain('Número da venda: #sale-1');
    expect(receipt).toContain('Cliente Árvore');
    expect(receipt).toContain('Pão Especial');
    expect(receipt).toContain('12,50');
    expect(receipt).toContain('Preço unitário');
    expect(receipt).toContain('( 2 x )');
    expect(receipt).toContain('\u001b!');
    expect(receipt).not.toContain('Numero da Venda');
  });

  it('shows a translated Alert when a BLE printer connection fails', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockBleManager.connectToDevice.mockRejectedValueOnce(new Error('radio unavailable'));

    await expect(connectToDevice('printer-1')).resolves.toBeNull();

    expect(alert).toHaveBeenCalledWith('Connection error', 'Could not connect to the printer.');
    alert.mockRestore();
  });

  it('shows translated offline feedback when manual sync fails', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockUseAutoSync.mockReturnValue({
      isSyncing: false,
      triggerSync: jest.fn().mockResolvedValue({ ok: false, message: 'Network request failed' }),
      lastSyncResult: { time: 1, ok: false, message: 'Network request failed' },
    });

    await act(async () => {
      mountedRenderer = create(
        <I18nextProvider i18n={i18n}>
          <SyncIndicator />
        </I18nextProvider>,
      );
      await Promise.resolve();
    });

    expect(alert).toHaveBeenCalledWith(
      'Synchronization failed',
      'No internet connection. Check your connection.',
    );
    alert.mockRestore();
  });

  it('does not report a successful print when printer disconnection fails', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const characteristic = {
      isWritableWithResponse: true,
      isWritableWithoutResponse: false,
      writeWithResponse: jest.fn().mockResolvedValue(undefined),
    };
    const device = {
      id: 'printer-1',
      discoverAllServicesAndCharacteristics: jest.fn().mockResolvedValue(undefined),
      services: jest.fn().mockResolvedValue([
        { characteristics: jest.fn().mockResolvedValue([characteristic]) },
      ]),
    };
    mockBleManager.connectToDevice.mockResolvedValueOnce(device);
    mockBleManager.cancelDeviceConnection.mockRejectedValueOnce(new Error('disconnect failed'));

    await expect(sendMessageToDevice('receipt', { uuid: 'printer-1' })).rejects.toThrow(
      'Could not disconnect from the printer.',
    );
    expect(alert).toHaveBeenCalledWith('Disconnection error', 'Could not disconnect from the printer.');
    alert.mockRestore();
  });
});
