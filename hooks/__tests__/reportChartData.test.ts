import { buildReportChartData } from '@/hooks/reportChartData';

describe('report chart data', () => {
  it('uses the active translation for the aggregated Other label', () => {
    const result = buildReportChartData(
      [1, 2, 3, 4, 5, 6].map((id) => ({
        id: String(id),
        name: `Product ${id}`,
        price: id,
        totalVendido: id,
      })),
      (key: string) => (key === 'charts.other' ? 'Other' : key),
    );

    expect(result.dadosPizza[result.dadosPizza.length - 1]?.name).toBe('Other');
    expect(result.dadosProgresso.labels[result.dadosProgresso.labels.length - 1]).toBe('Other');
  });
});
