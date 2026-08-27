import React from 'react';
import { act, create } from 'react-test-renderer';
import { I18nextProvider } from 'react-i18next';

import PedidoItem from '@/components/PedidoItem';
import { i18n } from '@/i18n';

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

jest.mock('@expo/vector-icons/FontAwesome', () => {
  const FontAwesome = () => null;
  FontAwesome.font = {};
  return { __esModule: true, default: FontAwesome };
});

const renderedText = (value: unknown): string => {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(renderedText).join('');
  if (value && typeof value === 'object' && 'children' in value) {
    return renderedText((value as { children?: unknown }).children);
  }
  return '';
};

describe('shared order status translations', () => {
  it('translates machine statuses while leaving the order data untouched', async () => {
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
            customerName: 'Cliente persistido',
            isOpen: true,
            updated_at: 1,
          }}
          products={['Produto persistido']}
          onEdit={jest.fn()}
        />
      </I18nextProvider>,
    );

    const text = renderedText(renderer.toJSON());
    expect(text).toContain('Aberto');
    expect(text).toContain('Cliente persistido');
    expect(text).toContain('Produto persistido');
  });
});
