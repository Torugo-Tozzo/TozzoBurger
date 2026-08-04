import { runWithLock, isLocked, forceUnlock } from '../syncGuard';

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('syncGuard', () => {
  beforeEach(() => {
    forceUnlock();
  });

  it('runs a single call directly and clears the lock afterwards', async () => {
    expect(isLocked()).toBe(false);
    const result = await runWithLock(async () => 'ok');
    expect(result).toBe('ok');
    expect(isLocked()).toBe(false);
  });

  it('reports locked while a call is in flight', async () => {
    const d = deferred<string>();
    const p = runWithLock(() => d.promise);
    expect(isLocked()).toBe(true);
    d.resolve('done');
    await p;
    expect(isLocked()).toBe(false);
  });

  it('serializes concurrent calls — never runs two fns at once', async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    const order: number[] = [];

    const makeFn = (id: number, delayMs: number) => async () => {
      concurrent++;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await new Promise((r) => setTimeout(r, delayMs));
      order.push(id);
      concurrent--;
      return id;
    };

    // 3+ concurrent callers, as called out in the original race-condition bug.
    const results = await Promise.all([
      runWithLock(makeFn(1, 30)),
      runWithLock(makeFn(2, 10)),
      runWithLock(makeFn(3, 10)),
    ]);

    expect(maxConcurrent).toBe(1);
    // Coalescing: callers 2 and 3 queue behind the same pending run, so only
    // the first queued fn (2) actually executes; 3 reuses that same promise.
    expect(order).toEqual([1, 2]);
    expect(results).toEqual([1, 2, 2]);
    expect(isLocked()).toBe(false);
  });

  it('recovers after the current sync throws — the queued call still runs', async () => {
    const d = deferred<void>();
    const failing = runWithLock(async () => {
      await d.promise;
      throw new Error('boom');
    });
    // Two callers queue up behind the failing run.
    const queued1 = runWithLock(async () => 'after-failure-1');
    const queued2 = runWithLock(async () => 'after-failure-2');

    d.reject(new Error('boom'));
    await expect(failing).rejects.toThrow('boom');

    // Queued callers coalesce into a single execution and don't propagate
    // the previous failure.
    await expect(queued1).resolves.toBe('after-failure-1');
    await expect(queued2).resolves.toBe('after-failure-1');
    expect(isLocked()).toBe(false);
  });

  it('forceUnlock clears state even mid-flight (manual recovery escape hatch)', async () => {
    const d = deferred<string>();
    const p = runWithLock(() => d.promise);
    expect(isLocked()).toBe(true);
    forceUnlock();
    expect(isLocked()).toBe(false);
    d.resolve('late');
    await p;
  });
});
