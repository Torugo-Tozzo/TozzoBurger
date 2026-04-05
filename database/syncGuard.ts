let _currentSync: Promise<any> | null = null;

/**
 * Executa fn com lock: se já há sync rodando, espera terminar e então executa.
 * Diferente do boolean anterior que descartava a requisição.
 */
export async function runWithLock<T>(fn: () => Promise<T>): Promise<T | null> {
  // Se já há sync em andamento, aguarda ela terminar antes de iniciar
  if (_currentSync) {
    try {
      await _currentSync;
    } catch {
      // ignora erro da sync anterior
    }
  }

  const promise = fn();
  _currentSync = promise;

  try {
    const result = await promise;
    return result;
  } finally {
    // Só limpa se ainda é a mesma promise (evita race condition)
    if (_currentSync === promise) {
      _currentSync = null;
    }
  }
}

export function isLocked(): boolean {
  return _currentSync !== null;
}

export function forceUnlock(): void {
  _currentSync = null;
}
