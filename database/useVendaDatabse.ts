import { useSQLiteContext } from "expo-sqlite";

export type VendaDatabase = {
    id: number;
    total: number;
    horario: string;
    cliente?: string;
    excluida: boolean;
};

export type VendaProduto = {
    id?: number;
    vendaId: number;
    produtoId: number;
    quantidade: number;
};

export function useVendasDatabase() {
    const database = useSQLiteContext();

    async function createVenda(produtos: { produtoId: number; quantidade: number }[], cliente?: string) {
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
                `UPDATE TB_VENDAS SET excluida = TRUE WHERE id = ${vendaId}`
            );
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
            seteDiasAtras.setDate(seteDiasAtras.getDate() - 3);
            const seteDiasAtrasISO = seteDiasAtras.toISOString();
    
            const vendas = await database.getAllAsync<VendaDatabase>(
                `SELECT * FROM TB_VENDAS WHERE horario >= ? ORDER BY horario DESC`,
                [seteDiasAtrasISO]
            );
    
            const vendasComProdutos = await Promise.all(
                vendas.map(async (venda) => {
                    const produtos = await database.getAllAsync<{ nome: string; quantidade: number }>(
                        `SELECT P.nome, VP.quantidade 
                         FROM RL_VENDA_PRODUTO VP
                         JOIN TB_PRODUTOS P ON VP.produtoId = P.id
                         WHERE VP.vendaId = ?`,
                        [venda.id]
                    );
    
                    const nomesProdutos = produtos.map(
                        (p) => `( ${p.quantidade}x ) ${p.nome}`
                    );
    
                    // Limita os nomes dos produtos a 3 e adiciona "..." se houver mais
                    const produtosExibidos =
                        nomesProdutos.length > 3
                            ? [...nomesProdutos.slice(0, 3), "..."]
                            : nomesProdutos;
    
                    return { ...venda, produtos: produtosExibidos };
                })
            );
    
            const vendasPorData: Record<string, (VendaDatabase & { produtos: string[] })[]> = {};
    
            for (const venda of vendasComProdutos) {
                const dataVenda = new Date(venda.horario).toLocaleDateString(); // Agrupamento por data
                if (!vendasPorData[dataVenda]) {
                    vendasPorData[dataVenda] = [];
                }
                vendasPorData[dataVenda].push(venda);
            }
    
            return vendasPorData; // Retorna vendas agrupadas por data com produtos
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
    
            const vendasComProdutos = await Promise.all(
                vendas.map(async (venda) => {
                    const produtos = await database.getAllAsync<{ nome: string; quantidade: number }>(
                        `SELECT P.nome, VP.quantidade 
                         FROM RL_VENDA_PRODUTO VP
                         JOIN TB_PRODUTOS P ON VP.produtoId = P.id
                         WHERE VP.vendaId = ?`,
                        [venda.id]
                    );
    
                    const nomesProdutos = produtos.map(
                        (p) => `( ${p.quantidade}x ) ${p.nome}`
                    );
    
                    // Limita os nomes dos produtos a 3 e adiciona "..." se houver mais
                    const produtosExibidos =
                        nomesProdutos.length > 3
                            ? [...nomesProdutos.slice(0, 3), "..."]
                            : nomesProdutos;
    
                    return { ...venda, produtos: produtosExibidos };
                })
            );
    
            return vendasComProdutos; // Retorna vendas do dia com os nomes dos produtos
        } catch (error) {
            throw error;
        }
    }    

    async function getRelatorioPorPeriodo(
        dataInicial: string,
        dataFinal: string,
        tipoProdutoId?: string
    ) {
        try {
            const dataInicialObj = new Date(dataInicial);
            dataInicialObj.setHours(0, 0, 0, 0);
            const inicioPeriodo = dataInicialObj.toISOString();
            
            // Data final termina à meia-noite do dia seguinte
            const dataFinalObj = new Date(dataFinal);
            dataFinalObj.setHours(23, 59, 59, 999);
            const fimPeriodo = dataFinalObj.toISOString();
            
            // Monta a query base usando comparações diretas em vez de BETWEEN
            let query = `
              SELECT 
                P.id, P.nome, P.preco, SUM(VP.quantidade) as totalVendido
              FROM 
                RL_VENDA_PRODUTO VP
              JOIN TB_VENDAS V ON VP.vendaId = V.id
              JOIN TB_PRODUTOS P ON VP.produtoId = P.id
              WHERE 
                V.horario >= ? AND V.horario <= ?
                AND V.excluida IS NOT TRUE
            `;
            
            const params: any[] = [inicioPeriodo, fimPeriodo];
            
            if (tipoProdutoId && tipoProdutoId !== '' && tipoProdutoId !== '100') {
              query += ` AND P.tipoProdutoId = ?`;
              params.push(Number(tipoProdutoId));
            }
            
            query += ` GROUP BY P.id ORDER BY totalVendido DESC`;
            
            const resultado = await database.getAllAsync<{
              id: number;
              nome: string;
              totalVendido: number;
              preco: number;
            }>(query, params);
            
            return resultado;
        } catch (error) {
            console.error('ERRO DETALHADO:', error);
            throw error;
        }
    }      

    return { 
        createVenda, 
        removeVenda, 
        listVendasRecentes, 
        getVendaById, 
        listVendasPorDia,
        getRelatorioPorPeriodo 
    };
}