import React from 'react';
import { create } from 'react-test-renderer';
import { I18nextProvider } from 'react-i18next';

import AdicionalModalScreen from '@/app/modais/adicionalModal';
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

jest.mock('@/database/useProductDatabase', () => ({
  useProductDatabase: () => ({ create: jest.fn(async () => ({ id: 'add-on-1' })) }),
}));

jest.mock('@/context/CartContext', () => ({
  useCart: () => ({ addToCart: jest.fn() }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
}));

describe('modal i18n surfaces', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('renders translated add-on title and input placeholders from real resources', () => {
    const renderer = create(
      <I18nextProvider i18n={i18n}>
        <AdicionalModalScreen />
      </I18nextProvider>,
    );

    const inputs = renderer.root.findAll((node) => String(node.type) === 'TextInput');
    expect(inputs.map((input) => input.props.placeholder)).toEqual([
      'Enter the name…',
      'Enter the price…',
    ]);
    expect(renderer.root.findAll((node) => String(node.type) === 'Text').some((node) => node.children.includes('Add-on product'))).toBe(true);
  });
});
