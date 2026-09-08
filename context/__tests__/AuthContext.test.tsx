import React from 'react';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { AuthProvider, useAuth } from '../AuthContext';
import * as api from '@/services/api';
import * as SecureStore from 'expo-secure-store';
import { resetWatermelonLocalData } from '@/database/watermelon/database';

jest.mock('@/services/authClient', () => ({ authClient: {
  getSession: jest.fn(), signInWithPassword: jest.fn(), signOut: jest.fn(),
  onAuthStateChange: jest.fn(), startAutoRefresh: jest.fn(), stopAutoRefresh: jest.fn(),
} }));
const mockAuth = jest.requireMock('@/services/authClient').authClient;
jest.mock('@/services/api', () => ({ login: jest.fn(), getMe: jest.fn(), registerDevice: jest.fn(), getEstablishment: jest.fn() }));
jest.mock('expo-secure-store');
jest.mock('@/services/deviceId', () => ({ getOrCreateDeviceId: async () => 'device' }));
jest.mock('@/services/planCache', () => ({ cachePlan: jest.fn(), clearCachedPlan: jest.fn() }));
jest.mock('@/services/reportQuota', () => ({ clearReportQuota: jest.fn() }));
jest.mock('@/database/watermelon/sync', () => ({ synchronizeWithServer: jest.fn() }));
jest.mock('@/database/syncGuard', () => ({ runWithLock: async (fn: () => unknown) => fn() }));
jest.mock('@/database/watermelon/database', () => ({ resetWatermelonLocalData: jest.fn() }));

const profile = { id: 'user-1', email: 'dev@example.com', establishmentId: 'estab-1' };
let auth: ReturnType<typeof useAuth>;
let tree: ReactTestRenderer;
let emit: (event: string, session: unknown) => void;
function Probe() { auth = useAuth(); return null; }
async function mount() {
  await act(async () => { tree = create(<AuthProvider><Probe /></AuthProvider>); });
}
beforeEach(() => {
  jest.clearAllMocks();
  mockAuth.getSession.mockResolvedValue({ data: { session: null }, error: null });
  mockAuth.signInWithPassword.mockResolvedValue({ data: { session: { access_token: 'gotrue-token' } }, error: null });
  mockAuth.signOut.mockResolvedValue({ error: null });
  mockAuth.onAuthStateChange.mockImplementation((fn: typeof emit) => { emit = fn; return { data: { subscription: { unsubscribe: jest.fn() } } }; });
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
  (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);
  (api.getMe as jest.Mock).mockResolvedValue(profile);
  (resetWatermelonLocalData as jest.Mock).mockResolvedValue(undefined);
});

it('blocks switching establishments if previous local data cannot be cleared', async () => {
  (SecureStore.getItemAsync as jest.Mock).mockImplementation(async (key) => key === 'tozzo_local_data_owner_v1' ? 'another-establishment' : null);
  (resetWatermelonLocalData as jest.Mock).mockRejectedValue(new Error('Database busy'));
  await mount();
  await act(async () => { expect(await auth.login('dev@example.com', 'password')).toBe(false); });
  expect(auth.user).toBeNull();
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); });

it('logs in with GoTrue and publishes the API profile only after validation', async () => {
  await mount();
  let result = false;
  await act(async () => { result = await auth.login('dev@example.com', 'password'); });
  expect(result).toBe(true);
  expect(auth.token).toBe('gotrue-token');
  expect(auth.user).toEqual(profile);
  expect(api.getMe).toHaveBeenCalledWith('gotrue-token');
});

it('does not authenticate when GoTrue rejects the password', async () => {
  mockAuth.signInWithPassword.mockResolvedValue({ data: { session: null }, error: new Error('Invalid credentials') });
  await mount();
  await act(async () => { expect(await auth.login('dev@example.com', 'wrong')).toBe(false); });
  expect(auth.user).toBeNull();
  expect(auth.token).toBeNull();
});

it('restores a persisted GoTrue session and updates tokens after refresh', async () => {
  mockAuth.getSession.mockResolvedValue({ data: { session: { access_token: 'restored-token' } }, error: null });
  await mount();
  expect(auth.user).toEqual(profile);
  expect(auth.token).toBe('restored-token');
  await act(async () => emit('TOKEN_REFRESHED', { access_token: 'renewed-token' }));
  expect(auth.token).toBe('renewed-token');
});

it('keeps a cached profile offline but clears a revoked session', async () => {
  mockAuth.getSession.mockResolvedValue({ data: { session: { access_token: 'restored-token' } }, error: null });
  (SecureStore.getItemAsync as jest.Mock).mockImplementation(async (key) => key === 'tozzo_user_cache_v1' ? JSON.stringify(profile) : null);
  (api.getMe as jest.Mock).mockRejectedValue(new TypeError('Network request failed'));
  await mount();
  expect(auth.user).toEqual(profile);
  await act(async () => emit('SIGNED_OUT', null));
  expect(auth.user).toBeNull();
  expect(auth.token).toBeNull();
});

it('does not keep a session whose API profile is rejected', async () => {
  (api.getMe as jest.Mock).mockRejectedValue(Object.assign(new Error('Revoked'), { status: 401 }));
  await mount();
  await act(async () => { expect(await auth.login('dev@example.com', 'password')).toBe(false); });
  expect(auth.token).toBeNull();
  expect(mockAuth.signOut).toHaveBeenCalled();
});

it('clears the session on logout and ignores subsequent refresh notifications', async () => {
  await mount();
  await act(async () => { await auth.login('dev@example.com', 'password'); });
  await act(async () => auth.logout());
  await act(async () => emit('TOKEN_REFRESHED', { access_token: 'late-token' }));
  expect(auth.token).toBeNull();
  expect(auth.user).toBeNull();
  expect(mockAuth.signOut).toHaveBeenCalledWith({ scope: 'local' });
});

it('does not restore a cached profile for an explicitly revoked account', async () => {
  mockAuth.getSession.mockResolvedValue({ data: { session: { access_token: 'revoked-token' } }, error: null });
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(JSON.stringify(profile));
  (api.getMe as jest.Mock).mockRejectedValue(Object.assign(new Error('Revoked'), { status: 401 }));
  await mount();
  expect(auth.user).toBeNull();
  expect(auth.token).toBeNull();
});

it('does not let an in-flight profile response undo logout', async () => {
  let resolveProfile!: (value: typeof profile) => void;
  (api.getMe as jest.Mock).mockImplementation(() => new Promise((resolve) => { resolveProfile = resolve; }));
  await mount();
  let loginResult!: Promise<boolean>;
  await act(async () => { loginResult = auth.login('dev@example.com', 'password'); });
  await act(async () => { auth.logout(); resolveProfile(profile); });
  expect(await loginResult).toBe(false);
  expect(auth.user).toBeNull();
});
