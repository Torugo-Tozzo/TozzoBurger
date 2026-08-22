export type VendasFilters = {
  dataInicial?: string | null;
  dataFinal?: string | null;
  horaInicial?: string | null;
  horaFinal?: string | null;
  cliente?: string | null;
  totalMin?: number | string | null;
  totalMax?: number | string | null;
  page?: number | string | null;
  limit?: number | string | null;
};

export const DEFAULT_VENDAS_PAGE = 1;
export const DEFAULT_VENDAS_LIMIT = 50;
export const MAX_VENDAS_LIMIT = 100;

export const EMPTY_VENDAS_FILTERS: VendasFilters = {
  dataInicial: null,
  dataFinal: null,
  horaInicial: '',
  horaFinal: '',
  cliente: '',
  totalMin: '',
  totalMax: '',
};

export type VendaApi = {
  id: string | number;
  total: number | string;
  horario: string | number | Date;
  cliente?: string | null;
  excluida?: boolean | null;
  vendedor?: { id?: string | number | null; nome?: string | null } | null;
  itens?: VendaApiItem[] | null;
};

export type VendaApiItem = {
  id?: string | number | null;
  produtoId?: string | number | null;
  quantidade: number | string;
  precoHistorico?: number | string | null;
  produto?: { id?: string | number | null; nome?: string | null; preco?: number | string | null } | null;
};

export type VendaItemRenderizavel = {
  id?: string;
  produtoId?: string;
  nome: string;
  quantidade: number;
  preco: number;
  subtotal: number;
};

export type VendaRenderizavel = {
  id: string;
  total: number;
  horario: string;
  cliente: string | null;
  excluida: boolean;
  criado_por: string | null;
  criado_por_nome: string | null;
  produtos: string[];
  itens: VendaItemRenderizavel[];
};

export type VendasListResponse = { vendas: VendaApi[]; fechamento: number };

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

export function buildVendasQueryParams(filters: VendasFilters = {}): URLSearchParams {
  const params = new URLSearchParams();
  appendParam(params, 'page', filters.page);
  appendParam(params, 'limit', filters.limit);
  const dataInicial = nonEmptyString(filters.dataInicial);
  const dataFinal = nonEmptyString(filters.dataFinal);
  appendParam(params, 'dataInicial', dataInicial ? dateBoundary(dataInicial, filters.horaInicial, false) ?? dataInicial : undefined);
  appendParam(params, 'dataFinal', dataFinal ? dateBoundary(dataFinal, filters.horaFinal, true) ?? dataFinal : undefined);
  appendParam(params, 'horaInicial', filters.horaInicial);
  appendParam(params, 'horaFinal', filters.horaFinal);
  appendParam(params, 'cliente', filters.cliente);
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

function normalizeHorario(value: string | number | Date): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') return new Date(value).toISOString();
  return String(value);
}

export function mapVendaApiToRender(venda: VendaApi): VendaRenderizavel {
  const itens = (venda.itens ?? []).map((item) => {
    const quantidade = toFiniteNumber(item.quantidade);
    const preco = toFiniteNumber(item.precoHistorico ?? item.produto?.preco);
    const nome = nonEmptyString(item.produto?.nome) ?? 'Produto desconhecido';
    const produtoId = item.produtoId ?? item.produto?.id;
    return {
      id: item.id == null ? undefined : String(item.id),
      produtoId: produtoId == null ? undefined : String(produtoId),
      nome,
      quantidade,
      preco,
      subtotal: preco * quantidade,
    };
  });
  return {
    id: String(venda.id),
    total: toFiniteNumber(venda.total),
    horario: normalizeHorario(venda.horario),
    cliente: venda.cliente == null ? null : String(venda.cliente),
    excluida: venda.excluida === true,
    criado_por: venda.vendedor?.id == null ? null : String(venda.vendedor.id),
    criado_por_nome: venda.vendedor?.nome == null ? null : String(venda.vendedor.nome),
    produtos: itens.map((item) => `( ${item.quantidade}x ) ${item.nome}`),
    itens,
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

export type VendaLocalFiltravel = { total: number; horario: string | number | Date; cliente?: string | null };

export function filterVendasLocais<T extends VendaLocalFiltravel>(vendas: T[], filters: VendasFilters = {}): T[] {
  const inicio = dateBoundary(filters.dataInicial, filters.horaInicial, false);
  const fim = dateBoundary(filters.dataFinal, filters.horaFinal, true);
  const inicioMs = inicio ? new Date(inicio).getTime() : undefined;
  const fimMs = fim ? new Date(fim).getTime() : undefined;
  const horaInicial = minutesFromTime(filters.horaInicial);
  const horaFinal = minutesFromTime(filters.horaFinal);
  const cliente = nonEmptyString(filters.cliente)?.toLocaleLowerCase('pt-BR');
  const totalMin = optionalFilterNumber(filters.totalMin);
  const totalMax = optionalFilterNumber(filters.totalMax);

  return vendas.filter((venda) => {
    const horario = localDateFromValue(venda.horario);
    const horarioMs = horario?.getTime();
    if (inicioMs != null && (horarioMs == null || horarioMs < inicioMs)) return false;
    if (fimMs != null && (horarioMs == null || horarioMs > fimMs)) return false;
    if (horario && (horaInicial != null || horaFinal != null) && inicioMs == null && fimMs == null) {
      const minutos = horario.getHours() * 60 + horario.getMinutes();
      if (horaInicial != null && minutos < horaInicial) return false;
      if (horaFinal != null && minutos > horaFinal) return false;
    }
    if (cliente && !String(venda.cliente ?? '').toLocaleLowerCase('pt-BR').includes(cliente)) return false;
    const total = toFiniteNumber(venda.total);
    if (totalMin != null && total < totalMin) return false;
    if (totalMax != null && total > totalMax) return false;
    return true;
  });
}
