import { Sale } from "@/database/types/Sale";
import { i18n } from "@/i18n";

export interface Produto {
  name: string;
  quantity: number;
  price: number;
}

export function formatarVendaParaImpressao(venda: Sale, produtos: Produto[]): string {
  const locale = i18n.language;
  const formatCurrency = (value: number) => new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
  const formatQuantity = (value: number) => new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  }).format(value);
  const soldAt = new Date(venda.soldAt);
  const formattedDate = new Intl.DateTimeFormat(locale).format(soldAt);
  const formattedTime = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(soldAt);
  const customer = venda.customerName?.trim() || i18n.t('common.notProvided');
  let printContent = `
      \u001b!\u0030\u001bE\u0001TOZZO BURGER\u001bE\u0001\u001b!\u0000
      \n------------- ${i18n.t('printer.saleInfoTitle')} -------------\n
      ${i18n.t('printer.saleNumber')}: #${venda.id}
      ${i18n.t('printer.customer')}: ${customer}
      ${i18n.t('printer.date')}: ${formattedDate} ${i18n.t('printer.at')} ${formattedTime}
      \n---------------- ${i18n.t('printer.itemsTitle')} ----------------\n\n`;

  produtos.forEach((produto) => {
    let productName = produto.name;

    productName = productName.length > 30
      ? productName.slice(0, 27) + "..."
      : productName;

    const totalPrice = formatCurrency(produto.quantity * produto.price);
    
    const numPontosLinha = 48 - (productName.length + totalPrice.length + 8);
    const pontos = ".".repeat(numPontosLinha > 0 ? numPontosLinha : 0);

    printContent += `\x1bE1( ${formatQuantity(produto.quantity)} x ) ${productName}${pontos}${totalPrice}\x1bE0\n`;
    
    printContent += produto.quantity > 1
      ? `    \x1bE1${i18n.t('printer.unitPrice')}: ${formatCurrency(produto.price)}\x1bE0\n\n`
      : '\n';
  });

  printContent += `\n---------------- ${i18n.t('printer.finalAccount')} ----------------\n`;
  printContent += `\n\u001b!\u0030\u001bE\u0001${i18n.t('printer.total')}: ${formatCurrency(venda.total)}\u001bE\u0001\u001b!\u0000\n\n\n\n\n\n`;

  return printContent;
}
