import * as SecureStore from 'expo-secure-store';
import { randomUUID } from 'expo-crypto';

type Manifest = { generation: string; count: number };
async function manifest(key: string): Promise<Manifest | null> {
  const raw = await SecureStore.getItemAsync(key);
  return raw ? JSON.parse(raw) : null;
}
const chunkKey = (key: string, value: Manifest, index: number) => `${key}.${value.generation}.${index}`;
async function removeChunks(key: string, value: Manifest | null) {
  if (!value) return;
  await Promise.all(Array.from({ length: value.count }, (_, i) => SecureStore.deleteItemAsync(chunkKey(key, value, i))));
}

// Session metadata can exceed SecureStore's native value limit. Keep every
// fragment encrypted by SecureStore and publish a new manifest only after all
// writes succeed, so a failed refresh cannot destroy the previous session.
export const authStorage = {
  async getItem(key: string): Promise<string | null> {
    const current = await manifest(key);
    if (!current) return null;
    const chunks = await Promise.all(Array.from({ length: current.count }, (_, i) => SecureStore.getItemAsync(chunkKey(key, current, i))));
    return chunks.some((chunk) => chunk === null) ? null : chunks.join('');
  },
  async setItem(key: string, value: string): Promise<void> {
    const previous = await manifest(key);
    const characters = Array.from(value);
    const next = { generation: randomUUID(), count: Math.max(1, Math.ceil(characters.length / 400)) };
    try {
      for (let i = 0; i < next.count; i++) {
        await SecureStore.setItemAsync(chunkKey(key, next, i), characters.slice(i * 400, (i + 1) * 400).join(''));
      }
      await SecureStore.setItemAsync(key, JSON.stringify(next));
    } catch (error) {
      await removeChunks(key, next).catch(() => undefined);
      throw error;
    }
    await removeChunks(key, previous).catch((error) => console.warn('[auth] Old session cleanup failed', error));
  },
  async removeItem(key: string): Promise<void> {
    const current = await manifest(key);
    await SecureStore.deleteItemAsync(key);
    await removeChunks(key, current);
  },
};
