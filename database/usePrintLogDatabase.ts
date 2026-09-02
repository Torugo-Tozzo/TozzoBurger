import { Q } from '@nozbe/watermelondb';
import { useAuth } from '@/context/AuthContext';
import { database } from './watermelon/database';
import PrintLog from './watermelon/models/PrintLog';

function startOfLocalDay(): number {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function usePrintLogDatabase() {
  const { user } = useAuth();
  const establishmentId = user?.establishmentId ? String(user.establishmentId) : null;

  async function countPrintsToday(): Promise<number> {
    if (!establishmentId) return 0;

    const rows = await database.get<PrintLog>('print_logs').query(
      Q.where('establishment_id', establishmentId),
      Q.where('printed_at', Q.gte(startOfLocalDay())),
    ).fetch();
    return rows.length;
  }

  async function recordPrintLog(deviceId: string): Promise<void> {
    if (!establishmentId) return;

    await database.write(async () => {
      await database.get<PrintLog>('print_logs').create((record) => {
        record.establishmentId = establishmentId;
        record.deviceId = deviceId;
        record.printedAt = new Date();
      });
    });
  }

  return { countPrintsToday, recordPrintLog };
}
