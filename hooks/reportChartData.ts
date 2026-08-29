export type RelatorioProduto = {
  id: string;
  name: string;
  price: number;
  totalVendido: number;
};

type Translate = (key: string) => string;

type ReportChartItem = {
  name: string;
  totalVendido: number;
  color: string;
  legendFontColor: string;
  legendFontSize: number;
};

type ReportChartData = {
  dadosPizza: ReportChartItem[];
  dadosProgresso: { data: number[]; colors: string[]; labels: string[] };
};

const CHART_COLORS = [
  '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
  '#FF9F40', '#8AC054', '#5D9CEC', '#F06292', '#7986CB',
];

function getColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}

export function buildReportChartData(
  relatorioData: RelatorioProduto[],
  t: Translate,
): ReportChartData {
  if (!relatorioData || relatorioData.length === 0) {
    return {
      dadosPizza: [],
      dadosProgresso: { data: [], colors: [], labels: [] },
    };
  }

  const dadosOrdenados = [...relatorioData].sort((a, b) => b.totalVendido - a.totalVendido);
  const dadosPizza: ReportChartItem[] = [];
  const labels: string[] = [];
  const values: number[] = [];
  const colors: string[] = [];

  if (dadosOrdenados.length <= 5) {
    dadosOrdenados.forEach((item, index) => {
      const color = getColor(index);
      colors.push(color);
      dadosPizza.push({
        name: item.name,
        totalVendido: item.totalVendido,
        color,
        legendFontColor: '#7F7F7F',
        legendFontSize: 12,
      });
      labels.push(item.name);
      values.push(item.totalVendido);
    });
  } else {
    const top5 = dadosOrdenados.slice(0, 5);
    const totalOutros = dadosOrdenados
      .slice(5)
      .reduce((sum, item) => sum + item.totalVendido, 0);
    const otherLabel = t('charts.other');

    top5.forEach((item, index) => {
      const color = getColor(index);
      colors.push(color);
      dadosPizza.push({
        name: item.name,
        totalVendido: item.totalVendido,
        color,
        legendFontColor: '#7F7F7F',
        legendFontSize: 12,
      });
      labels.push(item.name);
      values.push(item.totalVendido);
    });

    const otherColor = getColor(5);
    colors.push(otherColor);
    dadosPizza.push({
      name: otherLabel,
      totalVendido: totalOutros,
      color: otherColor,
      legendFontColor: '#7F7F7F',
      legendFontSize: 12,
    });
    labels.push(otherLabel);
    values.push(totalOutros);
  }

  const totalVendido = values.reduce((sum, value) => sum + value, 0);
  return {
    dadosPizza,
    dadosProgresso: {
      data: values.map((value) => value / totalVendido),
      colors,
      labels,
    },
  };
}
