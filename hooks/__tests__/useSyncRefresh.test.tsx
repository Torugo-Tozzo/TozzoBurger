import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('@/context/AutoSyncContext', () => ({
  useAutoSync: jest.fn(),
}));

import { useAutoSync } from '@/context/AutoSyncContext';
import { useSyncRefresh } from '../useSyncRefresh';

const mockUseAutoSync = useAutoSync as jest.Mock;

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function renderSyncRefreshHook() {
  let result!: ReturnType<typeof useSyncRefresh>;
  function Harness() {
    result = useSyncRefresh();
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

describe('useSyncRefresh', () => {
  beforeEach(() => {
    mockUseAutoSync.mockReset();
  });

  it('sets refreshing while triggerSync is pending, clears it after resolving', async () => {
    const d = deferred<void>();
    const triggerSync = jest.fn(() => d.promise);
    mockUseAutoSync.mockReturnValue({ triggerSync, isSyncing: false });

    const hook = renderSyncRefreshHook();
    expect(hook.current.refreshing).toBe(false);

    let refreshPromise!: Promise<void>;
    act(() => {
      refreshPromise = hook.current.onRefresh();
    });

    expect(triggerSync).toHaveBeenCalledTimes(1);
    expect(hook.current.refreshing).toBe(true);

    await act(async () => {
      d.resolve();
      await refreshPromise;
    });

    expect(hook.current.refreshing).toBe(false);
  });

  it('ignores the pull when a sync is already in progress elsewhere', async () => {
    const triggerSync = jest.fn();
    mockUseAutoSync.mockReturnValue({ triggerSync, isSyncing: true });

    const hook = renderSyncRefreshHook();
    await act(async () => {
      await hook.current.onRefresh();
    });

    expect(triggerSync).not.toHaveBeenCalled();
    expect(hook.current.refreshing).toBe(false);
  });

  it('clears refreshing even when triggerSync throws', async () => {
    const triggerSync = jest.fn(() => Promise.reject(new Error('sync failed')));
    mockUseAutoSync.mockReturnValue({ triggerSync, isSyncing: false });

    const hook = renderSyncRefreshHook();
    let caught: unknown;
    await act(async () => {
      try {
        await hook.current.onRefresh();
      } catch (e) {
        caught = e;
      }
    });

    expect(caught).toBeInstanceOf(Error);
    expect(hook.current.refreshing).toBe(false);
  });
});
