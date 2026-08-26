import type { SaleRenderable } from '@/services/sales';

// Cache em memória apenas para o detalhe de vendas consultadas na API.
// Vendas do estabelecimento não são persistidas no SQLite do aparelho.
const salesDetails = new Map<string, SaleRenderable>();

export function setSaleDetails(sale: SaleRenderable): void {
  salesDetails.set(sale.id, sale);
}

export function getSaleDetails(saleId: string): SaleRenderable | undefined {
  return salesDetails.get(saleId);
}

/** @deprecated Use the English names. */
export const setVendaDetalhes = setSaleDetails;
/** @deprecated Use the English names. */
export const getVendaDetalhes = getSaleDetails;
