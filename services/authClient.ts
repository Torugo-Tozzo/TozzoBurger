import { AuthClient, processLock } from '@supabase/auth-js';
import { authStorage } from './authStorage';

const AUTH_URL = process.env.EXPO_PUBLIC_AUTH_URL || `${(process.env.EXPO_PUBLIC_API_URL || 'https://api.tozzo.uk').replace(/\/$/, '')}/gotrue`;

export const authClient = new AuthClient({
  url: AUTH_URL,
  storageKey: `tozzo_auth_v2_${AUTH_URL.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
  storage: authStorage,
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: false,
  lock: processLock,
});
