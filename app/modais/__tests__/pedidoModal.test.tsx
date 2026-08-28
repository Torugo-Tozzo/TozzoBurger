import React from 'react';
import { act, create } from 'react-test-renderer';

import PedidoModal from '@/app/modais/pedidoModal';

const mockGetOrderById = jest.fn();
const mockUpdateOrder = jest.fn();
const mockRemoveOrder = jest.fn();
const mockShowAdd = jest.fn();
const mockSearchByName = jest.fn();
const mockCreateSaleFromOrder = jest.fn();
const mockTriggerSync = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ orderId: 'order-1' }),
  router: { back: jest.fn() },
}));

jest.mock('@/database/useOrderDatabase', () => ({
  useOrderDatabase: () => ({
    getOrderById: mockGetOrderById,
    updateOrder: mockUpdateOrder,
    removeOrder: mockRemoveOrder,
  }),
}));

jest.mock('@/database/useProductDatabase', () => ({
  useProductDatabase: () => ({
    showAdd: mockShowAdd,
    show: jest.fn(),
    searchByName: mockSearchByName,
  }),
}));

jest.mock('@/database/useSaleDatabase', () => ({
  useSaleDatabase: () => ({ createSaleFromOrder: mockCreateSaleFromOrder }),
}));

jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'seller-1', name: 'Caixa', role: 'EMPLOYEE' } }),
}));

jest.mock('@/context/AutoSyncContext', () => ({
  useAutoSync: () => ({ triggerSync: mockTriggerSync }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

jest.mock('@/components/Themed', () => ({ View: 'View', Text: 'Text' }));
jest.mock('@/components/ui/Badge', () => ({
  Badge: (props: Record<string, unknown>) => require('react').createElement('Badge', props),
}));
jest.mock('@/components/ui/Button', () => ({
  Button: (props: Record<string, unknown>) => require('react').createElement('Button', props),
}));
jest.mock('@/components/ui/ListItem', () => ({
  ListItem: (props: Record<string, unknown>) => {
    const { trailing, ...rest } = props;
    return require('react').createElement('ListItem', rest, trailing);
  },
}));
jest.mock('@expo/vector-icons/FontAwesome', () => 'FontAwesome');

function flushPromises() {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

describe('PedidoModal', () => {
  beforeEach(() => {
    mockGetOrderById.mockReset();
    mockUpdateOrder.mockReset();
    mockRemoveOrder.mockReset();
    mockShowAdd.mockReset();
    mockSearchByName.mockReset();
    mockCreateSaleFromOrder.mockReset();
    mockTriggerSync.mockReset();

    mockGetOrderById.mockResolvedValue({
      id: 'order-1',
      total: 10,
      customerName: 'Cliente',
      isOpen: true,
      items: [{
        id: 'order-item-1',
        productId: 'product-1',
        quantity: 1,
        status: 'REQUESTED',
      }],
    });
    mockShowAdd.mockResolvedValue({ id: 'product-1', name: 'X-Burger', price: 10 });
    mockSearchByName.mockResolvedValue([]);
    mockCreateSaleFromOrder.mockResolvedValue({ saleId: 'sale-1' });
    mockTriggerSync.mockResolvedValue(undefined);
  });

  it('persists the edited order before generating its sale', async () => {
    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(<PedidoModal />);
      await flushPromises();
      await flushPromises();
      await flushPromises();
    });

    const increaseQuantity = renderer!.root.find(
      (node) => node.props.accessibilityLabel === 'common.increaseQuantity',
    );
    await act(async () => {
      increaseQuantity.props.onPress();
    });

    const generateSaleButton = renderer!.root.find(
      (node) => String(node.type) === 'Button' && node.props.title === 'orders.generateSale',
    );
    await act(async () => {
      await generateSaleButton.props.onPress();
    });

    expect(mockUpdateOrder).toHaveBeenCalledWith(
      'order-1',
      [{ productId: 'product-1', quantity: 2, status: 'REQUESTED' }],
      'Cliente',
    );
    expect(mockCreateSaleFromOrder).toHaveBeenCalledWith(
      'order-1',
      'Cliente',
      'seller-1',
      'Caixa',
    );
    expect(mockUpdateOrder.mock.invocationCallOrder[0])
      .toBeLessThan(mockCreateSaleFromOrder.mock.invocationCallOrder[0]);
  });
});
