import AsyncStorage from '@react-native-async-storage/async-storage';

const PLAN_CACHE_KEY = 'tozzo_plan_cache_v1';

// Chave sempre escopada por estabelecimento — sem isso, um dispositivo compartilhado (comum no
// PDV) que troca de conta herda o plano cacheado da conta anterior até o próximo refresh em
// background, liberando ou bloqueando limite indevidamente pra conta errada.
function scopedKey(establishmentId: string | number): string {
  return `${PLAN_CACHE_KEY}:${establishmentId}`;
}

export async function cachePlan(plan: string, establishmentId: string | number): Promise<void> {
  try {
    await AsyncStorage.setItem(scopedKey(establishmentId), plan);
  } catch (err) {
    console.warn('Failed to cache plan', err);
  }
}

export async function getCachedPlan(establishmentId: string | number): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(scopedKey(establishmentId));
  } catch (err) {
    console.warn('Failed to read cached plan', err);
    return null;
  }
}

export async function clearCachedPlan(establishmentId: string | number): Promise<void> {
  try {
    await AsyncStorage.removeItem(scopedKey(establishmentId));
  } catch (err) {
    console.warn('Failed to clear cached plan', err);
  }
}
