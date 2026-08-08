export type PedidoStatus = 'ABERTO' | 'EM_PREPARO' | 'ENTREGANDO' | 'FECHADO';

const STATUS_COLORS: Record<PedidoStatus, string> = {
  ABERTO: '#dc2626',
  EM_PREPARO: '#d97706',
  ENTREGANDO: '#2563eb',
  FECHADO: '#6b7280',
};

const STATUS_LABELS: Record<PedidoStatus, string> = {
  ABERTO: 'Aberto',
  EM_PREPARO: 'Em Preparo',
  ENTREGANDO: 'Entregando',
  FECHADO: 'Fechado',
};

export function getStatusColor(status: string): string {
  return STATUS_COLORS[status as PedidoStatus] ?? STATUS_COLORS.FECHADO;
}

export function getStatusLabel(status: string): string {
  return STATUS_LABELS[status as PedidoStatus] ?? status;
}
