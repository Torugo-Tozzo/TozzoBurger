import { Q } from '@nozbe/watermelondb';
import type { Clause } from '@nozbe/watermelondb/QueryDescription';

import {
  DEFAULT_SALES_LIMIT,
  DEFAULT_SALES_PAGE,
  MAX_SALES_LIMIT,
  parseTimezoneOffsetMinutes,
  type SalesFilters,
} from '../services/sales';

export type LocalSalesQuery = {
  clauses: Clause[];
  baseClauses: Clause[];
  page: number;
  limit: number;
  matchesTime: (soldAt: Date) => boolean;
};

type ParsedDate = {
  year: number;
  month: number;
  day: number;
};

type ParsedTime = {
  hour: number;
  minute: number;
  second: number;
};

function optionalText(value: string | null | undefined): string | undefined {
  if (value == null) return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function positiveInteger(
  value: number | string | null | undefined,
  fallback: number,
  field: string,
  maximum?: number,
): number {
  if (value == null || (typeof value === 'string' && value.trim() === '')) return fallback;

  const parsed = typeof value === 'number' ? value : Number(value.trim());
  if (!Number.isInteger(parsed) || parsed <= 0 || (maximum != null && parsed > maximum)) {
    throw new Error(`${field} inválido`);
  }

  return parsed;
}

function parseDate(value: string, field: string): ParsedDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`${field} inválida`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const validationDate = new Date(Date.UTC(year, month - 1, day));
  if (
    validationDate.getUTCFullYear() !== year
    || validationDate.getUTCMonth() !== month - 1
    || validationDate.getUTCDate() !== day
  ) {
    throw new Error(`${field} inválida`);
  }

  return { year, month, day };
}

function parseTime(value: string, field: string): ParsedTime {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) throw new Error(`${field} inválida`);

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) throw new Error(`${field} inválida`);

  return { hour, minute, second };
}

function optionalNumber(
  value: number | string | null | undefined,
  field: string,
): number | undefined {
  if (value == null || (typeof value === 'string' && value.trim() === '')) return undefined;

  const parsed = typeof value === 'number' ? value : Number(value.trim().replace(',', '.'));
  if (!Number.isFinite(parsed)) throw new Error(`${field} inválido`);
  return parsed;
}

function dateBoundary(
  date: ParsedDate,
  time: ParsedTime | undefined,
  endOfDay: boolean,
): number {
  const hour = time?.hour ?? (endOfDay ? 23 : 0);
  const minute = time?.minute ?? (endOfDay ? 59 : 0);
  const second = time?.second ?? (endOfDay ? 59 : 0);
  const millisecond = time == null && endOfDay ? 999 : 0;
  return new Date(
    date.year,
    date.month - 1,
    date.day,
    hour,
    minute,
    second,
    millisecond,
  ).getTime();
}

function localMinutes(soldAt: Date, timezoneOffsetMinutes: number): number | undefined {
  const timestamp = soldAt.getTime();
  if (!Number.isFinite(timestamp)) return undefined;

  const shifted = new Date(timestamp - timezoneOffsetMinutes * 60_000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

function makeTimeMatcher(
  horaInicial: ParsedTime | undefined,
  horaFinal: ParsedTime | undefined,
  timezoneOffsetMinutes: number,
): (soldAt: Date) => boolean {
  const minimum = horaInicial == null ? undefined : horaInicial.hour * 60 + horaInicial.minute;
  const maximum = horaFinal == null ? undefined : horaFinal.hour * 60 + horaFinal.minute;

  return (soldAt) => {
    if (minimum == null && maximum == null) return true;

    const minutes = localMinutes(soldAt, timezoneOffsetMinutes);
    if (minutes == null) return false;
    if (minimum != null && minutes < minimum) return false;
    if (maximum != null && minutes > maximum) return false;
    return true;
  };
}

function normalizeEstablishmentId(value: string | number | null | undefined): string {
  const normalized = value == null ? '' : String(value).trim();
  if (!normalized) throw new Error('establishmentId inválido');
  return normalized;
}

export function buildLocalSalesQuery(
  filters: SalesFilters = {},
  establishmentId: string | number,
): LocalSalesQuery {
  const page = positiveInteger(filters.page, DEFAULT_SALES_PAGE, 'page');
  const limit = positiveInteger(filters.limit, DEFAULT_SALES_LIMIT, 'limit', MAX_SALES_LIMIT);
  const currentEstablishmentId = normalizeEstablishmentId(establishmentId);
  const dataInicialValue = optionalText(filters.dataInicial);
  const dataFinalValue = optionalText(filters.dataFinal);
  const horaInicialValue = optionalText(filters.horaInicial);
  const horaFinalValue = optionalText(filters.horaFinal);
  const customerName = optionalText(filters.customerName);
  const dataInicial = dataInicialValue ? parseDate(dataInicialValue, 'dataInicial') : undefined;
  const dataFinal = dataFinalValue ? parseDate(dataFinalValue, 'dataFinal') : undefined;
  const horaInicial = horaInicialValue ? parseTime(horaInicialValue, 'horaInicial') : undefined;
  const horaFinal = horaFinalValue ? parseTime(horaFinalValue, 'horaFinal') : undefined;
  const totalMin = optionalNumber(filters.totalMin, 'totalMin');
  const totalMax = optionalNumber(filters.totalMax, 'totalMax');

  if (totalMin != null && totalMax != null && totalMin > totalMax) {
    throw new Error('totalMin não pode ser maior que totalMax');
  }

  const clauses: Clause[] = [
    Q.where('establishment_id', currentEstablishmentId),
    Q.where('is_cancelled', false),
  ];

  if (dataInicial) clauses.push(Q.where('sold_at', Q.gte(dateBoundary(dataInicial, horaInicial, false))));
  if (dataFinal) clauses.push(Q.where('sold_at', Q.lte(dateBoundary(dataFinal, horaFinal, true))));
  if (customerName) {
    clauses.push(Q.where('customer_name', Q.like(`%${Q.sanitizeLikeString(customerName)}%`)));
  }
  if (totalMin != null) clauses.push(Q.where('total', Q.gte(totalMin)));
  if (totalMax != null) clauses.push(Q.where('total', Q.lte(totalMax)));

  const hasTimeFilter = horaInicial != null || horaFinal != null;
  const timezoneOffsetMinutes = hasTimeFilter
    ? parseTimezoneOffsetMinutes(filters.timezoneOffsetMinutes)
    : 0;

  const baseClauses = [...clauses];
  return {
    clauses: [
      ...baseClauses,
      Q.take(limit),
      Q.skip((page - 1) * limit),
    ],
    baseClauses,
    page,
    limit,
    matchesTime: makeTimeMatcher(horaInicial, horaFinal, timezoneOffsetMinutes),
  };
}

export function localPeriodBoundary(value: string | number | Date, endOfDay: boolean): number {
  const normalized = typeof value === 'string' ? value.trim() : value;
  const date = typeof normalized === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.test(normalized)
    ? (() => {
      const parsed = parseDate(normalized, 'data');
      return new Date(parsed.year, parsed.month - 1, parsed.day);
    })()
    : normalized instanceof Date ? new Date(normalized.getTime()) : new Date(normalized);
  if (!Number.isFinite(date.getTime())) throw new Error('período inválido');

  date.setHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
  return date.getTime();
}

/** @deprecated Use LocalSalesQuery. */
export type LocalVendasQuery = LocalSalesQuery;
/** @deprecated Use buildLocalSalesQuery. */
export const buildLocalVendasQuery = buildLocalSalesQuery;
