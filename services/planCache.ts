import AsyncStorage from '@react-native-async-storage/async-storage';

const PLAN_CACHE_KEY = 'tozzo_plan_cache_v1';

export async function cachePlan(plan: string): Promise<void> {
  try {
    await AsyncStorage.setItem(PLAN_CACHE_KEY, plan);
  } catch (err) {
    console.warn('Failed to cache plan', err);
  }
}

export async function getCachedPlan(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(PLAN_CACHE_KEY);
  } catch (err) {
    console.warn('Failed to read cached plan', err);
    return null;
  }
}
