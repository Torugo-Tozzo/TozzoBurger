import { Q } from '@nozbe/watermelondb';

import { database } from './watermelon/database';
import PrinterModel from './watermelon/models/Printer';

const PRINTER_ID = '1';

function printerCollection() {
  return database.get<PrinterModel>('printers');
}

async function findPrinter(): Promise<PrinterModel | null> {
  const [printer] = await printerCollection().query(Q.where('id', PRINTER_ID)).fetch();
  return printer ?? null;
}

export function usePrinterDatabase() {
  // Cria ou atualiza a impressora padrão
  async function setPrinter(uuid: string, name: string) {
    await database.write(async () => {
      const existingPrinter = await findPrinter();

      if (existingPrinter) {
        await existingPrinter.update((printer) => {
          printer.uuid = uuid;
          printer.name = name;
        });
        return;
      }

      const preparedPrinter = printerCollection().prepareCreateFromDirtyRaw({
        id: PRINTER_ID,
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
    const printer = await findPrinter();

    if (!printer) {
      return { uuid: null, name: null };
    }

    return { uuid: printer.uuid, name: printer.name };
  }

  // Remove a impressora registrada
  async function removePrinter() {
    const printer = await findPrinter();

    if (printer) {
      await database.write(() => printer.destroyPermanently());
    }
  }

  return { setPrinter, getPrinter, removePrinter };
}
