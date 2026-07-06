let _currentSync: Promise<any> | null = null;
let _queuedSync: Promise<any> | null = null;

/**
 * Executa fn com lock serializado:
 * - Sem sync em andamento: executa direto.
 * - Com sync em andamento: enfileira UMA execução para depois dela.
 * - Já existe execução enfileirada: reaproveita (coalescing) — chamadas
 *   concorrentes recebem a mesma promise em vez de criar novas execuções.
 *
 * Isso corrige a race da versão anterior, onde dois waiters acordavam juntos
 * ao fim da sync corrente e executavam em paralelo.
 */
export async function runWithLock<T>(fn: () => Promise<T>): Promise<T | null> {
  if (_queuedSync) {
    return _queuedSync as Promise<T | null>;
  }

  if (_currentSync) {
    const queued = _currentSync
      .catch(() => {
        // ignora erro da sync anterior
      })
      .then(() => {
        _queuedSync = null;
        const run = fn();
        _currentSync = run;
        return run.finally(() => {
          if (_currentSync === run) {
            _currentSync = null;
          }
        });
      });
    _queuedSync = queued;
    return queued;
  }

  const promise = fn();
  _currentSync = promise;

  try {
    return await promise;
  } finally {
    // Só limpa se ainda é a mesma promise (evita race condition)
    if (_currentSync === promise) {
      _currentSync = null;
    }
  }
}

export function isLocked(): boolean {
  return _currentSync !== null || _queuedSync !== null;
}

export function forceUnlock(): void {
  _currentSync = null;
  _queuedSync = null;
}
