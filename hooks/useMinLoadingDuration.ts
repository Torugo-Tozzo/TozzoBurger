import { useEffect, useRef, useState } from 'react';

/**
 * Mantem o estado de loading "true" por pelo menos minMs, mesmo que a
 * requisicao real termine antes - evita o skeleton piscar rapido demais
 * (efeito mecanico) quando a resposta volta quase instantanea.
 */
export function useMinLoadingDuration(isLoading: boolean, minMs = 400): boolean {
  const [shown, setShown] = useState(isLoading);
  const startedAtRef = useRef<number | null>(isLoading ? Date.now() : null);

  useEffect(() => {
    if (isLoading) {
      startedAtRef.current = Date.now();
      setShown(true);
      return;
    }

    const elapsed = startedAtRef.current != null ? Date.now() - startedAtRef.current : minMs;
    const remaining = Math.max(0, minMs - elapsed);
    const timer = setTimeout(() => setShown(false), remaining);
    return () => clearTimeout(timer);
  }, [isLoading, minMs]);

  return shown;
}

export default useMinLoadingDuration;
