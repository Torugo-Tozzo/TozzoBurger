import { Q } from '@nozbe/watermelondb';

import { useAuth } from '../context/AuthContext';
import type { Sale as SaleData, SaleItem as SaleItemData } from './types/Sale';
import { markChanged } from './tableWatermark';
import { generateUUID } from './utils/uuid';
import {
  buildLocalSalesQuery,
  localPeriodBoundary,
  type LocalSalesQuery,
} from './salesQuery';
import { DEFAULT_SALES_LIMIT, type SalesFilters } from '../services/sales';
import { database } from './watermelon/database';
import OrderModel from './watermelon/models/Order';
import OrderItemModel from './watermelon/models/OrderItem';
import ProductModel from './watermelon/models/Product';
import SaleModel from './watermelon/models/Sale';
import SaleItemModel from './watermelon/models/SaleItem';
import UserModel from './watermelon/models/User';

type SaleWithProducts = SaleData & { products: string[] };
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

type SaleItemInput = {
  productId: string;
  quantity: number;
  unitPriceAtSale?: number;
};

type SaleSyncInput = SaleData & {
  items?: SaleItemData[];
  products?: SaleItemData[];
  created_at?: number | string | Date;
  sold_at?: number | string | Date;
  updatedAt?: number | string | Date;
  establishment_id?: string | number | null;
  seller_id?: string | number | null;
  order_id?: string | null;
  is_cancelled?: boolean | null;
  created_by_name?: string | null;
};

type SaleProductRow = {
  name: string;
  quantity: number;
};

const SALES_SUMMARY_PAGE_SIZE = 100;

function normalizeEstablishmentId(value: string | number | null | undefined): string | null {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'string'
    ? Number(value.trim().replace(',', '.'))
    : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function epoch(value: unknown, fallback: number): number {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : fallback;
  }

  if (typeof value === 'number' && Number.isFinite(value)) return value;

  if (typeof value === 'string') {
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) return timestamp;
  }

  return fallback;
}

function saleCollection() {
  return database.get<SaleModel>('sales');
}

function saleItemCollection() {
  return database.get<SaleItemModel>('sale_items');
}

function orderCollection() {
  return database.get<OrderModel>('orders');
}

function orderItemCollection() {
  return database.get<OrderItemModel>('order_items');
}

function productCollection() {
  return database.get<ProductModel>('products');
}

function userCollection() {
  return database.get<UserModel>('users');
}

async function findSale(id: string, establishmentId: string | null): Promise<SaleModel | null> {
  if (!establishmentId) return null;

  const [sale] = await saleCollection()
    .query(Q.where('id', id), Q.where('establishment_id', establishmentId))
    .fetch();
  return sale ?? null;
}

async function findOrder(id: string, establishmentId: string | null): Promise<OrderModel | null> {
  if (!establishmentId) return null;

  const [order] = await orderCollection()
    .query(Q.where('id', id), Q.where('establishment_id', establishmentId))
    .fetch();
  return order ?? null;
}

async function findProduct(id: string, establishmentId: string | null): Promise<ProductModel | null> {
  if (!establishmentId) return null;
  const normalizedId = String(id);

  const [productById] = await productCollection()
    .query(Q.where('id', normalizedId), Q.where('establishment_id', establishmentId))
    .fetch();
  if (productById) return productById;

  const [productBySourceId] = await productCollection()
    .query(Q.where('source_product_id', normalizedId), Q.where('establishment_id', establishmentId))
    .fetch();
  return productBySourceId ?? null;
}

async function fetchSaleItems(saleId: string, establishmentId: string): Promise<SaleItemModel[]> {
  return saleItemCollection()
    .query(
      Q.where('sale_id', saleId),
      Q.on('sales', Q.where('establishment_id', establishmentId)),
    )
    .fetch();
}

async function fetchOrderItems(orderId: string, establishmentId: string): Promise<OrderItemModel[]> {
  return orderItemCollection()
    .query(
      Q.where('order_id', orderId),
      Q.on('orders', Q.where('establishment_id', establishmentId)),
    )
    .fetch();
}

async function sellerName(sellerId: string, establishmentId: string): Promise<string | null> {
  if (!sellerId) return null;

  const [seller] = await userCollection()
    .query(Q.where('id', sellerId), Q.where('establishment_id', establishmentId))
    .fetch();
  return seller?.name ?? null;
}

async function createdByNameForSale(sale: SaleModel, establishmentId: string): Promise<string | null> {
  if (sale.createdByName != null) return sale.createdByName;
  return sellerName(sale.sellerId, establishmentId);
}

function toSaleData(sale: SaleModel, createdByName: string | null): SaleData {
  return {
    id: sale.id,
    total: sale.total,
    soldAt: sale.soldAt.toISOString(),
    customerName: sale.customerName,
    isCancelled: sale.isCancelled,
    establishmentId: sale.establishmentId,
    sellerId: sale.sellerId || null,
    orderId: sale.orderId,
    updated_at: sale.updatedAt.getTime(),
    deleted_at: null,
    sync_status: sale.syncStatus === 'synced' ? 'synced' : 'pending',
    createdBy: sale.sellerId || null,
    createdByName: sale.createdByName ?? createdByName,
  };
}

function toSaleItemData(item: SaleItemModel): SaleItemData {
  return {
    id: item.id,
    saleId: item.saleId,
    productId: item.productId,
    quantity: item.quantity,
    unitPriceAtSale: item.unitPriceAtSale,
  };
}

async function productNamesForItems(
  items: Array<{ productId: string; quantity: number }>,
  establishmentId: string,
): Promise<SaleProductRow[]> {
  const rows = await Promise.all(
    items.map(async (item) => {
      const product = await findProduct(item.productId, establishmentId);
      return product ? { name: product.name, quantity: item.quantity } : null;
    }),
  );

  return rows.filter((row): row is SaleProductRow => row !== null);
}

function displayedProducts(products: SaleProductRow[]): string[] {
  const productNames = products.map((product) => `( ${product.quantity}x ) ${product.name}`);
  return productNames.length > 3
    ? [...productNames.slice(0, 3), '...']
    : productNames;
}

async function toSaleWithProducts(
  sale: SaleModel,
  establishmentId: string,
): Promise<SaleWithProducts> {
  const [items, createdByName] = await Promise.all([
    fetchSaleItems(sale.id, establishmentId),
    createdByNameForSale(sale, establishmentId),
  ]);
  const products = await productNamesForItems(items, establishmentId);

  return {
    ...toSaleData(sale, createdByName),
    products: displayedProducts(products),
  };
}

function emptyPaginatedSales(page: number, limit: number): RecentSalesPaginated {
  return {
    sales: [],
    closing: 0,
    pagination: {
      page,
      limit,
      total: 0,
      totalPages: 0,
      hasNextPage: false,
    },
  };
}

async function fetchSales(query: LocalSalesQuery): Promise<SaleModel[]> {
  return saleCollection()
    .query(
      ...query.clauses,
      Q.sortBy('sold_at', Q.desc),
      Q.sortBy('id', Q.desc),
    )
    .fetch();
}

async function fetchSalesWithoutPagination(query: LocalSalesQuery): Promise<SaleModel[]> {
  return saleCollection()
    .query(
      ...query.baseClauses,
      Q.sortBy('sold_at', Q.desc),
      Q.sortBy('id', Q.desc),
    )
    .fetch();
}

async function fetchSalesPage(
  query: LocalSalesQuery,
  page: number,
  limit: number,
): Promise<SaleModel[]> {
  return saleCollection()
    .query(
      ...query.baseClauses,
      Q.sortBy('sold_at', Q.desc),
      Q.sortBy('id', Q.desc),
      Q.take(limit),
      Q.skip((page - 1) * limit),
    )
    .fetch();
}

async function summarizeSales(query: LocalSalesQuery): Promise<{ total: number; closing: number }> {
  let page = 1;
  let total = 0;
  let closing = 0;

  while (true) {
    const salesPage = await fetchSalesPage(query, page, SALES_SUMMARY_PAGE_SIZE);
    const matchingSales = salesPage.filter((sale) => query.matchesTime(sale.soldAt));
    total += matchingSales.length;
    closing += matchingSales.reduce((sum, sale) => sum + sale.total, 0);

    if (salesPage.length < SALES_SUMMARY_PAGE_SIZE) break;
    page += 1;
  }

  return { total, closing };
}

async function fetchAllSales(query: LocalSalesQuery): Promise<SaleModel[]> {
  const allSales: SaleModel[] = [];
  let page = 1;

  while (true) {
    const salesPage = await fetchSalesPage(query, page, SALES_SUMMARY_PAGE_SIZE);
    allSales.push(...salesPage.filter((sale) => query.matchesTime(sale.soldAt)));

    if (salesPage.length < SALES_SUMMARY_PAGE_SIZE) break;
    page += 1;
  }

  return allSales;
}

export function useSaleDatabase() {
  const { user } = useAuth();
  const currentEstablishmentId = normalizeEstablishmentId(user?.establishmentId);

  async function createSale(
    items: SaleItemInput[],
    customerName?: string,
    createdBy?: string | number | null,
    createdByName?: string | null,
  ) {
    if (!currentEstablishmentId) {
      throw new Error('Cannot create a sale without an authenticated establishment');
    }

    const products = await Promise.all(items.map(async (item) => {
      const product = await findProduct(String(item.productId), currentEstablishmentId);
      if (!product) throw new Error(`Produto ${item.productId} não encontrado`);
      return { item, product };
    }));
    const total = products.reduce(
      (sum, { item, product }) => sum + product.price * Number(item.quantity),
      0,
    );
    const now = new Date();
    const sellerId = createdBy == null ? '' : String(createdBy);

    const sale = await database.write(async () => {
      const createdSale = await saleCollection().create((record) => {
        record.total = total;
        record.soldAt = now;
        record.customerName = customerName ?? null;
        record.createdByName = createdByName ?? null;
        record.isCancelled = false;
        record.establishmentId = currentEstablishmentId;
        record.sellerId = sellerId;
        record.orderId = null;
        record.createdAt = now;
        record.updatedAt = now;
      });

      for (const { item, product } of products) {
        await saleItemCollection().create((record) => {
          record.quantity = Number(item.quantity);
          record.saleId = createdSale.id;
          record.sale.set(createdSale);
          record.productId = product.id;
          record.product.set(product);
          record.unitPriceAtSale = product.price;
          record.createdAt = now;
          record.updatedAt = now;
        });
      }

      return createdSale;
    });

    markChanged('sales');
    return { saleId: sale.id };
  }

  async function createSaleFromOrder(
    orderId: string,
    customerName?: string | null,
    createdBy?: string | number | null,
    createdByName?: string | null,
  ) {
    if (!currentEstablishmentId) {
      throw new Error('Cannot create a sale without an authenticated establishment');
    }

    const sale = await database.write(async () => {
      const order = await findOrder(String(orderId), currentEstablishmentId);
      if (!order) throw new Error(`Pedido com ID ${orderId} não encontrado.`);
      if (!order.isOpen) throw new Error(`Pedido com ID ${orderId} já está fechado.`);

      const items = await fetchOrderItems(order.id, currentEstablishmentId);
      const products = await Promise.all(items.map(async (item) => {
        const product = await findProduct(item.productId, currentEstablishmentId);
        if (!product) throw new Error(`Produto ${item.productId} não encontrado`);
        const unitPriceAtSale = Number.isFinite(item.unitPriceAtOrder)
          ? item.unitPriceAtOrder
          : product.price;
        return { item, product, unitPriceAtSale };
      }));
      const total = products.reduce(
        (sum, { item, unitPriceAtSale }) => sum + Number(item.quantity) * unitPriceAtSale,
        0,
      );
      const now = new Date();
      const sellerId = order.sellerId || (createdBy == null ? '' : String(createdBy));

      const createdSale = await saleCollection().create((record) => {
        record.total = total;
        record.soldAt = now;
        record.customerName = customerName === undefined ? order.customerName : customerName;
        record.createdByName = createdByName ?? null;
        record.isCancelled = false;
        record.establishmentId = currentEstablishmentId;
        record.sellerId = sellerId;
        record.orderId = order.id;
        record.createdAt = now;
        record.updatedAt = now;
      });

      for (const { item, product, unitPriceAtSale } of products) {
        await saleItemCollection().create((record) => {
          record.quantity = item.quantity;
          record.saleId = createdSale.id;
          record.sale.set(createdSale);
          record.productId = product.id;
          record.product.set(product);
          record.unitPriceAtSale = unitPriceAtSale;
          record.createdAt = now;
          record.updatedAt = now;
        });
      }

      await order.update((record) => {
        record.isOpen = false;
        record.updatedAt = now;
      });

      return createdSale;
    });

    markChanged('sales');
    markChanged('orders');
    return { saleId: sale.id };
  }

  async function createFromSync(data: SaleSyncInput) {
    if (!currentEstablishmentId) {
      throw new Error('Cannot sync a sale without an authenticated establishment');
    }

    const raw = data as SaleSyncInput;
    const incomingEstablishmentId = normalizeEstablishmentId(
      raw.establishmentId ?? raw.establishment_id,
    );
    if (incomingEstablishmentId && incomingEstablishmentId !== currentEstablishmentId) {
      throw new Error('Cannot sync a sale from another establishment');
    }

    const id = String(raw.id ?? '').trim();
    if (!id) throw new Error('ID inválido');

    const now = Date.now();
    const updatedAt = epoch(raw.updated_at ?? raw.updatedAt, now);
    const createdAt = epoch(raw.created_at, updatedAt);
    const soldAt = epoch(raw.soldAt ?? raw.sold_at, createdAt);
    const seller = raw.sellerId ?? raw.seller_id ?? raw.createdBy ?? '';
    const orderId = raw.orderId ?? raw.order_id ?? null;
    const isCancelled = raw.isCancelled === true || raw.is_cancelled === true;
    const items = Array.isArray(raw.items)
      ? raw.items
      : Array.isArray(raw.products)
        ? raw.products
        : [];

    const preparedSale = saleCollection().prepareCreateFromDirtyRaw({
      id,
      _status: 'synced',
      _changed: '',
      total: finiteNumber(raw.total),
      sold_at: soldAt,
      customer_name: raw.customerName ?? null,
      created_by_name: raw.createdByName ?? raw.created_by_name ?? null,
      is_cancelled: isCancelled,
      establishment_id: currentEstablishmentId,
      seller_id: seller == null ? '' : String(seller),
      order_id: orderId == null ? null : String(orderId),
      created_at: createdAt,
      updated_at: updatedAt,
    });

    const preparedItems = await Promise.all(items.map(async (item) => {
      const rawItem = item as SaleItemData & {
        product_id?: string;
        unit_price_at_sale?: number;
        created_at?: number | string | Date;
        updated_at?: number | string | Date;
      };
      const incomingProductId = String(rawItem.productId ?? rawItem.product_id ?? '');
      const product = await findProduct(incomingProductId, currentEstablishmentId);
      const itemCreatedAt = epoch(rawItem.created_at, createdAt);
      const itemUpdatedAt = epoch(rawItem.updated_at, updatedAt);
      const unitPriceAtSale = finiteNumber(
        rawItem.unitPriceAtSale ?? rawItem.unit_price_at_sale ?? product?.price,
      );

      return saleItemCollection().prepareCreateFromDirtyRaw({
        id: rawItem.id ? String(rawItem.id) : generateUUID(),
        _status: 'synced',
        _changed: '',
        quantity: finiteNumber(rawItem.quantity),
        sale_id: id,
        product_id: product?.id ?? incomingProductId,
        unit_price_at_sale: unitPriceAtSale,
        created_at: itemCreatedAt,
        updated_at: itemUpdatedAt,
      });
    }));

    await database.write(() => database.batch(preparedSale, ...preparedItems));
    markChanged('sales');
    return { saleId: id };
  }

  async function getSaleById(saleId: string) {
    if (!currentEstablishmentId) {
      throw new Error(`Venda com ID ${saleId} não encontrada.`);
    }

    const sale = await findSale(String(saleId), currentEstablishmentId);
    if (!sale) throw new Error(`Venda com ID ${saleId} não encontrada.`);

    const [items, createdByName] = await Promise.all([
      fetchSaleItems(sale.id, currentEstablishmentId),
      createdByNameForSale(sale, currentEstablishmentId),
    ]);

    return {
      ...toSaleData(sale, createdByName),
      items: items.map(toSaleItemData),
    };
  }

  async function removeSale(saleId: string) {
    if (!currentEstablishmentId) return;

    const sale = await findSale(String(saleId), currentEstablishmentId);
    if (sale) {
      const now = new Date();
      await database.write(() => sale.update((record) => {
        record.isCancelled = true;
        record.updatedAt = now;
      }));
    }

    markChanged('sales');
  }

  async function listRecentSales(): Promise<RecentSalesGrouped>;
  async function listRecentSales(filters: SalesFilters): Promise<RecentSalesPaginated>;
  async function listRecentSales(filters?: SalesFilters): Promise<RecentSalesGrouped | RecentSalesPaginated> {
    if (!currentEstablishmentId) {
      return filters === undefined ? {} : emptyPaginatedSales(1, DEFAULT_SALES_LIMIT);
    }

    const query = buildLocalSalesQuery(filters ?? {}, currentEstablishmentId);
    if (filters === undefined) {
      const groupedSales = await fetchAllSales(query);
      const salesWithProducts = await Promise.all(
        groupedSales.map((sale) => toSaleWithProducts(sale, currentEstablishmentId)),
      );
      const salesByDate: RecentSalesGrouped = {};
      for (const sale of salesWithProducts) {
        const date = new Date(sale.soldAt).toLocaleDateString();
        if (!salesByDate[date]) salesByDate[date] = [];
        salesByDate[date].push(sale);
      }
      return salesByDate;
    }

    let pageSales: SaleModel[];
    let total: number;
    let closing: number;
    if (query.hasTimeFilter) {
      const matchingSales = (await fetchSalesWithoutPagination(query))
        .filter((sale) => query.matchesTime(sale.soldAt));
      total = matchingSales.length;
      closing = matchingSales.reduce((sum, sale) => sum + sale.total, 0);
      const pageStart = (query.page - 1) * query.limit;
      pageSales = matchingSales.slice(pageStart, pageStart + query.limit);
    } else {
      pageSales = await fetchSales(query);
      ({ total, closing } = await summarizeSales(query));
    }
    const salesWithProducts = await Promise.all(
      pageSales.map((sale) => toSaleWithProducts(sale, currentEstablishmentId)),
    );

    const totalPages = total === 0 ? 0 : Math.ceil(total / query.limit);
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
  }

  async function listSalesByDay(data: string) {
    if (!currentEstablishmentId) return [];

    const query = buildLocalSalesQuery({ dataInicial: data, dataFinal: data }, currentEstablishmentId);
    const sales = await fetchAllSales(query);
    return Promise.all(sales.map((sale) => toSaleWithProducts(sale, currentEstablishmentId)));
  }

  async function getSalesReportByPeriod(
    startDate: string,
    endDate: string,
    productTypeId?: string | number,
  ) {
    if (!currentEstablishmentId) return [];

    const startPeriod = localPeriodBoundary(startDate, false);
    const endPeriod = localPeriodBoundary(endDate, true);
    if (startPeriod > endPeriod) throw new Error('período inválido');

    const sales = await saleCollection()
      .query(
        Q.where('establishment_id', currentEstablishmentId),
        Q.where('is_cancelled', false),
        Q.where('sold_at', Q.gte(startPeriod)),
        Q.where('sold_at', Q.lte(endPeriod)),
      )
      .fetch();

    const selectedProductType = productTypeId == null ? '' : String(productTypeId).trim();
    const report = new Map<string, { id: string; name: string; price: number; totalVendido: number }>();

    for (const sale of sales) {
      const items = await fetchSaleItems(sale.id, currentEstablishmentId);
      for (const item of items) {
        const product = await findProduct(item.productId, currentEstablishmentId);
        if (!product) continue;
        if (selectedProductType && selectedProductType !== '100'
          && product.productTypeId !== selectedProductType) continue;

        const existing = report.get(product.id);
        if (existing) {
          existing.totalVendido += Number(item.quantity);
        } else {
          report.set(product.id, {
            id: product.id,
            name: product.name,
            price: product.price,
            totalVendido: Number(item.quantity),
          });
        }
      }
    }

    return Array.from(report.values()).sort((a, b) => {
      const quantityDifference = b.totalVendido - a.totalVendido;
      return quantityDifference !== 0 ? quantityDifference : a.id.localeCompare(b.id);
    });
  }

  return {
    createSale,
    createSaleFromOrder,
    createFromOrder: createSaleFromOrder,
    createFromSync,
    removeSale,
    listRecentSales,
    getSaleById,
    listSalesByDay,
    getSalesReportByPeriod,
    /** @deprecated Use the English sale methods. */
    createVenda: createSale,
    createVendaDoPedido: createSaleFromOrder,
    removeVenda: removeSale,
    listVendasRecentes: listRecentSales,
    getVendaById: getSaleById,
    listVendasPorDia: listSalesByDay,
    getRelatorioPorPeriodo: getSalesReportByPeriod,
  };
}
