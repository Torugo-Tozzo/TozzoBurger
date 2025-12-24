export type PedidoProduto = { produtoId: string; quantidade: number };

export type PedidoDatabase = {
  id: string;
  total: number;
  horario: string;
  cliente?: string | null;
  status: string;
  updated_at: number;
  deleted_at?: number | null;
};

export const STATUS_PEDIDO = {
  ABERTO: 'ABERTO',
  FECHADO: 'FECHADO',
} as const;