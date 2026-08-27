import { Q } from '@nozbe/watermelondb';

import { useAuth } from '../context/AuthContext';
import { database } from './watermelon/database';
import PrinterModel from './watermelon/models/Printer';

function printerCollection() {
  return database.get<PrinterModel>('printers');
}

async function findPrinter(establishmentId: string | null): Promise<PrinterModel | null> {
  if (!establishmentId) return null;

  const [printer] = await printerCollection().query(Q.where('id', establishmentId)).fetch();
  return printer ?? null;
}

export function usePrinterDatabase() {
  const { user } = useAuth();
  const establishmentId = user?.establishmentId == null || user.establishmentId === ''
    ? null
    : String(user.establishmentId);

  // Cria ou atualiza a impressora padrão
  async function setPrinter(uuid: string, name: string) {
    if (!establishmentId) {
      throw new Error('Cannot configure a printer without an authenticated establishment');
    }

    await database.write(async () => {
      const existingPrinter = await findPrinter(establishmentId);

      if (existingPrinter) {
        await existingPrinter.update((printer) => {
          printer.uuid = uuid;
          printer.name = name;
        });
        return;
      }

      const preparedPrinter = printerCollection().prepareCreateFromDirtyRaw({
        id: establishmentId,
        _status: 'created',
        _changed: '',
        uuid,
        name,
      });

      await database.batch(preparedPrinter);
    });
  }

  // Obtém o UUID e name da impressora registrada
  async function getPrinter() {
    const printer = await findPrinter(establishmentId);

    if (!printer) {
      return { uuid: null, name: null };
    }

    return { uuid: printer.uuid, name: printer.name };
  }

  // Remove a impressora registrada
  async function removePrinter() {
    const printer = await findPrinter(establishmentId);

    if (printer) {
      await database.write(() => printer.destroyPermanently());
    }
  }

  return { setPrinter, getPrinter, removePrinter };
}
