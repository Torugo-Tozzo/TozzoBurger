import { useSQLiteContext } from "expo-sqlite";
import { Printer } from "./types/Printer";

export function usePrinterDatabase() {
    const database = useSQLiteContext();

    // Cria ou atualiza a impressora padrão
    async function setPrinter(uuid: string, name: string) {
        try {
            // Verifica se já existe um registro de impressora
            const existingPrinter = await database.getFirstAsync<Printer>(
                "SELECT * FROM TB_PRINTERS WHERE id = 1"
            );

            if (existingPrinter) {
                // Se já existir, atualiza o UUID e o name
                await database.runAsync(
                    `UPDATE TB_PRINTERS SET uuid = ?, name = ? WHERE id = 1`,
                    uuid,
                    name
                );
            } else {
                // Caso contrário, cria um novo registro para a impressora
                await database.runAsync(
                    `INSERT INTO TB_PRINTERS (id, uuid, name) VALUES (1, ?, ?)`,
                    uuid,
                    name
                );
            }
        } catch (error) {
            console.error("Erro ao definir impressora:", error);
            throw error;
        }
    }

    // Obtém o UUID e name da impressora registrada
    async function getPrinter() {
        try {
            const printer = await database.getFirstAsync<Printer>(
                "SELECT * FROM TB_PRINTERS WHERE id = 1"
            );

            if (!printer) {
                // Caso não haja impressora registrada, retorna null ou um valor default
                return { uuid: null, name: null };
            }

            return { uuid: printer.uuid, name: printer.name };
        } catch (error) {
            console.error("Erro ao obter impressora:", error);
            throw error;
        }
    }


    // Remove a impressora registrada
    async function removePrinter() {
        try {
            await database.runAsync("DELETE FROM TB_PRINTERS WHERE id = 1");
        } catch (error) {
            console.error("Erro ao remover impressora:", error);
            throw error;
        }
    }

    return { setPrinter, getPrinter, removePrinter };
}
