import * as SecureStore from 'expo-secure-store';
import { getOrCreateDeviceId } from '../deviceId';

jest.mock('expo-secure-store');
jest.mock('expo-crypto', () => ({ randomUUID: () => 'generated-uuid' }));

describe('getOrCreateDeviceId', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retorna o id ja armazenado se existir', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('existing-uuid');

    const id = await getOrCreateDeviceId();

    expect(id).toBe('existing-uuid');
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('gera e persiste um novo id se nao existir nenhum', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

    const id = await getOrCreateDeviceId();

    expect(id).toBe('generated-uuid');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('tozzo_device_id_v1', 'generated-uuid');
  });
});
