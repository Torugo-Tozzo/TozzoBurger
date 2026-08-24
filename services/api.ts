import { buildSalesQueryParams, DEFAULT_SALES_LIMIT, DEFAULT_SALES_PAGE, SalesFilters, SalesListResponse, SalesPagination } from './sales';
import { fromLegacySyncResponse, fromLegacyUser, toLegacySyncPayload } from './legacyWire';

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

export async function synchronize(token: string, payload: any) {
  const url = `${BASE_URL}/sincronizacao/push`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Accept: 'application/json', ...NGROK_HEADERS },
      body: JSON.stringify(toLegacySyncPayload(payload)),
    });

    if (!res.ok) {
      const errBody = await handleJsonResponse(res).catch(() => null);
      const message = (errBody && (errBody.message || JSON.stringify(errBody))) || `HTTP ${res.status}`;
      console.error('API sincronizar error:', url, message);
      throw new Error(message);
    }

    return fromLegacySyncResponse(await handleJsonResponse(res));
  } catch (err: any) {
    console.error('Network/synchronize request failed', url, err?.message ?? err);
    throw err;
  }
}

export async function getChanges(token: string, since?: string | null) {
  let url = `${BASE_URL}/sincronizacao/pull`;
  if (since) {
    const q = encodeURIComponent(String(since));
    url = `${url}?since=${q}`;
  }
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...NGROK_HEADERS },
    });

    if (!res.ok) {
      const errBody = await handleJsonResponse(res).catch(() => null);
      const message = (errBody && (errBody.message || JSON.stringify(errBody))) || `HTTP ${res.status}`;
      console.error('API getChanges error:', url, message);
      throw new Error(message);
    }

    return fromLegacySyncResponse(await handleJsonResponse(res));
  } catch (err: any) {
    console.error('Network/getChanges request failed', url, err?.message ?? err);
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

/** @deprecated Use synchronize; kept for clients compiled against the old service name. */
export const sincronizar = synchronize;
