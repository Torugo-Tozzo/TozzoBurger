import * as Crypto from 'expo-crypto';

function bytesToUuid(bytes: ArrayLike<number>): string {
  const hex: string[] = [];
  for (let i = 0; i < bytes.length; i++) {
    hex.push((bytes[i] & 0xff).toString(16).padStart(2, '0'));
  }
  return (
    hex.slice(0, 4).join('') +
    hex.slice(4, 6).join('') +
    hex.slice(6, 8).join('') +
    hex.slice(8, 10).join('') +
    hex.slice(10, 16).join('')
  ).replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
}

export function generateUUID(): string {
  // 1) Prefer expo-crypto.randomUUID when disponível (sync)
  // @ts-ignore
  if ((Crypto as any).randomUUID) return (Crypto as any).randomUUID();

  // 2) Prefer Web Crypto randomUUID
  // @ts-ignore
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();

  // 3) Try to get 16 random bytes from expo-crypto (sync)
  let bytes: Uint8Array | null = null;
  // @ts-ignore
  if (typeof (Crypto as any).getRandomBytes === 'function') {
    // @ts-ignore
    bytes = (Crypto as any).getRandomBytes(16);
  } else if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const arr = new Uint8Array(16);
    // @ts-ignore
    globalThis.crypto.getRandomValues(arr);
    bytes = arr;
  }

  if (bytes) {
    // Per RFC4122 set version and variant bits
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant
    return bytesToUuid(bytes);
  }

  // 4) Last-resort non-crypto fallback (should only happen in rare dev environments)
  const rnds: number[] = [];
  for (let i = 0; i < 16; i++) rnds[i] = Math.floor(Math.random() * 256);
  rnds[6] = (rnds[6] & 0x0f) | 0x40;
  rnds[8] = (rnds[8] & 0x3f) | 0x80;
  return bytesToUuid(rnds);
}

export default generateUUID;

// Note: removed dependency on 'uuid' to avoid bundling issues on native.