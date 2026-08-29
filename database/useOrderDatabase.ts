import { Q } from '@nozbe/watermelondb';
import type { Clause } from '@nozbe/watermelondb/QueryDescription';

import { useAuth } from '../context/AuthContext';
import type {
  Order as OrderData,
  OrderItem as OrderItemData,
  OrderItemStatus,
} from './types/Order';
import { ORDER_ITEM_STATUS } from './types/Order';
import { markChanged } from './tableWatermark';
import { generateUUID } from './utils/uuid';
import { database } from './watermelon/database';
import OrderModel from './watermelon/models/Order';
import OrderItemModel from './watermelon/models/OrderItem';
import ProductModel from './watermelon/models/Product';

type OrderWithProducts = OrderData & { products: string[] };
type OrderSyncInput = OrderData & {
  items?: OrderItemData[];
  created_at?: number;
  updatedAt?: number;
  opened_at?: number | string;
  customer_name?: string | null;
  is_open?: boolean;
  establishment_id?: string | number | null;
  seller_id?: string | number | null;
};
type OrderItemSyncInput = OrderItemData & {
  product_id?: string;
  unit_price_at_order?: number;
  created_at?: number;
  updated_at?: number;
};

function asEstablishmentId(value: string | number | null | undefined): string {
  return value == null || value === '' ? '' : String(value);
}

function normalizeEstablishmentId(value: string | number | null | undefined): string | null {
  const normalized = asEstablishmentId(value);
  return normalized === '' ? null : normalized;
}

function isOrderItemStatus(value: unknown): value is OrderItemStatus {
  return (
    value === ORDER_ITEM_STATUS.REQUESTED ||
    value === ORDER_ITEM_STATUS.IN_PREPARATION ||
    value === ORDER_ITEM_STATUS.DELIVERED
  );
}

function orderItemStatus(value: unknown): OrderItemStatus {
  if (value == null) return ORDER_ITEM_STATUS.REQUESTED;
  if (!isOrderItemStatus(value)) throw new Error('Status de item inválido');
  return value;
}

function epoch(value: unknown, fallback: number): number {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : fallback;
  }

  if (typeof value === 'number' && Number.isFinite(value)) return value;

  if (typeof value === 'string') {
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) return timestamp;
  }

  return fallback;
}

function orderCollection() {
  return database.get<OrderModel>('orders');
}

function orderItemCollection() {
  return database.get<OrderItemModel>('order_items');
}

function productCollection() {
  return database.get<ProductModel>('products');
}

function toOrderData(order: OrderModel): OrderData {
  return {
    id: order.id,
    total: order.total,
    openedAt: order.openedAt.toISOString(),
    customerName: order.customerName,
    isOpen: order.isOpen,
    establishmentId: order.establishmentId,
    sellerId: order.sellerId || null,
    updated_at: order.updatedAt.getTime(),
    deleted_at: null,
    sync_status: order.syncStatus === 'synced' ? 'synced' : 'pending',
    createdBy: order.sellerId || null,
    createdByName: null,
  };
}

function toOrderItemData(item: OrderItemModel): OrderItemData {
  return {
    id: item.id,
    orderId: item.orderId,
    productId: item.productId,
    quantity: item.quantity,
    status: orderItemStatus(item.status),
    unitPriceAtOrder: item.unitPriceAtOrder,
  };
}

async function findOrder(id: string, establishmentId: string | null): Promise<OrderModel | null> {
  if (!establishmentId) return null;

  const [order] = await orderCollection()
    .query(Q.where('id', id), Q.where('establishment_id', establishmentId))
    .fetch();
  return order ?? null;
}

async function findProduct(id: string, establishmentId: string): Promise<ProductModel | null> {
  const [product] = await productCollection()
    .query(Q.where('id', id), Q.where('establishment_id', establishmentId))
    .fetch();
  return product ?? null;
}

async function productPrice(productId: string, establishmentId: string): Promise<number> {
  const product = await findProduct(productId, establishmentId);
  return product?.price ?? 0;
}

async function calculateTotal(items: OrderItemData[], establishmentId: string): Promise<number> {
  const prices = await Promise.all(
    items.map((item) => productPrice(String(item.productId), establishmentId)),
  );

  return items.reduce(
    (total, item, index) => total + prices[index] * Number(item.quantity),
    0,
  );
}

async function fetchOrderItems(orderId: string, establishmentId: string): Promise<OrderItemModel[]> {
  return orderItemCollection()
    .query(
      Q.where('order_id', orderId),
      Q.on('orders', Q.where('establishment_id', establishmentId)),
    )
    .fetch();
}

async function productNamesForItems(
  items: OrderItemModel[],
  establishmentId: string,
): Promise<{ name: string; quantity: number }[]> {
  const rows = await Promise.all(
    items.map(async (item) => {
      const product = await findProduct(item.productId, establishmentId);
      return product ? { name: product.name, quantity: item.quantity } : null;
    }),
  );

  return rows.filter((row): row is { name: string; quantity: number } => row !== null);
}

function displayedProducts(products: { name: string; quantity: number }[]): string[] {
  const productNames = products.map((product) => `( ${product.quantity}x ) ${product.name}`);
  return productNames.length > 3
    ? [...productNames.slice(0, 3), '...']
    : productNames;
}

async function toOrderWithProducts(
  order: OrderModel,
  establishmentId: string,
): Promise<OrderWithProducts> {
  const items = await fetchOrderItems(order.id, establishmentId);
  const products = await productNamesForItems(items, establishmentId);
  return { ...toOrderData(order), products: displayedProducts(products) };
}

function groupOrdersByDate(orders: OrderWithProducts[]): Record<string, OrderWithProducts[]> {
  const ordersByDate: Record<string, OrderWithProducts[]> = {};

  for (const order of orders) {
    const date = new Date(order.openedAt).toLocaleDateString();
    if (!ordersByDate[date]) ordersByDate[date] = [];
    ordersByDate[date].push(order);
  }

  return ordersByDate;
}

export function useOrderDatabase() {
  const { user } = useAuth();
  const currentEstablishmentId = normalizeEstablishmentId(user?.establishmentId);

  async function createOrder(
    items: OrderItemData[],
    customerName?: string,
    isOpen = true,
    createdBy?: string | number | null,
    createdByName?: string | null,
  ) {
    if (!currentEstablishmentId) {
      throw new Error('Cannot create an order without an authenticated establishment');
    }
    if (typeof isOpen !== 'boolean') throw new Error('isOpen inválido');

    // Keep the positional argument for createdByName for public compatibility.
    void createdByName;

    const now = new Date();
    const total = await calculateTotal(items, currentEstablishmentId);
    const prices = await Promise.all(
      items.map((item) => productPrice(String(item.productId), currentEstablishmentId)),
    );
    const sellerId = createdBy == null ? '' : String(createdBy);

    const order = await database.write(async () => {
      const createdOrder = await orderCollection().create((record) => {
        record.total = total;
        record.openedAt = now;
        record.customerName = customerName ?? null;
        record.isOpen = isOpen;
        record.establishmentId = currentEstablishmentId;
        record.sellerId = sellerId;
        record.createdAt = now;
        record.updatedAt = now;
      });

      const itemsCollection = orderItemCollection();
      for (const [index, item] of items.entries()) {
        await itemsCollection.create((record) => {
          record.quantity = Number(item.quantity);
          record.status = ORDER_ITEM_STATUS.REQUESTED;
          record.orderId = createdOrder.id;
          record.order.set(createdOrder);
          record.productId = String(item.productId);
          record.unitPriceAtOrder = prices[index];
          record.createdAt = now;
          record.updatedAt = now;
        });
      }

      return createdOrder;
    });

    markChanged('orders');
    return { orderId: order.id };
  }

  async function createFromSync(data: OrderData & { items?: OrderItemData[] }) {
    if (!currentEstablishmentId) {
      throw new Error('Cannot sync an order without an authenticated establishment');
    }

    const raw = data as unknown as OrderSyncInput;
    const incomingEstablishmentId = normalizeEstablishmentId(
      raw.establishmentId ?? raw.establishment_id,
    );
    if (incomingEstablishmentId && incomingEstablishmentId !== currentEstablishmentId) {
      throw new Error('Cannot sync an order from another establishment');
    }

    const id = String(raw.id ?? '');
    if (!id) throw new Error('ID inválido');

    const now = Date.now();
    const updatedAt = epoch(raw.updated_at ?? raw.updatedAt, now);
    const createdAt = epoch(raw.created_at, updatedAt);
    const openedAt = epoch(raw.openedAt ?? raw.opened_at, createdAt);
    const isOpen = typeof raw.isOpen === 'boolean'
      ? raw.isOpen
      : typeof raw.is_open === 'boolean'
        ? raw.is_open
        : true;
    const total = Number(raw.total ?? 0);
    const customer = raw.customerName ?? raw.customer_name ?? null;
    const seller = raw.sellerId ?? raw.seller_id ?? raw.createdBy ?? '';
    const items = Array.isArray(raw.items) ? raw.items : [];

    const preparedOrder = orderCollection().prepareCreateFromDirtyRaw({
      id,
      _status: 'synced',
      _changed: '',
      total,
      opened_at: openedAt,
      customer_name: customer,
      is_open: isOpen,
      establishment_id: currentEstablishmentId,
      seller_id: seller == null ? '' : String(seller),
      created_at: createdAt,
      updated_at: updatedAt,
    });

    const preparedItems = items.map((item) => {
      const rawItem = item as OrderItemSyncInput;
      const itemId = rawItem.id ? String(rawItem.id) : generateUUID();
      const itemCreatedAt = epoch(rawItem.created_at, createdAt);
      const itemUpdatedAt = epoch(rawItem.updated_at, updatedAt);

      return orderItemCollection().prepareCreateFromDirtyRaw({
        id: itemId,
        _status: 'synced',
        _changed: '',
        quantity: Number(rawItem.quantity),
        status: orderItemStatus(rawItem.status),
        order_id: id,
        product_id: String(rawItem.productId ?? rawItem.product_id ?? ''),
        unit_price_at_order: Number(rawItem.unitPriceAtOrder ?? rawItem.unit_price_at_order ?? 0),
        created_at: itemCreatedAt,
        updated_at: itemUpdatedAt,
      });
    });

    await database.write(() => database.batch(preparedOrder, ...preparedItems));
    markChanged('orders');
    return { orderId: id };
  }

  async function getOrderById(orderId: string) {
    const order = await findOrder(String(orderId), currentEstablishmentId);

    if (!order) throw new Error(`Pedido com ID ${orderId} não encontrado.`);

    const items = await fetchOrderItems(order.id, currentEstablishmentId!);
    return {
      ...toOrderData(order),
      items: items.map(toOrderItemData),
    };
  }

  async function updateOrder(
    orderId: string,
    items?: OrderItemData[],
    customerName?: string,
    isOpen?: boolean,
  ) {
    if (typeof isOpen !== 'undefined' && typeof isOpen !== 'boolean') {
      throw new Error('isOpen inválido');
    }

    const order = await findOrder(String(orderId), currentEstablishmentId);
    if (!order) {
      // Keep the old no-op behavior for an unknown ID while ensuring an ID
      // from another establishment cannot be mutated.
      markChanged('orders');
      return;
    }

    const hasItemsUpdate = Array.isArray(items);
    const existingItems = hasItemsUpdate
      ? await fetchOrderItems(order.id, currentEstablishmentId!)
      : [];
    const prices = hasItemsUpdate
      ? await Promise.all(items!.map((item) => productPrice(String(item.productId), currentEstablishmentId!)))
      : [];
    const total = hasItemsUpdate
      ? items!.reduce((sum, item, index) => sum + prices[index] * Number(item.quantity), 0)
      : order.total;
    const existingByProduct = new Map<string, OrderItemModel[]>();

    for (const existingItem of existingItems) {
      const key = String(existingItem.productId);
      const group = existingByProduct.get(key) ?? [];
      group.push(existingItem);
      existingByProduct.set(key, group);
    }

    const usedItems = new Set<string>();
    const now = new Date();

    await database.write(async () => {
      if (hasItemsUpdate) {
        const itemsCollection = orderItemCollection();

        for (const [index, item] of items!.entries()) {
          const key = String(item.productId);
          const existingItem = existingByProduct.get(key)?.shift();
          const nextStatus = item.status == null ? undefined : orderItemStatus(item.status);

          if (existingItem) {
            usedItems.add(existingItem.id);
            await existingItem.update((record) => {
              record.quantity = Number(item.quantity);
              if (nextStatus) record.status = nextStatus;
              record.updatedAt = now;
            });
          } else {
            await itemsCollection.create((record) => {
              record.quantity = Number(item.quantity);
              record.status = nextStatus ?? ORDER_ITEM_STATUS.REQUESTED;
              record.orderId = order.id;
              record.order.set(order);
              record.productId = key;
              record.unitPriceAtOrder = prices[index];
              record.createdAt = now;
              record.updatedAt = now;
            });
          }
        }

        for (const existingItem of existingItems) {
          if (!usedItems.has(existingItem.id)) await existingItem.markAsDeleted();
        }
      }

      if (hasItemsUpdate || typeof customerName !== 'undefined' || typeof isOpen !== 'undefined') {
        await order.update((record) => {
          if (hasItemsUpdate) record.total = total;
          if (typeof customerName !== 'undefined') record.customerName = customerName ?? null;
          if (typeof isOpen !== 'undefined') record.isOpen = isOpen;
          record.updatedAt = now;
        });
      }
    });

    markChanged('orders');
  }

  async function removeOrder(orderId: string) {
    const order = await findOrder(String(orderId), currentEstablishmentId);

    if (order) await database.write(() => order.markAsDeleted());
    markChanged('orders');
  }

  async function listRecentOrders(): Promise<Record<string, OrderWithProducts[]>> {
    if (!currentEstablishmentId) return {};

    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

    const orders = await orderCollection()
      .query(
        Q.where('establishment_id', currentEstablishmentId),
        Q.where('is_open', true),
        Q.where('opened_at', Q.gte(threeDaysAgo.getTime())),
        Q.sortBy('opened_at', Q.desc),
        Q.sortBy('id', Q.desc),
        Q.take(500),
      )
      .fetch();

    return groupOrdersByDate(
      await Promise.all(orders.map((order) => toOrderWithProducts(order, currentEstablishmentId!))),
    );
  }

  async function listOrdersByDay(data: string): Promise<OrderWithProducts[]> {
    if (!currentEstablishmentId) return [];

    const startOfDay = new Date(`${data}T00:00:00.000Z`).getTime();
    const endOfDay = new Date(`${data}T23:59:59.999Z`).getTime();
    const orders = await orderCollection()
      .query(
        Q.where('establishment_id', currentEstablishmentId),
        Q.where('is_open', true),
        Q.where('opened_at', Q.gte(startOfDay)),
        Q.where('opened_at', Q.lte(endOfDay)),
        Q.sortBy('opened_at', Q.desc),
        Q.sortBy('id', Q.desc),
      )
      .fetch();

    return Promise.all(orders.map((order) => toOrderWithProducts(order, currentEstablishmentId!)));
  }

  async function getProductsByOrderId(orderId: string) {
    const order = await findOrder(String(orderId), currentEstablishmentId);

    if (!order) throw new Error(`Pedido com ID ${orderId} não encontrado.`);

    const items = await fetchOrderItems(order.id, currentEstablishmentId!);
    return productNamesForItems(items, currentEstablishmentId!);
  }

  async function listRecentOrdersByUser(userId: string | number): Promise<Record<string, OrderWithProducts[]>> {
    if (!currentEstablishmentId) return {};

    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const orders = await orderCollection()
      .query(
        Q.where('establishment_id', currentEstablishmentId),
        Q.where('is_open', true),
        Q.where('seller_id', String(userId)),
        Q.where('opened_at', Q.gte(threeDaysAgo.getTime())),
        Q.sortBy('opened_at', Q.desc),
        Q.sortBy('id', Q.desc),
      )
      .fetch();

    return groupOrdersByDate(
      await Promise.all(orders.map((order) => toOrderWithProducts(order, currentEstablishmentId!))),
    );
  }

  async function countOpenOrders(userId?: string | number | null): Promise<number> {
    if (!currentEstablishmentId) return 0;

    const clauses: Clause[] = [
      Q.where('establishment_id', currentEstablishmentId),
      Q.where('is_open', true),
    ];
    if (userId !== undefined && userId !== null) clauses.push(Q.where('seller_id', String(userId)));

    return (await orderCollection().query(...clauses).fetch()).length;
  }

  return {
    createOrder,
    createFromSync,
    getOrderById,
    getProductsByOrderId,
    updateOrder,
    removeOrder,
    listRecentOrders,
    listOrdersByDay,
    listRecentOrdersByUser,
    countOpenOrders,
    /** @deprecated Use the English order methods. */
    createPedido: createOrder,
    getPedidoById: getOrderById,
    getProdutosByPedidoId: getProductsByOrderId,
    updatePedido: updateOrder,
    removePedido: removeOrder,
    listPedidosRecentes: listRecentOrders,
    listPedidosPorDia: listOrdersByDay,
    listPedidosRecentesPorUsuario: listRecentOrdersByUser,
    countPedidosAbertos: countOpenOrders,
  };
}

export default useOrderDatabase;
