export const ORDER_ITEM_STATUS = {
  REQUESTED: 'REQUESTED',
  IN_PREPARATION: 'IN_PREPARATION',
  DELIVERED: 'DELIVERED',
} as const;

export type OrderItemStatus = typeof ORDER_ITEM_STATUS[keyof typeof ORDER_ITEM_STATUS];

/** @deprecated Used only by the legacy sync adapter until Task 8 removes it. */
export type OrderStatus = 'OPEN' | 'IN_PREPARATION' | 'DELIVERING' | 'CLOSED' | 'NOT_CLOSED';

/** @deprecated Used only by the legacy sync adapter until Task 8 removes it. */
export const ORDER_STATUS = {
  OPEN: 'OPEN',
  IN_PREPARATION: 'IN_PREPARATION',
  DELIVERING: 'DELIVERING',
  CLOSED: 'CLOSED',
  NOT_CLOSED: 'NOT_CLOSED',
  ABERTO: 'OPEN',
  EM_PREPARO: 'IN_PREPARATION',
  ENTREGANDO: 'DELIVERING',
  FECHADO: 'CLOSED',
} as const;

export type OrderItem = {
  id?: string;
  orderId?: string;
  productId: string;
  quantity: number;
  status?: OrderItemStatus;
  unitPriceAtOrder?: number;
};

export type Order = {
  id: string;
  total: number;
  openedAt: string;
  customerName?: string | null;
  isOpen: boolean;
  establishmentId?: string | null;
  sellerId?: string | null;
  updated_at: number;
  deleted_at?: number | null;
  sync_status?: string | null;
  createdBy?: string | null;
  createdByName?: string | null;
};
