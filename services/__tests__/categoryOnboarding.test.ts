import { completeCategoryOnboarding } from '@/services/categoryOnboarding';
import { createProductType, updateEstablishmentCategory } from '@/services/api';
import { runWithLock } from '@/database/syncGuard';
import { synchronizeWithServer } from '@/database/watermelon/sync';

jest.mock('@/services/api', () => ({
  createProductType: jest.fn(),
  updateEstablishmentCategory: jest.fn(),
}));

jest.mock('@/database/syncGuard', () => ({
  runWithLock: jest.fn(),
}));

jest.mock('@/database/watermelon/sync', () => ({
  synchronizeWithServer: jest.fn(),
}));

const mockCreateProductType = createProductType as jest.MockedFunction<typeof createProductType>;
const mockUpdateEstablishmentCategory = updateEstablishmentCategory as jest.MockedFunction<typeof updateEstablishmentCategory>;
const mockRunWithLock = runWithLock as jest.MockedFunction<typeof runWithLock>;
const mockSynchronizeWithServer = synchronizeWithServer as jest.MockedFunction<typeof synchronizeWithServer>;

describe('completeCategoryOnboarding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateEstablishmentCategory.mockResolvedValue({ id: 'establishment-1', category: 'HAMBURGUERIA' });
    mockCreateProductType.mockResolvedValue({ id: 'type-1' });
    mockSynchronizeWithServer.mockResolvedValue(undefined);
    mockRunWithLock.mockImplementation(async (callback) => callback());
  });

  it('updates the category, creates only the confirmed types, then syncs under the lock', async () => {
    await completeCategoryOnboarding({
      token: 'token-123',
      establishmentId: 'establishment-1',
      category: 'HAMBURGUERIA',
      productTypeDescriptions: ['Lanches', 'Bebidas'],
    });

    expect(mockUpdateEstablishmentCategory).toHaveBeenCalledWith(
      'token-123',
      'establishment-1',
      'HAMBURGUERIA',
    );
    expect(mockCreateProductType.mock.calls).toEqual([
      ['token-123', { description: 'Lanches', color: '#9E9E9E' }],
      ['token-123', { description: 'Bebidas', color: '#9E9E9E' }],
    ]);
    expect(mockRunWithLock).toHaveBeenCalledTimes(1);
    expect(mockSynchronizeWithServer).toHaveBeenCalledWith('token-123', 'establishment-1');
    expect(mockUpdateEstablishmentCategory.mock.invocationCallOrder[0])
      .toBeLessThan(mockCreateProductType.mock.invocationCallOrder[0]);
    expect(mockCreateProductType.mock.invocationCallOrder.at(-1))
      .toBeLessThan(mockRunWithLock.mock.invocationCallOrder[0]);
  });

  it('does not send blank descriptions from an edited list', async () => {
    await completeCategoryOnboarding({
      token: 'token-123',
      establishmentId: 'establishment-1',
      category: 'OUTRO',
      productTypeDescriptions: [' Produtos ', '  '],
    });

    expect(mockCreateProductType).toHaveBeenCalledWith(
      'token-123',
      { description: 'Produtos', color: '#9E9E9E' },
    );
    expect(mockCreateProductType).toHaveBeenCalledTimes(1);
  });
});
