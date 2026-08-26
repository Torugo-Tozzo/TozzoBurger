import { useSQLiteContext } from "expo-sqlite";
import { SaleItem, Sale } from "./types/Sale";
import { generateUUID } from "./utils/uuid";
import { markChanged } from "./tableWatermark";
import type { SalesFilters } from "../services/sales";
import { buildLocalSalesQuery } from "./salesQuery";

type SaleWithProducts = Sale & { products: string[] };
type RecentSalesGrouped = Record<string, SaleWithProducts[]>;
type RecentSalesPaginated = {
    sales: SaleWithProducts[];
    closing: number;
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNextPage: boolean;
    };
};

export function useSaleDatabase() {
    const database = useSQLiteContext();

    async function createSale(items: { productId: string; quantity: number }[], customerName?: string, createdBy?: string | number | null, createdByName?: string | null) {
        const statementVenda = await database.prepareAsync(
            "INSERT INTO TB_SALES (id, total, soldAt, customerName, updated_at, sync_status, createdBy, createdByName) VALUES ($id, $total, $soldAt, $customerName, $updated_at, $sync_status, $createdBy, $createdByName)"
        );

        try {
            const total = await calculateTotal(items);
            const soldAt = new Date().toISOString();

                        const saleId = generateUUID();
                        const updatedAt = Date.now();

                        await statementVenda.executeAsync({
                            $id: saleId,
                            $total: total,
                            $soldAt: soldAt,
                            $customerName: customerName ?? null,
                            $updated_at: updatedAt,
                            $sync_status: 'pending',
                            $createdBy: createdBy != null ? String(createdBy) : null,
                            $createdByName: createdByName ?? null,
                        });

                        for (const { productId, quantity } of items) {
                            const relId = generateUUID();
                            const relStmt = await database.prepareAsync(
                                'INSERT INTO RL_SALE_PRODUCT (id, saleId, productId, quantity) VALUES ($id, $saleId, $productId, $quantity)'
                            );
                            try {
                                await relStmt.executeAsync({ $id: relId, $saleId: saleId, $productId: productId, $quantity: quantity });
                            } finally {
                                await relStmt.finalizeAsync();
                            }
                        }

                        markChanged('sales')

                        return { saleId };
        } catch (error) {
            throw error;
        } finally {
            await statementVenda.finalizeAsync();
        }
    }

        async function createFromSync(data: Sale & { products?: SaleItem[] }) {
            const statementVenda = await database.prepareAsync(
                "INSERT INTO TB_SALES (id, total, soldAt, customerName, updated_at, sync_status) VALUES ($id, $total, $soldAt, $customerName, $updated_at, $sync_status)"
            );

            try {
                if (!data.id) throw new Error('ID inválido');

                await statementVenda.executeAsync({
                    $id: data.id,
                    $total: data.total,
                    $soldAt: data.soldAt,
                    $customerName: data.customerName ?? null,
                    $updated_at: (data as any).updated_at ?? Date.now(),
                    $sync_status: 'synced',
                });

                if (Array.isArray(data.products)) {
                    for (const { productId, quantity } of data.products) {
                        const relId = generateUUID();
                        const relStmt = await database.prepareAsync(
                            'INSERT INTO RL_SALE_PRODUCT (id, saleId, productId, quantity) VALUES ($id, $saleId, $productId, $quantity)'
                        );
                        try {
                            await relStmt.executeAsync({ $id: relId, $saleId: data.id, $productId: productId, $quantity: quantity });
                        } finally {
                            await relStmt.finalizeAsync();
                        }
                    }
                }

                markChanged('sales')

                return { saleId: data.id };
            } catch (error) {
                throw error;
            } finally {
                await statementVenda.finalizeAsync();
            }
        }

    async function getSaleById(saleId: string) {
        try {
            const sale = await database.getFirstAsync<Sale>(
                "SELECT * FROM TB_SALES WHERE id = ?",
                [saleId]
            );

            if (!sale) {
                throw new Error(`Venda com ID ${saleId} não encontrada.`);
            }

            const items = await database.getAllAsync<SaleItem>(
                "SELECT productId, quantity FROM RL_SALE_PRODUCT WHERE saleId = ?",
                [saleId]
            );

            return { ...sale, items };
        } catch (error) {
            throw error;
        }
    }


    async function removeSale(saleId: string) {
        try {
            const now = Date.now();
            const stmt = await database.prepareAsync(
                'UPDATE TB_SALES SET isCancelled = 1, deleted_at = $deletedAt, updated_at = $updatedAt, sync_status = $syncStatus WHERE id = $id'
            );
            try {
                await stmt.executeAsync({ $deletedAt: now, $updatedAt: now, $syncStatus: 'pending', $id: saleId });
            } finally {
                await stmt.finalizeAsync();
            }

            markChanged('sales')
        } catch (error) {
            throw error;
        }
    }    

    async function calculateTotal(
        items: { productId: string; quantity: number }[]
    ): Promise<number> {
        let total = 0;

        for (const { productId, quantity } of items) {
            const product = await database.getFirstAsync<{
                price: number;
            }>("SELECT price FROM TB_PRODUCTS WHERE id = ?", [productId]);

            if (product) {
                total += product.price * quantity;
            }
        }

        return total;
    }

    async function listRecentSales(): Promise<RecentSalesGrouped>;
    async function listRecentSales(filters: SalesFilters): Promise<RecentSalesPaginated>;
    async function listRecentSales(filters?: SalesFilters): Promise<RecentSalesGrouped | RecentSalesPaginated> {
        try {
            const query = buildLocalSalesQuery(filters ?? {});
            const sales = await database.getAllAsync<Sale>(query.select, query.params);
            const totalResult = await database.getFirstAsync<{ total: number }>(query.count, query.countParams);
            const fechamentoResult = await database.getFirstAsync<{ fechamento: number }>(query.sum, query.sumParams);
            const total = Number(totalResult?.total ?? 0);
            const closing = Number(fechamentoResult?.fechamento ?? 0);
            const totalPages = total === 0 ? 0 : Math.ceil(total / query.limit);
    
            const salesWithProducts = await Promise.all(
                sales.map(async (sale) => {
                    const productRows = await database.getAllAsync<{ name: string; quantity: number }>(
                        `SELECT P.name, VP.quantity 
                         FROM RL_SALE_PRODUCT VP
                         JOIN TB_PRODUCTS P ON VP.productId = P.id
                         WHERE VP.saleId = ?`,
                        [sale.id]
                    );
    
                    const productNames = productRows.map(
                        (p) => `( ${p.quantity}x ) ${p.name}`
                    );
    
                    // Limita os nomes dos produtos a 3 e adiciona "..." se houver mais
                    const displayedProducts =
                        productNames.length > 3
                            ? [...productNames.slice(0, 3), "..."]
                            : productNames;
    
                    return { ...sale, products: displayedProducts };
                })
            );

            if (filters === undefined) {
                const salesByDate: RecentSalesGrouped = {};
                for (const sale of salesWithProducts) {
                    const date = new Date(sale.soldAt).toLocaleDateString();
                    if (!salesByDate[date]) salesByDate[date] = [];
                    salesByDate[date].push(sale);
                }
                return salesByDate;
            }

            return {
                sales: salesWithProducts,
                closing,
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
    
    async function listSalesByDay(data: string) {
        try {
            const inicioDoDia = `${data}T00:00:00.000Z`;
            const fimDoDia = `${data}T23:59:59.999Z`;
    
            const sales = await database.getAllAsync<Sale>(
                "SELECT * FROM TB_SALES WHERE soldAt BETWEEN ? AND ? AND (deleted_at IS NULL) AND (isCancelled IS NULL OR isCancelled = 0)",
                [inicioDoDia, fimDoDia]
            );
    
            const salesWithProducts = await Promise.all(
                sales.map(async (sale) => {
                    const productRows = await database.getAllAsync<{ name: string; quantity: number }>(
                        `SELECT P.name, VP.quantity 
                         FROM RL_SALE_PRODUCT VP
                         JOIN TB_PRODUCTS P ON VP.productId = P.id
                         WHERE VP.saleId = ?`,
                        [sale.id]
                    );
    
                    const productNames = productRows.map(
                        (p) => `( ${p.quantity}x ) ${p.name}`
                    );
    
                    // Limita os nomes dos produtos a 3 e adiciona "..." se houver mais
                    const displayedProducts =
                        productNames.length > 3
                            ? [...productNames.slice(0, 3), "..."]
                            : productNames;
    
                    return { ...sale, products: displayedProducts };
                })
            );
    
            return salesWithProducts; // Retorna vendas do dia com os nomes dos produtos
        } catch (error) {
            throw error;
        }
    }    

    async function getSalesReportByPeriod(
        startDate: string,
        endDate: string,
        productTypeId?: string
    ) {
        try {
            const startDateObj = new Date(startDate);
            startDateObj.setHours(0, 0, 0, 0);
            const startPeriod = startDateObj.toISOString();
            
            // Data final termina à meia-noite do dia seguinte
            const endDateObj = new Date(endDate);
            endDateObj.setHours(23, 59, 59, 999);
            const endPeriod = endDateObj.toISOString();
            
            // Monta a query base usando comparações diretas em vez de BETWEEN
            let query = `
              SELECT 
                P.id, P.name, P.price, SUM(VP.quantity) as totalVendido
              FROM 
                RL_SALE_PRODUCT VP
              JOIN TB_SALES V ON VP.saleId = V.id
              JOIN TB_PRODUCTS P ON VP.productId = P.id
              WHERE 
                V.soldAt >= ? AND V.soldAt <= ?
                AND V.isCancelled IS NOT TRUE
            `;
            
            const params: any[] = [startPeriod, endPeriod];
            
            if (productTypeId && productTypeId !== '' && productTypeId !== '100') {
              query += ` AND P.productTypeId = ?`;
              params.push(Number(productTypeId));
            }
            
            query += ` GROUP BY P.id ORDER BY totalVendido DESC`;
            
                        const resultado = await database.getAllAsync<{
                            id: string;
                            name: string;
                            totalVendido: number;
                            price: number;
                        }>(query, params);
            
            return resultado;
        } catch (error) {
            console.error('ERRO DETALHADO:', error);
            throw error;
        }
    }      

    return { 
        createSale,
        createFromSync,
        removeSale,
        listRecentSales,
        getSaleById,
        listSalesByDay,
        getSalesReportByPeriod,
        /** @deprecated Use the English sale methods. */
        createVenda: createSale,
        removeVenda: removeSale,
        listVendasRecentes: listRecentSales,
        getVendaById: getSaleById,
        listVendasPorDia: listSalesByDay,
        getRelatorioPorPeriodo: getSalesReportByPeriod,
    };
}
