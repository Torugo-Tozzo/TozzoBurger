import { useSQLiteContext } from "expo-sqlite";
import { VendaProduto, VendaDatabase } from "./types/Venda";
import { generateUUID } from "./utils/uuid";
import { markChanged } from "./tableWatermark";
import type { VendasFilters } from "../services/vendas";
import { buildLocalVendasQuery } from "./vendasQuery";

type VendaComProdutos = VendaDatabase & { produtos: string[] };
type VendasRecentesAgrupadas = Record<string, VendaComProdutos[]>;
type VendasRecentesPaginadas = {
    vendas: VendaComProdutos[];
    fechamento: number;
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNextPage: boolean;
    };
};

export function useVendasDatabase() {
    const database = useSQLiteContext();

    async function createVenda(produtos: { produtoId: string; quantidade: number }[], cliente?: string, criadoPor?: string | number | null, criadoPorNome?: string | null) {
        const statementVenda = await database.prepareAsync(
            "INSERT INTO TB_VENDAS (id, total, horario, cliente, updated_at, sync_status, criado_por, criado_por_nome) VALUES ($id, $total, $horario, $cliente, $updated_at, $sync_status, $criado_por, $criado_por_nome)"
        );

        try {
            const total = await calculateTotal(produtos);
            const horario = new Date().toISOString();

                        const vendaId = generateUUID();
                        const updatedAt = Date.now();

                        await statementVenda.executeAsync({
                            $id: vendaId,
                            $total: total,
                            $horario: horario,
                            $cliente: cliente ?? null,
                            $updated_at: updatedAt,
                            $sync_status: 'pending',
                            $criado_por: criadoPor != null ? String(criadoPor) : null,
                            $criado_por_nome: criadoPorNome ?? null,
                        });

                        for (const { produtoId, quantidade } of produtos) {
                            const relId = generateUUID();
                            const relStmt = await database.prepareAsync(
                                'INSERT INTO RL_VENDA_PRODUTO (id, vendaId, produtoId, quantidade) VALUES ($id, $vendaId, $produtoId, $quantidade)'
                            );
                            try {
                                await relStmt.executeAsync({ $id: relId, $vendaId: vendaId, $produtoId: produtoId, $quantidade: quantidade });
                            } finally {
                                await relStmt.finalizeAsync();
                            }
                        }

                        markChanged('vendas')

                        return { vendaId };
        } catch (error) {
            throw error;
        } finally {
            await statementVenda.finalizeAsync();
        }
    }

        async function createFromSync(data: VendaDatabase & { produtos?: VendaProduto[] }) {
            const statementVenda = await database.prepareAsync(
                "INSERT INTO TB_VENDAS (id, total, horario, cliente, updated_at, sync_status) VALUES ($id, $total, $horario, $cliente, $updated_at, $sync_status)"
            );

            try {
                if (!data.id) throw new Error('ID inválido');

                await statementVenda.executeAsync({
                    $id: data.id,
                    $total: data.total,
                    $horario: data.horario,
                    $cliente: data.cliente ?? null,
                    $updated_at: (data as any).updated_at ?? Date.now(),
                    $sync_status: 'synced',
                });

                if (Array.isArray(data.produtos)) {
                    for (const { produtoId, quantidade } of data.produtos) {
                        const relId = generateUUID();
                        const relStmt = await database.prepareAsync(
                            'INSERT INTO RL_VENDA_PRODUTO (id, vendaId, produtoId, quantidade) VALUES ($id, $vendaId, $produtoId, $quantidade)'
                        );
                        try {
                            await relStmt.executeAsync({ $id: relId, $vendaId: data.id, $produtoId: produtoId, $quantidade: quantidade });
                        } finally {
                            await relStmt.finalizeAsync();
                        }
                    }
                }

                markChanged('vendas')

                return { vendaId: data.id };
            } catch (error) {
                throw error;
            } finally {
                await statementVenda.finalizeAsync();
            }
        }

    async function getVendaById(vendaId: string) {
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


    async function removeVenda(vendaId: string) {
        try {
            const now = Date.now();
            const stmt = await database.prepareAsync(
                'UPDATE TB_VENDAS SET excluida = 1, deleted_at = $deletedAt, updated_at = $updatedAt, sync_status = $syncStatus WHERE id = $id'
            );
            try {
                await stmt.executeAsync({ $deletedAt: now, $updatedAt: now, $syncStatus: 'pending', $id: vendaId });
            } finally {
                await stmt.finalizeAsync();
            }

            markChanged('vendas')
        } catch (error) {
            throw error;
        }
    }    

    async function calculateTotal(
        produtos: { produtoId: string; quantidade: number }[]
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

    async function listVendasRecentes(): Promise<VendasRecentesAgrupadas>;
    async function listVendasRecentes(filters: VendasFilters): Promise<VendasRecentesPaginadas>;
    async function listVendasRecentes(filters?: VendasFilters): Promise<VendasRecentesAgrupadas | VendasRecentesPaginadas> {
        try {
            const query = buildLocalVendasQuery(filters ?? {});
            const vendas = await database.getAllAsync<VendaDatabase>(query.select, query.params);
            const totalResult = await database.getFirstAsync<{ total: number }>(query.count, query.countParams);
            const fechamentoResult = await database.getFirstAsync<{ fechamento: number }>(query.sum, query.sumParams);
            const total = Number(totalResult?.total ?? 0);
            const fechamento = Number(fechamentoResult?.fechamento ?? 0);
            const totalPages = total === 0 ? 0 : Math.ceil(total / query.limit);
    
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

            if (filters === undefined) {
                const vendasPorData: VendasRecentesAgrupadas = {};
                for (const venda of vendasComProdutos) {
                    const dataVenda = new Date(venda.horario).toLocaleDateString();
                    if (!vendasPorData[dataVenda]) vendasPorData[dataVenda] = [];
                    vendasPorData[dataVenda].push(venda);
                }
                return vendasPorData;
            }

            return {
                vendas: vendasComProdutos,
                fechamento,
                pagination: {
                    page: query.page,
                    limit: query.limit,
                    total,
                    totalPages,
                    hasNextPage: query.page < totalPages,
                },
            };
        } catch (error) {
            throw error;
        }
    }
    
    async function listVendasPorDia(data: string) {
        try {
            const inicioDoDia = `${data}T00:00:00.000Z`;
            const fimDoDia = `${data}T23:59:59.999Z`;
    
            const vendas = await database.getAllAsync<VendaDatabase>(
                "SELECT * FROM TB_VENDAS WHERE horario BETWEEN ? AND ? AND (deleted_at IS NULL) AND (excluida IS NULL OR excluida = 0)",
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
                            id: string;
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
        createFromSync,
        removeVenda, 
        listVendasRecentes, 
        getVendaById, 
        listVendasPorDia,
        getRelatorioPorPeriodo 
    };
}
