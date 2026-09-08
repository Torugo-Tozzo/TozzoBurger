import * as SecureStore from 'expo-secure-store';
import { authStorage } from '../authStorage';
jest.mock('expo-secure-store');
jest.mock('expo-crypto', () => ({ randomUUID: () => String(Math.random()).slice(2) }));
const stored = new Map<string, string>();
beforeEach(() => {
  stored.clear();
  (SecureStore.getItemAsync as jest.Mock).mockImplementation(async (key) => stored.get(key) ?? null);
  (SecureStore.setItemAsync as jest.Mock).mockImplementation(async (key, value) => {
    if (Buffer.byteLength(value, 'utf8') > 2048) throw new Error('SecureStore value too large');
    stored.set(key, value);
  });
  (SecureStore.deleteItemAsync as jest.Mock).mockImplementation(async (key) => { stored.delete(key); });
});
it('persists large Unicode sessions within native secure storage limits', async () => {
  const session = JSON.stringify({ refresh_token: 'secret', user: '🍔'.repeat(3000) });
  await authStorage.setItem('session', session);
  expect(await authStorage.getItem('session')).toBe(session);
});
it('removes all session material on logout', async () => {
  await authStorage.setItem('session', 'token'.repeat(2000));
  await authStorage.removeItem('session');
  expect(await authStorage.getItem('session')).toBeNull();
  expect(stored.size).toBe(0);
});
it('preserves the previous session when a replacement write fails', async () => {
  await authStorage.setItem('session', 'previous');
  (SecureStore.setItemAsync as jest.Mock).mockRejectedValueOnce(new Error('Storage unavailable'));
  await expect(authStorage.setItem('session', 'replacement')).rejects.toThrow('Storage unavailable');
  expect(await authStorage.getItem('session')).toBe('previous');
});
it('cleans old chunks when a large session is replaced', async () => {
  await authStorage.setItem('session', 'x'.repeat(6000));
  await authStorage.setItem('session', 'small');
  expect(await authStorage.getItem('session')).toBe('small');
  expect(stored.size).toBe(2);
});
