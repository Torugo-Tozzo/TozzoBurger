import AsyncStorage from '@react-native-async-storage/async-storage';

const REPORT_COUNT_KEY = 'tozzo_report_count_v1';
const REPORT_MONTH_KEY = 'tozzo_report_month_v1';

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth()}`;
}

export async function getReportCountThisMonth(): Promise<number> {
  const storedMonth = await AsyncStorage.getItem(REPORT_MONTH_KEY);
  if (storedMonth !== currentMonthKey()) return 0;

  const raw = await AsyncStorage.getItem(REPORT_COUNT_KEY);
  return raw ? Number(raw) : 0;
}

export async function recordReportGenerated(): Promise<void> {
  const month = currentMonthKey();
  const count = await getReportCountThisMonth();
  await AsyncStorage.setItem(REPORT_MONTH_KEY, month);
  await AsyncStorage.setItem(REPORT_COUNT_KEY, String(count + 1));
}
