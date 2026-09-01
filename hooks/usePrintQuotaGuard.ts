import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/context/AuthContext';
import { usePrintLogDatabase } from '@/database/usePrintLogDatabase';
import { getCachedPlan } from '@/services/planCache';
import { PRINT_DAILY_LIMIT } from '@/constants/planLimits';

/** Checks the offline Free-plan print quota for the authenticated establishment. */
export function usePrintQuotaGuard() {
  const { user } = useAuth();
  const { countPrintsToday } = usePrintLogDatabase();
  const { t } = useTranslation();

  async function checkPrintAllowed(): Promise<boolean> {
    const establishmentId = user?.establishmentId;
    const plan = establishmentId != null ? await getCachedPlan(establishmentId) : null;
    if (plan !== null && plan !== 'FREE') return true;

    const usedToday = await countPrintsToday();
    if (usedToday < PRINT_DAILY_LIMIT) return true;

    Alert.alert(t('sales.printLimitReachedTitle'), t('sales.printLimitReachedMessage'));
    return false;
  }

  return { checkPrintAllowed };
}
