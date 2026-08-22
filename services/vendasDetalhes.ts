import type { VendaRenderizavel } from '@/services/vendas';

// Cache em memória apenas para o detalhe de vendas consultadas na API.
// Vendas do estabelecimento não são persistidas no SQLite do aparelho.
const vendasDetalhes = new Map<string, VendaRenderizavel>();

export function setVendaDetalhes(venda: VendaRenderizavel): void {
  vendasDetalhes.set(venda.id, venda);
}

export function getVendaDetalhes(vendaId: string): VendaRenderizavel | undefined {
  return vendasDetalhes.get(vendaId);
}
