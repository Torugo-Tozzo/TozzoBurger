export type SalesFilters = {
  dataInicial?: string | null;
  dataFinal?: string | null;
  horaInicial?: string | null;
  horaFinal?: string | null;
  timezoneOffsetMinutes?: number | string | null;
  customerName?: string | null;
  totalMin?: number | string | null;
  totalMax?: number | string | null;
  page?: number | string | null;
  limit?: number | string | null;
};

export const DEFAULT_SALES_PAGE = 1;
export const DEFAULT_SALES_LIMIT = 50;
export const MAX_SALES_LIMIT = 100;
export const MIN_TIMEZONE_OFFSET_MINUTES = -14 * 60;
export const MAX_TIMEZONE_OFFSET_MINUTES = 14 * 60;

export const EMPTY_SALES_FILTERS: SalesFilters = {
  dataInicial: null,
  dataFinal: null,
  horaInicial: '',
  horaFinal: '',
  customerName: '',
  totalMin: '',
  totalMax: '',
};

export type SaleApi = {
  id: string | number;
  total: number | string;
  soldAt: string | number | Date;
  customerName?: string | null;
  isCancelled?: boolean | null;
  seller?: { id?: string | number | null; name?: string | null } | null;
  items?: SaleApiItem[] | null;
};

export type SaleApiItem = {
  id?: string | number | null;
  productId?: string | number | null;
  quantity: number | string;
  unitPriceAtSale?: number | string | null;
  product?: { id?: string | number | null; name?: string | null; price?: number | string | null } | null;
};

export type SaleItemRenderable = {
  id?: string;
  productId?: string;
  name: string;
  quantity: number;
  price: number;
  subtotal: number;
};

export type SaleRenderable = {
  id: string;
  total: number;
  soldAt: string;
  customerName: string | null;
  isCancelled: boolean;
  createdBy: string | null;
  createdByName: string | null;
  products: string[];
  items: SaleItemRenderable[];
};

export type SalesPagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
};

export type SalesListResponse = {
  sales: SaleApi[];
  closing: number;
  pagination: SalesPagination;
};

export type SalesPageState = {
  page: number;
  hasNextPage: boolean;
  loadingInitial: boolean;
  loadingMore: boolean;
  error: string | null;
};

export function mergeSalesPage(existing: SaleRenderable[], incoming: SaleRenderable[], page: number): SaleRenderable[] {
  const merged: SaleRenderable[] = [];
  const indexes = new Map<string, number>();

  if (page !== 1) {
    existing.forEach((sale) => {
      if (indexes.has(sale.id)) return;
      indexes.set(sale.id, merged.length);
      merged.push(sale);
    });
  }

  incoming.forEach((sale) => {
    const existingIndex = indexes.get(sale.id);
    if (existingIndex === undefined) {
      indexes.set(sale.id, merged.length);
      merged.push(sale);
    } else {
      merged[existingIndex] = sale;
    }
  });

  return merged;
}

export function resetSalesPageState(): SalesPageState {
  return { page: 0, hasNextPage: true, loadingInitial: false, loadingMore: false, error: null };
}

function nonEmptyString(value: string | null | undefined): string | undefined {
  if (value == null) return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function parseDateParts(value: string | null | undefined) {
  const normalized = nonEmptyString(value);
  if (!normalized) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(normalized);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const validationDate = new Date(year, month - 1, day);
  if (validationDate.getFullYear() !== year || validationDate.getMonth() !== month - 1 || validationDate.getDate() !== day) return undefined;
  return { year, month, day };
}

function parseTime(value: string | null | undefined): [number, number, number, number] | undefined {
  const normalized = nonEmptyString(value);
  if (!normalized) return undefined;
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(normalized);
  if (!match) return undefined;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) return undefined;
  return [hour, minute, second, 0];
}

function dateBoundary(dateValue: string | null | undefined, timeValue: string | null | undefined, endOfDay: boolean): string | undefined {
  const date = parseDateParts(dateValue);
  if (!date) return undefined;
  const time = parseTime(timeValue);
  const [hour, minute, second, millisecond] = time ?? (endOfDay ? [23, 59, 59, 999] : [0, 0, 0, 0]);
  return new Date(date.year, date.month - 1, date.day, hour, minute, second, millisecond).toISOString();
}

function appendParam(params: URLSearchParams, name: string, value: string | number | null | undefined): void {
  if (value == null) return;
  const normalized = typeof value === 'string' ? value.trim() : String(value);
  if (normalized.length > 0) params.set(name, normalized);
}

export function parseTimezoneOffsetMinutes(value: SalesFilters['timezoneOffsetMinutes']): number {
  const fallback = new Date().getTimezoneOffset();
  const normalized = value == null || (typeof value === 'string' && value.trim() === '')
    ? fallback
    : typeof value === 'string'
      ? Number(value.trim())
      : value;

  if (
    !Number.isInteger(normalized) ||
    normalized < MIN_TIMEZONE_OFFSET_MINUTES ||
    normalized > MAX_TIMEZONE_OFFSET_MINUTES
  ) {
    throw new Error('timezoneOffsetMinutes inválido');
  }

  return normalized;
}

export function timezoneOffsetToSqliteModifier(timezoneOffsetMinutes: number): string {
  const sign = timezoneOffsetMinutes > 0 ? '-' : '+';
  const absolute = Math.abs(timezoneOffsetMinutes);
  const hours = Math.floor(absolute / 60);
  const minutes = absolute % 60;
  return `${sign}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function buildSalesQueryParams(filters: SalesFilters = {}): URLSearchParams {
  const params = new URLSearchParams();
  appendParam(params, 'page', filters.page);
  appendParam(params, 'limit', filters.limit);
  const dataInicial = nonEmptyString(filters.dataInicial);
  const dataFinal = nonEmptyString(filters.dataFinal);
  appendParam(params, 'dataInicial', dataInicial ? dateBoundary(dataInicial, filters.horaInicial, false) ?? dataInicial : undefined);
  appendParam(params, 'dataFinal', dataFinal ? dateBoundary(dataFinal, filters.horaFinal, true) ?? dataFinal : undefined);
  appendParam(params, 'horaInicial', filters.horaInicial);
  appendParam(params, 'horaFinal', filters.horaFinal);
  if (nonEmptyString(filters.horaInicial) || nonEmptyString(filters.horaFinal)) {
    appendParam(params, 'timezoneOffsetMinutes', parseTimezoneOffsetMinutes(filters.timezoneOffsetMinutes));
  }
  appendParam(params, 'customerName', filters.customerName);
  appendParam(params, 'totalMin', filters.totalMin);
  appendParam(params, 'totalMax', filters.totalMax);
  return params;
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'string') {
    const parsed = Number(value.trim().replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalFilterNumber(value: number | string | null | undefined): number | undefined {
  if (value == null || (typeof value === 'string' && value.trim() === '')) return undefined;
  const parsed = toFiniteNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeSoldAt(value: string | number | Date): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') return new Date(value).toISOString();
  return String(value);
}

export function mapSaleApiToRender(sale: SaleApi): SaleRenderable {
  const items = (sale.items ?? []).map((item) => {
    const quantity = toFiniteNumber(item.quantity);
    const price = toFiniteNumber(item.unitPriceAtSale ?? item.product?.price);
    const name = nonEmptyString(item.product?.name) ?? 'Unknown product';
    const productId = item.productId ?? item.product?.id;
    return {
      id: item.id == null ? undefined : String(item.id),
      productId: productId == null ? undefined : String(productId),
      name,
      quantity,
      price,
      subtotal: price * quantity,
    };
  });
  return {
    id: String(sale.id),
    total: toFiniteNumber(sale.total),
    soldAt: normalizeSoldAt(sale.soldAt),
    customerName: sale.customerName == null ? null : String(sale.customerName),
    isCancelled: sale.isCancelled === true,
    createdBy: sale.seller?.id == null ? null : String(sale.seller.id),
    createdByName: sale.seller?.name == null ? null : String(sale.seller.name),
    products: items.map((item) => `( ${item.quantity}x ) ${item.name}`),
    items,
  };
}

function minutesFromTime(value: string | null | undefined): number | undefined {
  const time = parseTime(value);
  return time ? time[0] * 60 + time[1] : undefined;
}

function localDateFromValue(value: string | number | Date): Date | undefined {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export type LocalSaleFilterable = { total: number; soldAt: string | number | Date; customerName?: string | null };

export function filterLocalSales<T extends LocalSaleFilterable>(sales: T[], filters: SalesFilters = {}): T[] {
  const inicio = dateBoundary(filters.dataInicial, filters.horaInicial, false);
  const fim = dateBoundary(filters.dataFinal, filters.horaFinal, true);
  const inicioMs = inicio ? new Date(inicio).getTime() : undefined;
  const fimMs = fim ? new Date(fim).getTime() : undefined;
  const horaInicial = minutesFromTime(filters.horaInicial);
  const horaFinal = minutesFromTime(filters.horaFinal);
  const customerName = nonEmptyString(filters.customerName)?.toLocaleLowerCase('pt-BR');
  const totalMin = optionalFilterNumber(filters.totalMin);
  const totalMax = optionalFilterNumber(filters.totalMax);

  return sales.filter((sale) => {
    const soldAt = localDateFromValue(sale.soldAt);
    const soldAtMs = soldAt?.getTime();
    if (inicioMs != null && (soldAtMs == null || soldAtMs < inicioMs)) return false;
    if (fimMs != null && (soldAtMs == null || soldAtMs > fimMs)) return false;
    if (soldAt && (horaInicial != null || horaFinal != null) && inicioMs == null && fimMs == null) {
      const minutos = soldAt.getHours() * 60 + soldAt.getMinutes();
      if (horaInicial != null && minutos < horaInicial) return false;
      if (horaFinal != null && minutos > horaFinal) return false;
    }
    if (customerName && !String(sale.customerName ?? '').toLocaleLowerCase('pt-BR').includes(customerName)) return false;
    const total = toFiniteNumber(sale.total);
    if (totalMin != null && total < totalMin) return false;
    if (totalMax != null && total > totalMax) return false;
    return true;
  });
}

/** @deprecated Source compatibility for code not yet migrated to the English names. */
export type VendasFilters = SalesFilters;
export type VendaApi = SaleApi;
export type VendaApiItem = SaleApiItem;
export type VendaItemRenderizavel = SaleItemRenderable;
export type VendaRenderizavel = SaleRenderable;
export type VendasPagination = SalesPagination;
export type VendasListResponse = SalesListResponse;
export type VendasPageState = SalesPageState;
export const DEFAULT_VENDAS_PAGE = DEFAULT_SALES_PAGE;
export const DEFAULT_VENDAS_LIMIT = DEFAULT_SALES_LIMIT;
export const MAX_VENDAS_LIMIT = MAX_SALES_LIMIT;
export const EMPTY_VENDAS_FILTERS = EMPTY_SALES_FILTERS;
export const buildVendasQueryParams = buildSalesQueryParams;
export const mergeVendasPage = mergeSalesPage;
export const resetVendasPageState = resetSalesPageState;
export const mapVendaApiToRender = mapSaleApiToRender;
export const filterVendasLocais = filterLocalSales;
