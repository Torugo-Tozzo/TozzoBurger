import { useSQLiteContext } from "expo-sqlite";

export type PrinterDatabase = {
    id: number;
    uuid: string;  // UUID da impressora
    nome: string;  // Nome da impressora
};

export function usePrinterDatabase() {
    const database = useSQLiteContext();

    // Cria ou atualiza a impressora padrão
    async function setPrinter(uuid: string, nome: string) {
        try {
            // Verifica se já existe um registro de impressora
            const existingPrinter = await database.getFirstAsync<PrinterDatabase>(
                "SELECT * FROM TB_IMPRESSORAS WHERE id = 1"
            );

            if (existingPrinter) {
                // Se já existir, atualiza o UUID e o nome
                await database.runAsync(
                    `UPDATE TB_IMPRESSORAS SET uuid = ?, nome = ? WHERE id = 1`,
                    uuid,
                    nome
                );
            } else {
                // Caso contrário, cria um novo registro para a impressora
                await database.runAsync(
                    `INSERT INTO TB_IMPRESSORAS (id, uuid, nome) VALUES (1, ?, ?)`,
                    uuid,
                    nome
                );
            }
        } catch (error) {
            console.error("Erro ao definir impressora:", error);
            throw error;
        }
    }

    // Obtém o UUID e nome da impressora registrada
    async function getPrinter() {
        try {
            const printer = await database.getFirstAsync<PrinterDatabase>(
                "SELECT * FROM TB_IMPRESSORAS WHERE id = 1"
            );

            if (!printer) {
                // Caso não haja impressora registrada, retorna null ou um valor default
                return { uuid: null, nome: null };
            }

            return { uuid: printer.uuid, nome: printer.nome };
        } catch (error) {
            console.error("Erro ao obter impressora:", error);
            throw error;
        }
    }


    // Remove a impressora registrada
    async function removePrinter() {
        try {
            await database.runAsync("DELETE FROM TB_IMPRESSORAS WHERE id = 1");
        } catch (error) {
            console.error("Erro ao remover impressora:", error);
            throw error;
        }
    }

    return { setPrinter, getPrinter, removePrinter };
}
