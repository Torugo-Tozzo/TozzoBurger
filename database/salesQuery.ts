import {
  DEFAULT_SALES_LIMIT,
  DEFAULT_SALES_PAGE,
  MAX_SALES_LIMIT,
  parseTimezoneOffsetMinutes,
  type SalesFilters,
  timezoneOffsetToSqliteModifier,
} from '../services/sales';

export type LocalSalesQueryParam = string | number;

export type LocalSalesQuery = {
  select: string;
  count: string;
  sum: string;
  params: LocalSalesQueryParam[];
  countParams: LocalSalesQueryParam[];
  sumParams: LocalSalesQueryParam[];
  page: number;
  limit: number;
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
  sqliteValue: string;
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
    validationDate.getUTCFullYear() !== year ||
    validationDate.getUTCMonth() !== month - 1 ||
    validationDate.getUTCDate() !== day
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

  return {
    hour,
    minute,
    second,
    sqliteValue: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
  };
}

function dateBoundary(
  date: ParsedDate,
  time: ParsedTime | undefined,
  endOfDay: boolean,
): string {
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
  ).toISOString();
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

export function buildLocalSalesQuery(filters: SalesFilters = {}): LocalSalesQuery {
  const page = positiveInteger(filters.page, DEFAULT_SALES_PAGE, 'page');
  const limit = positiveInteger(filters.limit, DEFAULT_SALES_LIMIT, 'limit', MAX_SALES_LIMIT);
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

  const clauses = [
    'deleted_at IS NULL',
    '(isCancelled IS NULL OR isCancelled = 0)',
  ];
  const filterParams: LocalSalesQueryParam[] = [];

  const addClause = (clause: string, ...parameters: LocalVendasQueryParam[]) => {
    clauses.push(clause);
    filterParams.push(...parameters);
  };

  if (dataInicial) addClause('soldAt >= ?', dateBoundary(dataInicial, horaInicial, false));
  if (dataFinal) addClause('soldAt <= ?', dateBoundary(dataFinal, horaFinal, true));
  const timezoneModifier = horaInicial || horaFinal
    ? timezoneOffsetToSqliteModifier(parseTimezoneOffsetMinutes(filters.timezoneOffsetMinutes))
    : undefined;
  if (horaInicial) addClause("strftime('%H:%M', soldAt, ?) >= ?", timezoneModifier!, horaInicial.sqliteValue);
  if (horaFinal) addClause("strftime('%H:%M', soldAt, ?) <= ?", timezoneModifier!, horaFinal.sqliteValue);
  if (customerName) addClause("LOWER(COALESCE(customerName, '')) LIKE LOWER(?)", `%${customerName}%`);
  if (totalMin != null) addClause('total >= ?', totalMin);
  if (totalMax != null) addClause('total <= ?', totalMax);

  const where = `WHERE ${clauses.join(' AND ')}`;
  const countParams = [...filterParams];
  const sumParams = [...filterParams];
  const params = [...filterParams, limit, (page - 1) * limit];

  return {
    select: `SELECT * FROM TB_SALES ${where} ORDER BY soldAt DESC, id DESC LIMIT ? OFFSET ?`,
    count: `SELECT COUNT(*) AS total FROM TB_SALES ${where}`,
    sum: `SELECT COALESCE(SUM(total), 0) AS fechamento FROM TB_SALES ${where}`,
    params,
    countParams,
    sumParams,
    page,
    limit,
  };
}

/** @deprecated Use the English query names. */
export type LocalVendasQueryParam = LocalSalesQueryParam;
/** @deprecated Use LocalSalesQuery. */
export type LocalVendasQuery = LocalSalesQuery;
/** @deprecated Use buildLocalSalesQuery. */
export const buildLocalVendasQuery = buildLocalSalesQuery;
