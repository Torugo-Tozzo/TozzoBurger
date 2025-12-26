let _locked = false;

export async function runWithLock<T>(fn: () => Promise<T>): Promise<T | null> {
  if (_locked) return null;
  _locked = true;
  try {
    return await fn();
  } finally {
    _locked = false;
  }
}

export function isLocked(): boolean {
  return _locked;
}

export function forceUnlock(): void {
  _locked = false;
}
