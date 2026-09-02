import AsyncStorage from '@react-native-async-storage/async-storage';

const REPORT_COUNT_KEY = 'tozzo_report_count_v1';
const REPORT_MONTH_KEY = 'tozzo_report_month_v1';

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth()}`;
}

// Chaves escopadas por estabelecimento — mesma razão do planCache: dispositivo compartilhado
// trocando de conta não pode herdar (nem contaminar) o contador de outra conta.
function monthKey(establishmentId: string | number): string {
  return `${REPORT_MONTH_KEY}:${establishmentId}`;
}

function countKey(establishmentId: string | number): string {
  return `${REPORT_COUNT_KEY}:${establishmentId}`;
}

export async function getReportCountThisMonth(establishmentId: string | number): Promise<number> {
  const storedMonth = await AsyncStorage.getItem(monthKey(establishmentId));
  if (storedMonth !== currentMonthKey()) return 0;

  const raw = await AsyncStorage.getItem(countKey(establishmentId));
  return raw ? Number(raw) : 0;
}

export async function recordReportGenerated(establishmentId: string | number): Promise<void> {
  const month = currentMonthKey();
  const count = await getReportCountThisMonth(establishmentId);
  await AsyncStorage.setItem(monthKey(establishmentId), month);
  await AsyncStorage.setItem(countKey(establishmentId), String(count + 1));
}

export async function clearReportQuota(establishmentId: string | number): Promise<void> {
  try {
    await AsyncStorage.multiRemove([monthKey(establishmentId), countKey(establishmentId)]);
  } catch (err) {
    console.warn('Failed to clear report quota cache', err);
  }
}
