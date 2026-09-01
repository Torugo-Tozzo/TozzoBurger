import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const DEVICE_ID_KEY = 'tozzo_device_id_v1';

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (existing) return existing;

  const generated = Crypto.randomUUID();
  await SecureStore.setItemAsync(DEVICE_ID_KEY, generated);
  return generated;
}
