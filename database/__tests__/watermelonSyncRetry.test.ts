jest.mock('@nozbe/watermelondb/sync', () => ({
  synchronize: jest.fn(),
}));

jest.mock('@/services/api', () => ({
  ...jest.requireActual('@/services/api'),
  pullChanges: jest.fn(),
  pushChanges: jest.fn(),
}));

jest.mock('../watermelon/database', () => ({
  database: {},
}));

jest.mock('../tableWatermark', () => ({
  markChanged: jest.fn(),
}));

import { synchronize as watermelonSynchronize } from '@nozbe/watermelondb/sync';
import { ApiHttpError, pullChanges as apiPullChanges, pushChanges as apiPushChanges } from '@/services/api';
import { synchronizeWithServer } from '../watermelon/sync';

const mockWatermelonSynchronize = watermelonSynchronize as jest.Mock;
const mockPullChanges = apiPullChanges as jest.Mock;
const mockPushChanges = apiPushChanges as jest.Mock;

function emptyChanges() {
  return {
    products: { created: [], updated: [], deleted: [] },
    product_types: { created: [], updated: [], deleted: [] },
    orders: { created: [], updated: [], deleted: [] },
    order_items: { created: [], updated: [], deleted: [] },
    sales: { created: [], updated: [], deleted: [] },
    sale_items: { created: [], updated: [], deleted: [] },
  };
}

describe('Watermelon sync conflict retry', () => {
  beforeEach(() => {
    mockWatermelonSynchronize.mockReset();
    mockPullChanges.mockReset();
    mockPushChanges.mockReset();

    mockPullChanges.mockResolvedValue({
      changes: emptyChanges(),
      timestamp: 1_700_000_000_010,
    });
    mockPushChanges.mockResolvedValue({ ignored: [], ignored_order_deletes: [] });
    mockWatermelonSynchronize.mockImplementation(async (args: any) => {
      const pullResult = await args.pullChanges({
        lastPulledAt: null,
        schemaVersion: 2,
        migration: null,
      });
      await args.onDidPullChanges?.(pullResult);
      await args.pushChanges({
        changes: emptyChanges(),
        lastPulledAt: pullResult.timestamp,
      });
    });
  });

  it('restarts the complete synchronize cycle after one sync conflict', async () => {
    const conflict = new ApiHttpError(409, {
      error: 'SYNC_CONFLICT',
      message: 'server changed first',
    });
    mockPushChanges.mockRejectedValueOnce(conflict);

    await expect(synchronizeWithServer('token-123')).resolves.toBeUndefined();

    expect(mockWatermelonSynchronize).toHaveBeenCalledTimes(2);
    expect(mockPullChanges).toHaveBeenCalledTimes(2);
    expect(mockPushChanges).toHaveBeenCalledTimes(2);
  });

  it('propagates the final conflict after three complete synchronize attempts', async () => {
    const conflicts = [1, 2, 3].map((attempt) => new ApiHttpError(409, {
      code: 'SYNC_CONFLICT',
      message: `server changed on attempt ${attempt}`,
    }));
    mockPushChanges
      .mockRejectedValueOnce(conflicts[0])
      .mockRejectedValueOnce(conflicts[1])
      .mockRejectedValueOnce(conflicts[2]);

    await expect(synchronizeWithServer('token-123')).rejects.toBe(conflicts[2]);

    expect(mockWatermelonSynchronize).toHaveBeenCalledTimes(3);
    expect(mockPullChanges).toHaveBeenCalledTimes(3);
    expect(mockPushChanges).toHaveBeenCalledTimes(3);
  });

  it('propagates a non-conflict error without retrying', async () => {
    const networkError = new TypeError('network unavailable');
    mockPushChanges.mockRejectedValue(networkError);

    await expect(synchronizeWithServer('token-123')).rejects.toBe(networkError);

    expect(mockWatermelonSynchronize).toHaveBeenCalledTimes(1);
    expect(mockPullChanges).toHaveBeenCalledTimes(1);
    expect(mockPushChanges).toHaveBeenCalledTimes(1);
  });
});
