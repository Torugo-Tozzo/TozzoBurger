export type PedidoProduto = { produtoId: string; quantidade: number };

export type PedidoDatabase = {
  id: string;
  total: number;
  horario: string;
  cliente?: string | null;
  status: string;
  updated_at: number;
  deleted_at?: number | null;
  sync_status?: string | null;
  criado_por?: string | null;
};

export const STATUS_PEDIDO = {
  ABERTO: 'ABERTO',
  EM_PREPARO: 'EM_PREPARO',
  ENTREGANDO: 'ENTREGANDO',
  FECHADO: 'FECHADO',
} as const;