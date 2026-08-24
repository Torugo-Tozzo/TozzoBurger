export type OrderStatus = 'OPEN' | 'IN_PREPARATION' | 'DELIVERING' | 'CLOSED';

export function normalizeOrderStatus(status: unknown): OrderStatus {
  switch (String(status ?? '').toUpperCase()) {
    case 'ABERTO':
    case 'OPEN': return 'OPEN';
    case 'EM_PREPARO':
    case 'IN_PREPARATION': return 'IN_PREPARATION';
    case 'ENTREGANDO':
    case 'DELIVERING': return 'DELIVERING';
    case 'FECHADO':
    case 'CLOSED': return 'CLOSED';
    default: return 'OPEN';
  }
}

const STATUS_COLORS: Record<OrderStatus, string> = {
  OPEN: '#dc2626',
  IN_PREPARATION: '#d97706',
  DELIVERING: '#2563eb',
  CLOSED: '#6b7280',
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  OPEN: 'Open',
  IN_PREPARATION: 'In preparation',
  DELIVERING: 'Delivering',
  CLOSED: 'Closed',
};

export function getStatusColor(status: string): string {
  return STATUS_COLORS[normalizeOrderStatus(status)] ?? STATUS_COLORS.CLOSED;
}

export function getStatusLabel(status: string): string {
  return STATUS_LABELS[normalizeOrderStatus(status)] ?? status;
}
