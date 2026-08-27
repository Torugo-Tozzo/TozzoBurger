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
    bridge[method] = (...args: unknown[]) =>
      new Promise((resolve, reject) => {
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

jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import migrations from '../watermelon/migrations';
import Order from '../watermelon/models/Order';
import OrderItem from '../watermelon/models/OrderItem';
import Printer from '../watermelon/models/Printer';
import Product from '../watermelon/models/Product';
import ProductType from '../watermelon/models/ProductType';
import Sale from '../watermelon/models/Sale';
import SaleItem from '../watermelon/models/SaleItem';
import User from '../watermelon/models/User';
import schema from '../watermelon/schema';
import { useAuth } from '../../context/AuthContext';
import { usePrinterDatabase } from '../usePrinterDatabase';

const modelClasses = [Product, ProductType, Order, OrderItem, Sale, SaleItem, User, Printer];
const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;

function setCurrentEstablishment(establishmentId: string | number | null) {
  mockUseAuth.mockReturnValue({
    user: { establishmentId },
  } as ReturnType<typeof useAuth>);
}

function makeDatabase() {
  const adapter = new SQLiteAdapter({
    schema,
    migrations,
    dbName: ':memory:',
    jsi: true,
    onSetUpError: (error) => {
      throw error;
    },
  });

  return new Database({ adapter, modelClasses });
}

describe('usePrinterDatabase', () => {
  beforeEach(() => {
    mockDatabase = makeDatabase();
    setCurrentEstablishment('establishment-1');
  });

  it('returns the legacy empty-printer object before a printer is configured', async () => {
    await expect(usePrinterDatabase().getPrinter()).resolves.toEqual({ uuid: null, name: null });
  });

  it('setPrinter() creates one establishment printer record and updates it on subsequent calls', async () => {
    const printerDatabase = usePrinterDatabase();

    await printerDatabase.setPrinter('printer-1', 'Caixa');
    await expect(printerDatabase.getPrinter()).resolves.toEqual({ uuid: 'printer-1', name: 'Caixa' });
    await expect(mockDatabase.get<Printer>('printers').query().fetchCount()).resolves.toBe(1);

    await printerDatabase.setPrinter('printer-2', 'Balcão');
    await expect(printerDatabase.getPrinter()).resolves.toEqual({ uuid: 'printer-2', name: 'Balcão' });
    await expect(mockDatabase.get<Printer>('printers').query().fetchCount()).resolves.toBe(1);
  });

  it('does not return establishment A printer after the auth context changes to B', async () => {
    setCurrentEstablishment('establishment-a');
    const establishmentADatabase = usePrinterDatabase();
    await establishmentADatabase.setPrinter('printer-a', 'Caixa A');

    setCurrentEstablishment('establishment-b');
    const establishmentBDatabase = usePrinterDatabase();

    await expect(establishmentBDatabase.getPrinter()).resolves.toEqual({ uuid: null, name: null });
    await establishmentBDatabase.setPrinter('printer-b', 'Caixa B');

    setCurrentEstablishment('establishment-a');
    await expect(usePrinterDatabase().getPrinter()).resolves.toEqual({ uuid: 'printer-a', name: 'Caixa A' });
  });

  it('removePrinter() permanently removes the local printer record', async () => {
    const printerDatabase = usePrinterDatabase();
    await printerDatabase.setPrinter('printer-1', 'Caixa');

    await printerDatabase.removePrinter();

    await expect(printerDatabase.getPrinter()).resolves.toEqual({ uuid: null, name: null });
    await expect(mockDatabase.get<Printer>('printers').query().fetchCount()).resolves.toBe(0);
  });
});
