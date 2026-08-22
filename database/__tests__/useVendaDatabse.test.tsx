// database/__tests__/useVendaDatabse.test.tsx
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('expo-sqlite', () => ({
  useSQLiteContext: jest.fn(),
}));

jest.mock('../utils/uuid', () => ({
  generateUUID: jest.fn(() => 'generated-uuid'),
}));

jest.mock('../tableWatermark', () => ({
  markChanged: jest.fn(),
}));

import { useSQLiteContext } from 'expo-sqlite';
import { markChanged } from '../tableWatermark';
import { useVendasDatabase } from '../useVendaDatabse';
import { buildLocalVendasQuery } from '../vendasQuery';

const mockUseSQLiteContext = useSQLiteContext as jest.Mock;
const mockMarkChanged = markChanged as jest.Mock;

function makeStatement() {
  return {
    executeAsync: jest.fn(async () => ({})),
    finalizeAsync: jest.fn(async () => {}),
  };
}

function renderVendasDbHook() {
  let result!: ReturnType<typeof useVendasDatabase>;
  function Harness() {
    result = useVendasDatabase();
    return null;
  }
  act(() => {
    TestRenderer.create(<Harness />);
  });
  return result;
}

describe('buildLocalVendasQuery', () => {
  it('parametriza filtros e paginação sem interpolar valores no SQL', () => {
    const query = buildLocalVendasQuery({
      page: 2,
      limit: 25,
      dataInicial: '2026-08-20',
      dataFinal: '2026-08-21',
      horaInicial: '08:30',
      horaFinal: '22:15',
      cliente: "Ana' OR 1=1 --",
      totalMin: '10,50',
      totalMax: 99.9,
    });

    expect(query.select).toContain('LIMIT ? OFFSET ?');
    expect(query.select).not.toContain("Ana' OR 1=1 --");
    expect(query.select).not.toContain('2026-08-20');
    expect(query.select).not.toContain('2026-08-21');
    expect(query.params).toContain("%Ana' OR 1=1 --%");
    expect(query.params).toEqual(expect.arrayContaining(['08:30', '22:15', 10.5, 99.9]));
    expect(query.params.filter((param) => typeof param === 'string' && param.includes('T'))).toHaveLength(2);
    expect(query.params.filter((param) => param === 25)).toHaveLength(2);
    expect(query.count).toContain('COUNT(*)');
    expect(query.sum).toContain('SUM(total)');
    expect(query.count).not.toContain('LIMIT');
    expect(query.sum).not.toContain('OFFSET');
  });

  it('aplica o offset local como modifier parametrizado nas predicates de hora', () => {
    const query = buildLocalVendasQuery({
      horaInicial: '20:00',
      horaFinal: '22:00',
      timezoneOffsetMinutes: 180,
      totalMin: '10,50',
    });

    expect(query.select).toContain("strftime('%H:%M', horario, ?) >= ?");
    expect(query.select).toContain("strftime('%H:%M', horario, ?) <= ?");
    expect(query.select).not.toContain('-03:00');
    expect(query.params.filter((param) => param === '-03:00')).toHaveLength(2);
    expect(query.params).toEqual(expect.arrayContaining(['20:00', '22:00', 10.5]));
    expect(query.countParams.filter((param) => param === '-03:00')).toHaveLength(2);
    expect(query.sumParams.filter((param) => param === '-03:00')).toHaveLength(2);
  });

  it('usa Date.getTimezoneOffset como default quando o filtro de hora não informa offset', () => {
    const getTimezoneOffset = jest.spyOn(Date.prototype, 'getTimezoneOffset').mockReturnValue(180);

    try {
      const query = buildLocalVendasQuery({ horaInicial: '9:00' });
      expect(query.params.filter((param) => param === '-03:00')).toHaveLength(1);
    } finally {
      getTimezoneOffset.mockRestore();
    }
  });

  it('rejeita paginação e filtros de data ou hora inválidos', () => {
    expect(() => buildLocalVendasQuery({ page: 0 })).toThrow(/page/i);
    expect(() => buildLocalVendasQuery({ limit: 101 })).toThrow(/limit/i);
    expect(() => buildLocalVendasQuery({ dataInicial: '20/08/2026' })).toThrow(/dataInicial/i);
    expect(() => buildLocalVendasQuery({ horaFinal: '25:00' })).toThrow(/horaFinal/i);
  });
});

describe('useVendasDatabase — table watermark', () => {
  beforeEach(() => {
    mockMarkChanged.mockReset();
  });

  it('createVenda() marks vendas changed', async () => {
    const db = {
      prepareAsync: jest.fn(async () => makeStatement()),
      getFirstAsync: jest.fn(async () => ({ preco: 10 })),
    };
    mockUseSQLiteContext.mockReturnValue(db);

    const { createVenda } = renderVendasDbHook();
    await createVenda([{ produtoId: 'p1', quantidade: 1 }], 'Cliente Y');

    expect(mockMarkChanged).toHaveBeenCalledWith('vendas');
  });

  it('createFromSync() marks vendas changed', async () => {
    const db = { prepareAsync: jest.fn(async () => makeStatement()) };
    mockUseSQLiteContext.mockReturnValue(db);

    const { createFromSync } = renderVendasDbHook();
    await createFromSync({ id: 'ven-1', total: 10, horario: new Date().toISOString() } as any);

    expect(mockMarkChanged).toHaveBeenCalledWith('vendas');
  });

  it('removeVenda() marks vendas changed', async () => {
    const db = { prepareAsync: jest.fn(async () => makeStatement()) };
    mockUseSQLiteContext.mockReturnValue(db);

    const { removeVenda } = renderVendasDbHook();
    await removeVenda('ven-1');

    expect(mockMarkChanged).toHaveBeenCalledWith('vendas');
  });

  it('listVendasRecentes() pagina, consulta totais e não agrupa a resposta', async () => {
    const venda = {
      id: 'ven-2',
      total: 25,
      horario: '2026-08-21T12:00:00.000Z',
      cliente: 'Ana',
      excluida: false,
      updated_at: 1,
    };
    const db = {
      getAllAsync: jest.fn(async (sql: string, _params: unknown[]) => {
        if (sql.includes('FROM TB_VENDAS')) return [venda];
        return [{ nome: 'X-Burger', quantidade: 2 }];
      }),
      getFirstAsync: jest.fn(async (sql: string) => {
        if (sql.includes('COUNT(*)')) return { total: 5 };
        if (sql.includes('SUM(total)')) return { fechamento: 125 };
        throw new Error(`Consulta inesperada: ${sql}`);
      }),
    };
    mockUseSQLiteContext.mockReturnValue(db);

    const { listVendasRecentes } = renderVendasDbHook();
    const result = await listVendasRecentes({ page: 2, limit: 2, cliente: 'Ana' });

    const [pageSql, pageParams] = db.getAllAsync.mock.calls[0];
    expect(pageSql).toContain('ORDER BY horario DESC, id DESC LIMIT ? OFFSET ?');
    expect(pageParams).toEqual(expect.arrayContaining(['%Ana%', 2]));
    expect(pageParams.filter((param: unknown) => param === 2)).toHaveLength(2);
    expect(db.getFirstAsync).toHaveBeenCalledWith(
      expect.stringContaining('COUNT(*)'),
      expect.arrayContaining(['%Ana%']),
    );
    expect(db.getFirstAsync).toHaveBeenCalledWith(
      expect.stringContaining('SUM(total)'),
      expect.arrayContaining(['%Ana%']),
    );
    expect(result).toEqual({
      vendas: [{ ...venda, produtos: ['( 2x ) X-Burger'] }],
      fechamento: 125,
      pagination: {
        page: 2,
        limit: 2,
        total: 5,
        totalPages: 3,
        hasNextPage: true,
      },
    });
  });
});
