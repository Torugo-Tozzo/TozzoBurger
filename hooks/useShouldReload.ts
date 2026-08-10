import { useRef } from 'react';
import { getChangedAt, type Table } from '@/database/tableWatermark';

export function useShouldReload(tables: Table[]): () => boolean {
  const seenRef = useRef<Partial<Record<Table, number>> | null>(null);

  return function shouldReload(): boolean {
    let changed = seenRef.current === null;
    const current: Partial<Record<Table, number>> = {};

    for (const table of tables) {
      const value = getChangedAt(table);
      current[table] = value;
      if (seenRef.current && seenRef.current[table] !== value) {
        changed = true;
      }
    }

    if (changed) {
      seenRef.current = current;
    }

    return changed;
  };
}
