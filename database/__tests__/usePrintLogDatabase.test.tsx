jest.mock('react-native', () => {
  const databaseBridge = require('@nozbe/watermelondb/adapters/sqlite/sqlite-node/DatabaseBridge').default;
  const bridgeMethods = [
    'initialize',
    'setUpWithSchema',
    'setUpWithMigrations',
    'find',
    'query',
    'queryIds',
    'unsafeQueryRaw',
    'count',
    'batch',
    'unsafeResetDatabase',
    'getLocal',
  ];
  const asyncDatabaseBridge = bridgeMethods.reduce((bridge, method) => {
    bridge[method] = (...args: unknown[]) => new Promise((resolve, reject) => {
      databaseBridge[method](...args, resolve, reject);
    });
    return bridge;
  }, {} as Record<string, (...args: unknown[]) => Promise<unknown>>);

  return {
    NativeModules: { WMDatabaseBridge: asyncDatabaseBridge },
    Platform: { OS: 'ios' },
  };
});

let mockDatabase: import('@nozbe/watermelondb').Database;

jest.mock('../watermelon/database', () => ({
  get database() {
    return mockDatabase;
  },
}));

jest.mock('../../context/AuthContext', () => ({ useAuth: jest.fn() }));

import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { useAuth } from '../../context/AuthContext';
import { usePrintLogDatabase } from '../usePrintLogDatabase';
import migrations from '../watermelon/migrations';
import Order from '../watermelon/models/Order';
import OrderItem from '../watermelon/models/OrderItem';
import Printer from '../watermelon/models/Printer';
import PrintLog from '../watermelon/models/PrintLog';
import Product from '../watermelon/models/Product';
import ProductType from '../watermelon/models/ProductType';
import Sale from '../watermelon/models/Sale';
import SaleItem from '../watermelon/models/SaleItem';
import User from '../watermelon/models/User';
import schema from '../watermelon/schema';

const modelClasses = [Product, ProductType, Order, OrderItem, Sale, SaleItem, User, Printer, PrintLog];
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

function makeDatabase() {
  const adapter = new SQLiteAdapter({
    schema,
    migrations,
    dbName: ':memory:',
    jsi: true,
    onSetUpError: (error) => { throw error; },
  });
  return new Database({ adapter, modelClasses });
}

async function seedPrintLog(database: Database, establishmentId: string, printedAt: Date) {
  return database.write(() => database.get<PrintLog>('print_logs').create((record) => {
    record.establishmentId = establishmentId;
    record.deviceId = 'seed-device';
    record.printedAt = printedAt;
  }));
}

describe('usePrintLogDatabase', () => {
  beforeEach(() => {
    mockDatabase = makeDatabase();
    mockUseAuth.mockReturnValue({ user: { establishmentId: 'estab-1' } } as ReturnType<typeof useAuth>);
  });

  it('conta so as impressoes de hoje do proprio estabelecimento', async () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    await seedPrintLog(mockDatabase, 'estab-1', today);
    await seedPrintLog(mockDatabase, 'estab-1', yesterday);
    await seedPrintLog(mockDatabase, 'outro-estab', today);

    const { countPrintsToday } = usePrintLogDatabase();

    await expect(countPrintsToday()).resolves.toBe(1);
  });

  it('recordPrintLog cria uma linha nova', async () => {
    const { recordPrintLog, countPrintsToday } = usePrintLogDatabase();

    await recordPrintLog('device-1');

    await expect(countPrintsToday()).resolves.toBe(1);
  });
});
