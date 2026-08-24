import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('@/database/tableWatermark', () => ({
  getChangedAt: jest.fn(),
}));

import { getChangedAt } from '@/database/tableWatermark';
import { useShouldReload } from '../useShouldReload';

const mockGetChangedAt = getChangedAt as jest.Mock;

function renderShouldReloadHook(tables: Array<'products' | 'orders' | 'sales'>) {
  let result!: ReturnType<typeof useShouldReload>;
  function Harness() {
    result = useShouldReload(tables);
    return null;
  }
  act(() => {
    TestRenderer.create(<Harness />);
  });
  return {
    get current() {
      return result;
    },
  };
}

describe('useShouldReload', () => {
  beforeEach(() => {
    mockGetChangedAt.mockReset();
  });

  it('returns true on the very first call, even with no changes', () => {
    mockGetChangedAt.mockReturnValue(0);
    const hook = renderShouldReloadHook(['products']);

    expect(hook.current()).toBe(true);
  });

  it('returns false on a second call when nothing changed since the first', () => {
    mockGetChangedAt.mockReturnValue(100);
    const hook = renderShouldReloadHook(['products']);

    expect(hook.current()).toBe(true);
    expect(hook.current()).toBe(false);
  });

  it('returns true again once the watched table changes', () => {
    mockGetChangedAt.mockReturnValue(100);
    const hook = renderShouldReloadHook(['products']);
    expect(hook.current()).toBe(true);
    expect(hook.current()).toBe(false);

    mockGetChangedAt.mockReturnValue(200);
    expect(hook.current()).toBe(true);
  });

  it('reacts if ANY of the watched tables changed, even if others stayed the same', () => {
    const values: Record<string, number> = { orders: 10, products: 50 };
    mockGetChangedAt.mockImplementation((table: string) => values[table]);
    const hook = renderShouldReloadHook(['orders', 'products']);
    expect(hook.current()).toBe(true);
    expect(hook.current()).toBe(false);

    values.products = 51; // só products mudou
    expect(hook.current()).toBe(true);
    expect(hook.current()).toBe(false);
  });
});
