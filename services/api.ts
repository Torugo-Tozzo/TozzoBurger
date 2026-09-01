import { buildSalesQueryParams, DEFAULT_SALES_LIMIT, DEFAULT_SALES_PAGE, SalesFilters, SalesListResponse, SalesPagination } from './sales';
import { fromLegacySyncResponse, fromLegacyUser } from './legacyWire';
import type { EstablishmentCategory } from '@/database/watermelon/categorySeeds';

// Fallback = produção. Para dev/homolog, defina EXPO_PUBLIC_API_URL no .env (ver .env.example).
export const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.tozzo.uk';

// Túnel ngrok (dev local) mostra uma pagina de aviso HTML pro primeiro acesso de
// qualquer client sem esse header, mesmo pra requests que nao sao de browser —
// isso quebraria o parse de JSON das respostas. Sem efeito em tozzo.uk/dev-api.tozzo.uk.
const NGROK_HEADERS: Record<string, string> = BASE_URL.includes('ngrok')
  ? { 'ngrok-skip-browser-warning': 'true' }
  : {};

async function handleJsonResponse(res: Response) {
  const txt = await res.text();
  try {
    return txt ? JSON.parse(txt) : {};
  } catch (err) {
    return txt;
  }
}

export type WatermelonSyncTableChangeSet = {
  created: unknown[];
  updated: unknown[];
  deleted: string[];
};

export type WatermelonSyncChangeSet = Record<string, WatermelonSyncTableChangeSet>;

export type SyncPullRequest = {
  lastPulledAt?: number | null;
  schemaVersion: number;
};

export type SyncPullResponse = {
  changes: WatermelonSyncChangeSet;
  timestamp: number;
};

export type SyncIgnoredItem = {
  type: string;
  entityId: string | null;
  reason: string;
};

export type SyncPushResponse = {
  ignored?: SyncIgnoredItem[];
  ignored_order_deletes?: SyncIgnoredItem[];
};

export type Establishment = {
  id: string | number;
  category: EstablishmentCategory | null;
  [key: string]: unknown;
};

export type ProductTypePayload = {
  description: string;
  color: string;
};

export class ApiHttpError extends Error {
  readonly status: number;
  readonly body: unknown;
  readonly code?: string;
  readonly details?: unknown;

  constructor(status: number, body: unknown, fallbackMessage = `HTTP ${status}`) {
    const record = body && typeof body === 'object' ? body as Record<string, unknown> : null;
    const message = typeof record?.message === 'string'
      ? record.message
      : typeof body === 'string' && body.trim().length > 0
        ? body
        : fallbackMessage;
    super(message);
    this.name = 'ApiHttpError';
    this.status = status;
    this.body = body;
    this.code = typeof record?.code === 'string'
      ? record.code
      : typeof record?.error === 'string'
        ? record.error
        : undefined;
    this.details = record?.details;
  }
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(typeof value === 'string' ? value.trim() : value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(value: unknown): number | undefined {
  const parsed = Number(typeof value === 'string' ? value.trim() : value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function validPagination(value: unknown): SalesPagination | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const pagination = value as Partial<Record<keyof SalesPagination, unknown>>;
  const page = integerAtLeast(pagination.page, 1);
  const limit = integerAtLeast(pagination.limit, 1);
  const total = integerAtLeast(pagination.total, 0);
  const totalPages = integerAtLeast(pagination.totalPages, 0);
  if (page == null || limit == null || total == null || totalPages == null || typeof pagination.hasNextPage !== 'boolean') return undefined;
  return { page, limit, total, totalPages, hasNextPage: pagination.hasNextPage };
}

function integerAtLeast(value: unknown, minimum: number): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum) return undefined;
  return value;
}

function readTotalCountHeader(res: Response): number | undefined {
  const headers = (res as Response & { headers?: { get?: (name: string) => string | null } }).headers;
  const value = headers?.get?.('X-Total-Count');
  return nonNegativeInteger(value);
}

function fallbackSalesPagination(res: Response, filters: SalesFilters, receivedCount: number): SalesPagination {
  const page = positiveInteger(filters.page, DEFAULT_SALES_PAGE);
  const limit = positiveInteger(filters.limit, DEFAULT_SALES_LIMIT);
  const total = readTotalCountHeader(res) ?? receivedCount;
  const totalPages = Math.ceil(total / limit);
  return { page, limit, total, totalPages, hasNextPage: page < totalPages };
}

export async function login(email: string, password: string) {
  const url = `${BASE_URL}/auth/login`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...NGROK_HEADERS },
      body: JSON.stringify({ email, senha: password }),
    });

    if (!res.ok) {
      const errBody = await handleJsonResponse(res).catch(() => null);
      const message = (errBody && (errBody.message || JSON.stringify(errBody))) || `HTTP ${res.status}`;
      console.error('API login error:', url, message);
      throw new Error(message);
    }

    const body = await handleJsonResponse(res);
    return body && typeof body === 'object' ? { ...body, user: body.user ? fromLegacyUser(body.user) : body.user } : body;
  } catch (err: any) {
    console.error('Network/login request failed', url, err?.message ?? err);
    throw err;
  }
}

export async function getMe(token: string) {
  const url = `${BASE_URL}/usuarios/me`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...NGROK_HEADERS },
    });

    if (!res.ok) {
      const errBody = await handleJsonResponse(res).catch(() => null);
      const message = (errBody && (errBody.message || JSON.stringify(errBody))) || `HTTP ${res.status}`;
      console.error('API getMe error:', url, message);
      throw new Error(message);
    }

    return fromLegacyUser(await handleJsonResponse(res));
  } catch (err: any) {
    console.error('Network/getMe request failed', url, err?.message ?? err);
    throw err;
  }
}

export async function getEstablishment(token: string): Promise<Establishment> {
  const url = new URL('/estabelecimentos', BASE_URL);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...NGROK_HEADERS },
    });

    if (!res.ok) {
      const errBody = await handleJsonResponse(res).catch(() => null);
      const error = new ApiHttpError(res.status, errBody);
      console.error('API getEstablishment error:', url.toString(), error.message);
      throw error;
    }

    return await handleJsonResponse(res) as Establishment;
  } catch (err: any) {
    if (err instanceof ApiHttpError) throw err;
    console.error('Network/getEstablishment request failed', url.toString(), err?.message ?? err);
    throw err;
  }
}

export type DeviceRegistrationInfo = { platform?: string };

export async function registerDevice(
  token: string,
  id?: string | null,
  info: DeviceRegistrationInfo = {},
): Promise<{ id: string; [key: string]: unknown }> {
  const url = new URL('/dispositivos', BASE_URL);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...NGROK_HEADERS,
      },
      body: JSON.stringify({ id: id ?? undefined, info }),
    });

    if (!res.ok) {
      const errBody = await handleJsonResponse(res).catch(() => null);
      const error = new ApiHttpError(res.status, errBody);
      console.error('API registerDevice error:', url.toString(), error.message);
      throw error;
    }

    return await handleJsonResponse(res) as { id: string; [key: string]: unknown };
  } catch (err: any) {
    if (err instanceof ApiHttpError) throw err;
    console.error('Network/registerDevice request failed', url.toString(), err?.message ?? err);
    throw err;
  }
}

export async function updateEstablishmentCategory(
  token: string,
  establishmentId: string | number,
  category: EstablishmentCategory,
): Promise<Establishment> {
  const url = new URL(`/establishments/${encodeURIComponent(String(establishmentId))}`, BASE_URL);
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...NGROK_HEADERS,
      },
      body: JSON.stringify({ category }),
    });

    if (!res.ok) {
      const errBody = await handleJsonResponse(res).catch(() => null);
      const error = new ApiHttpError(res.status, errBody);
      console.error('API updateEstablishmentCategory error:', url.toString(), error.message);
      throw error;
    }

    return await handleJsonResponse(res) as Establishment;
  } catch (err: any) {
    if (err instanceof ApiHttpError) throw err;
    console.error('Network/updateEstablishmentCategory request failed', url.toString(), err?.message ?? err);
    throw err;
  }
}

export async function createProductType(
  token: string,
  payload: ProductTypePayload,
): Promise<Record<string, unknown>> {
  const url = new URL('/tipos', BASE_URL);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...NGROK_HEADERS,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errBody = await handleJsonResponse(res).catch(() => null);
      const error = new ApiHttpError(res.status, errBody);
      console.error('API createProductType error:', url.toString(), error.message);
      throw error;
    }

    return await handleJsonResponse(res) as Record<string, unknown>;
  } catch (err: any) {
    if (err instanceof ApiHttpError) throw err;
    console.error('Network/createProductType request failed', url.toString(), err?.message ?? err);
    throw err;
  }
}

export async function pullChanges(token: string, params: SyncPullRequest): Promise<SyncPullResponse> {
  const url = new URL('/sync/pull', BASE_URL);
  url.searchParams.set('schemaVersion', String(params.schemaVersion));
  if (params.lastPulledAt !== undefined && params.lastPulledAt !== null) {
    url.searchParams.set('lastPulledAt', String(params.lastPulledAt));
  }

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...NGROK_HEADERS },
    });

    if (!res.ok) {
      const errBody = await handleJsonResponse(res).catch(() => null);
      const error = new ApiHttpError(res.status, errBody);
      console.error('API sync pull error:', url.toString(), error.message);
      throw error;
    }

    return await handleJsonResponse(res) as SyncPullResponse;
  } catch (err: any) {
    if (err instanceof ApiHttpError) throw err;
    console.error('Network/sync pull request failed', url.toString(), err?.message ?? err);
    throw err;
  }
}

export async function pushChanges(
  token: string,
  payload: { changes: WatermelonSyncChangeSet; lastPulledAt: number },
): Promise<SyncPushResponse> {
  const url = new URL('/sync/push', BASE_URL);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Accept: 'application/json', ...NGROK_HEADERS },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errBody = await handleJsonResponse(res).catch(() => null);
      const error = new ApiHttpError(res.status, errBody);
      console.error('API sync push error:', url.toString(), error.message);
      throw error;
    }

    return await handleJsonResponse(res) as SyncPushResponse;
  } catch (err: any) {
    if (err instanceof ApiHttpError) throw err;
    console.error('Network/sync push request failed', url.toString(), err?.message ?? err);
    throw err;
  }
}

export async function listSales(token: string, filters: SalesFilters = {}): Promise<SalesListResponse> {
  const url = new URL('/vendas', BASE_URL);
  url.search = buildSalesQueryParams(filters).toString();

  try {
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...NGROK_HEADERS },
    });

    if (!res.ok) {
      const errBody = await handleJsonResponse(res).catch(() => null);
      const message = (errBody && (errBody.message || JSON.stringify(errBody))) || `HTTP ${res.status}`;
      console.error('API listVendas error:', url.toString(), message);
      throw new Error(message);
    }

    const body = await handleJsonResponse(res);
    const normalized = fromLegacySyncResponse({ vendas: Array.isArray(body?.sales) ? body.sales : body?.vendas ?? [] });
    const sales = normalized.sales ?? [];
    const pagination = validPagination(body?.pagination);
    return {
      sales,
      closing: body?.closing ?? body?.fechamento ?? 0,
      pagination: pagination ?? fallbackSalesPagination(res, filters, sales.length),
    };
  } catch (err: any) {
    console.error('Network/listVendas request failed', url.toString(), err?.message ?? err);
    throw err;
  }
}

/** @deprecated Use listSales; the public URL remains /vendas. */
export const listVendas = listSales;
