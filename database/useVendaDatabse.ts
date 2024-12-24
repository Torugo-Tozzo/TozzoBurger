import { useSQLiteContext } from "expo-sqlite";

export type VendaDatabase = {
    id: number;
    total: number;
    horario: string;
    cliente?: string;
};

export type VendaProduto = {
    id?: number;
    vendaId: number;
    produtoId: number;
    quantidade: number;
};

export function useVendasDatabase() {
    const database = useSQLiteContext();

    async function createVenda( produtos: { produtoId: number; quantidade: number }[], cliente?: string) {
        const statementVenda = await database.prepareAsync(
            "INSERT INTO TB_VENDAS (total, horario, cliente) VALUES ($total, $horario, $cliente)"
        );

        try {
            const total = await calculateTotal(produtos);
            const horario = new Date().toISOString();

            const vendaResult = await statementVenda.executeAsync({
                $total: total,
                $horario: horario,
                $cliente: cliente || "Não informado",
            });

            const vendaId = vendaResult.lastInsertRowId;

            for (const { produtoId, quantidade } of produtos) {
                await database.execAsync(`
                  INSERT INTO RL_VENDA_PRODUTO (vendaId, produtoId, quantidade)
                  VALUES (${vendaId}, ${produtoId}, ${quantidade})
                `);
            }

            return { vendaId };
        } catch (error) {
            throw error;
        } finally {
            await statementVenda.finalizeAsync();
        }
    }

    async function getVendaById(vendaId: number) {
        try {
            const venda = await database.getFirstAsync<VendaDatabase>(
                "SELECT * FROM TB_VENDAS WHERE id = ?",
                [vendaId]
            );
    
            if (!venda) {
                throw new Error(`Venda com ID ${vendaId} não encontrada.`);
            }
    
            const produtos = await database.getAllAsync<VendaProduto>(
                "SELECT produtoId, quantidade FROM RL_VENDA_PRODUTO WHERE vendaId = ?",
                [vendaId]
            );
    
            return { ...venda, produtos };
        } catch (error) {
            throw error;
        }
    }
    

    async function removeVenda(vendaId: number) {
        try {
            await database.execAsync(
                `DELETE FROM RL_VENDA_PRODUTO WHERE vendaId = ${vendaId}`
            );
            await database.execAsync(`DELETE FROM TB_VENDAS WHERE id = ${vendaId}`);
        } catch (error) {
            throw error;
        }
    }

    async function calculateTotal(
        produtos: { produtoId: number; quantidade: number }[]
    ): Promise<number> {
        let total = 0;

        for (const { produtoId, quantidade } of produtos) {
            const produto = await database.getFirstAsync<{
                preco: number;
            }>("SELECT preco FROM TB_PRODUTOS WHERE id = ?", [produtoId]);

            if (produto) {
                total += produto.preco * quantidade;
            }
        }

        return total;
    }

    async function listVendasRecentes() {
        try {
            const seteDiasAtras = new Date();
            seteDiasAtras.setDate(seteDiasAtras.getDate() - 5);
            const seteDiasAtrasISO = seteDiasAtras.toISOString();
    
            const vendas = await database.getAllAsync<VendaDatabase>(
                `SELECT * FROM TB_VENDAS WHERE horario >= ? ORDER BY horario DESC`,
                [seteDiasAtrasISO]
            );
    
            const vendasPorData: Record<string, VendaDatabase[]> = {};
    
            for (const venda of vendas) {
                const dataVenda = new Date(venda.horario).toLocaleDateString(); // Agrupamento por data
                if (!vendasPorData[dataVenda]) {
                    vendasPorData[dataVenda] = [];
                }
                vendasPorData[dataVenda].push(venda);
            }
    
            return vendasPorData; // Retorna vendas agrupadas por data
        } catch (error) {
            throw error;
        }
    }
    
    async function listVendasPorDia(data: string) {
        try {
            const inicioDoDia = `${data}T00:00:00.000Z`;
            const fimDoDia = `${data}T23:59:59.999Z`;

            const vendas = await database.getAllAsync<VendaDatabase>(
                "SELECT * FROM TB_VENDAS WHERE horario BETWEEN ? AND ?",
                [inicioDoDia, fimDoDia]
            );

            return vendas;
        } catch (error) {
            throw error;
        }
    }

    return { createVenda, removeVenda, listVendasRecentes, getVendaById, listVendasPorDia };
}