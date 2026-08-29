import React from 'react';
import { act, create } from 'react-test-renderer';
import { View } from 'react-native';

import OnboardingScreen from '@/app/onboarding';
import CategoryOnboardingGate from '@/components/CategoryOnboardingGate';
import {
  createProductType,
  getEstablishment,
  updateEstablishmentCategory,
} from '@/services/api';
import { runWithLock } from '@/database/syncGuard';
import { synchronizeWithServer } from '@/database/watermelon/sync';

const mockUseAuth = jest.fn();
const mockRouterReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockRouterReplace }),
}));

jest.mock('@/context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/services/api', () => ({
  createProductType: jest.fn(),
  getEstablishment: jest.fn(),
  updateEstablishmentCategory: jest.fn(),
}));

jest.mock('@/database/syncGuard', () => ({
  runWithLock: jest.fn(),
}));

jest.mock('@/database/watermelon/sync', () => ({
  synchronizeWithServer: jest.fn(),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

const mockCreateProductType = createProductType as jest.MockedFunction<typeof createProductType>;
const mockGetEstablishment = getEstablishment as jest.MockedFunction<typeof getEstablishment>;
const mockUpdateEstablishmentCategory = updateEstablishmentCategory as jest.MockedFunction<typeof updateEstablishmentCategory>;
const mockRunWithLock = runWithLock as jest.MockedFunction<typeof runWithLock>;
const mockSynchronizeWithServer = synchronizeWithServer as jest.MockedFunction<typeof synchronizeWithServer>;

function findByAccessibilityLabel(renderer: ReturnType<typeof create>, label: string) {
  return renderer.root.find((node) => node.props.accessibilityLabel === label);
}

function flushPromises() {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

describe('category onboarding screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      token: 'token-123',
      user: { role: 'OWNER', establishmentId: 'establishment-1' },
    });
    mockUpdateEstablishmentCategory.mockResolvedValue({ id: 'establishment-1', category: 'HAMBURGUERIA' });
    mockCreateProductType.mockResolvedValue({ id: 'type-1' });
    mockGetEstablishment.mockResolvedValue({ id: 'establishment-1', category: null });
    mockSynchronizeWithServer.mockResolvedValue(undefined);
    mockRunWithLock.mockImplementation(async (callback) => callback());
  });

  it('uses the edited list when confirming a category', async () => {
    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <OnboardingScreen token="token-123" establishmentId="establishment-1" />,
      );
      await flushPromises();
    });

    await act(async () => {
      findByAccessibilityLabel(renderer!, 'HAMBURGUERIA').props.onPress();
    });

    const input = findByAccessibilityLabel(renderer!, 'onboarding.typeInput');
    await act(async () => {
      input.props.onChangeText('Combos');
    });
    await act(async () => {
      findByAccessibilityLabel(renderer!, 'onboarding.addType').props.onPress();
    });
    await act(async () => {
      findByAccessibilityLabel(renderer!, 'onboarding.removeType:Lanches').props.onPress();
    });

    await act(async () => {
      findByAccessibilityLabel(renderer!, 'onboarding.confirm').props.onPress();
      await flushPromises();
    });

    expect(mockUpdateEstablishmentCategory).toHaveBeenCalledWith(
      'token-123',
      'establishment-1',
      'HAMBURGUERIA',
    );
    expect(mockCreateProductType.mock.calls).toEqual([
      ['token-123', { description: 'Bebidas', color: '#9E9E9E' }],
      ['token-123', { description: 'Porções', color: '#9E9E9E' }],
      ['token-123', { description: 'Sobremesas', color: '#9E9E9E' }],
      ['token-123', { description: 'Combos', color: '#9E9E9E' }],
    ]);
    expect(mockCreateProductType).not.toHaveBeenCalledWith(
      'token-123',
      { description: 'Lanches', color: '#9E9E9E' },
    );
    expect(mockRunWithLock).toHaveBeenCalledTimes(1);
    expect(mockSynchronizeWithServer).toHaveBeenCalledWith('token-123', 'establishment-1');
  });

  it('redirects a MANAGER opening onboarding directly without rendering or mutating', async () => {
    mockUseAuth.mockReturnValue({
      token: 'token-123',
      user: { role: 'MANAGER', establishmentId: 'establishment-1' },
    });
    let renderer: ReturnType<typeof create>;

    await act(async () => {
      renderer = create(<OnboardingScreen />);
      await flushPromises();
    });

    expect(mockRouterReplace).toHaveBeenCalledWith('/(tabs)');
    expect(renderer!.root.findAll((node) => node.props.accessibilityLabel === 'HAMBURGUERIA')).toHaveLength(0);
    expect(mockGetEstablishment).not.toHaveBeenCalled();
    expect(mockUpdateEstablishmentCategory).not.toHaveBeenCalled();
    expect(mockCreateProductType).not.toHaveBeenCalled();
  });

  it('redirects an OWNER opening onboarding directly when the category is already configured', async () => {
    mockGetEstablishment.mockResolvedValue({ id: 'establishment-1', category: 'PIZZARIA' });
    let renderer: ReturnType<typeof create>;

    await act(async () => {
      renderer = create(<OnboardingScreen />);
      await flushPromises();
    });

    expect(mockGetEstablishment).toHaveBeenCalledWith('token-123');
    expect(mockRouterReplace).toHaveBeenCalledWith('/(tabs)');
    expect(renderer!.root.findAll((node) => node.props.accessibilityLabel === 'HAMBURGUERIA')).toHaveLength(0);
    expect(mockUpdateEstablishmentCategory).not.toHaveBeenCalled();
    expect(mockCreateProductType).not.toHaveBeenCalled();
  });
});

describe('category onboarding gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      token: 'token-123',
      user: { role: 'OWNER', establishmentId: 'establishment-1' },
    });
  });

  it('shows onboarding for an OWNER only when the server category is null', async () => {
    mockGetEstablishment.mockResolvedValue({ id: 'establishment-1', category: null });
    let renderer: ReturnType<typeof create>;

    await act(async () => {
      renderer = create(
        <CategoryOnboardingGate>
          <View accessibilityLabel="app-content" />
        </CategoryOnboardingGate>,
      );
      await flushPromises();
    });

    expect(mockGetEstablishment).toHaveBeenCalledWith('token-123');
    expect(findByAccessibilityLabel(renderer!, 'HAMBURGUERIA')).toBeDefined();
    expect(renderer!.root.findAll((node) => node.props.accessibilityLabel === 'app-content')).toHaveLength(0);
  });

  it('removes onboarding after a successful confirmation without refetching the gate', async () => {
    mockGetEstablishment.mockResolvedValue({ id: 'establishment-1', category: null });
    mockUpdateEstablishmentCategory.mockResolvedValue({ id: 'establishment-1', category: 'HAMBURGUERIA' });
    mockCreateProductType.mockResolvedValue({ id: 'type-1' });
    mockSynchronizeWithServer.mockResolvedValue(undefined);
    mockRunWithLock.mockImplementation(async (callback) => callback());

    let renderer: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        <CategoryOnboardingGate>
          <View accessibilityLabel="app-content" />
        </CategoryOnboardingGate>,
      );
      await flushPromises();
    });

    await act(async () => {
      findByAccessibilityLabel(renderer!, 'HAMBURGUERIA').props.onPress();
    });
    await act(async () => {
      findByAccessibilityLabel(renderer!, 'onboarding.confirm').props.onPress();
      await flushPromises();
    });

    expect(mockGetEstablishment).toHaveBeenCalledTimes(1);
    expect(renderer!.root.find((node) => node.props.accessibilityLabel === 'app-content')).toBeDefined();
    expect(renderer!.root.findAll((node) => node.props.accessibilityLabel === 'HAMBURGUERIA')).toHaveLength(0);
  });

  it('keeps the app available and skips the request for non-OWNER users', async () => {
    mockUseAuth.mockReturnValue({
      token: 'token-123',
      user: { role: 'MANAGER', establishmentId: 'establishment-1' },
    });

    const renderer = create(
      <CategoryOnboardingGate>
        <View accessibilityLabel="app-content" />
      </CategoryOnboardingGate>,
    );
    await act(async () => {
      await flushPromises();
    });

    expect(mockGetEstablishment).not.toHaveBeenCalled();
    expect(renderer.root.find((node) => node.props.accessibilityLabel === 'app-content')).toBeDefined();
    expect(renderer.root.findAll((node) => node.props.accessibilityLabel === 'HAMBURGUERIA')).toHaveLength(0);
  });

  it('does not show onboarding again when the category is already configured', async () => {
    mockGetEstablishment.mockResolvedValue({ id: 'establishment-1', category: 'PIZZARIA' });
    let renderer: ReturnType<typeof create>;

    await act(async () => {
      renderer = create(
        <CategoryOnboardingGate>
          <View accessibilityLabel="app-content" />
        </CategoryOnboardingGate>,
      );
      await flushPromises();
    });

    expect(renderer!.root.find((node) => node.props.accessibilityLabel === 'app-content')).toBeDefined();
    expect(renderer!.root.findAll((node) => node.props.accessibilityLabel === 'HAMBURGUERIA')).toHaveLength(0);
  });
});
