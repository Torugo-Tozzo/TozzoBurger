export type OrderItem = { id?: string; productId: string; quantity: number };

export type Order = {
  id: string;
  total: number;
  openedAt: string;
  customerName?: string | null;
  status: OrderStatus;
  updated_at: number;
  deleted_at?: number | null;
  sync_status?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
};

export const ORDER_STATUS = {
  OPEN: 'OPEN',
  IN_PREPARATION: 'IN_PREPARATION',
  DELIVERING: 'DELIVERING',
  CLOSED: 'CLOSED',
  NOT_CLOSED: 'NOT_CLOSED',
  /** @deprecated legacy source aliases; persisted values remain English. */
  ABERTO: 'OPEN',
  EM_PREPARO: 'IN_PREPARATION',
  ENTREGANDO: 'DELIVERING',
  FECHADO: 'CLOSED',
} as const;

export type OrderStatus = typeof ORDER_STATUS[keyof typeof ORDER_STATUS];
