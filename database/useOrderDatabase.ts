import { useSQLiteContext } from "expo-sqlite";
import { OrderItem, Order, ORDER_STATUS } from "./types/Order";
import { generateUUID } from "./utils/uuid";
import { markChanged } from "./tableWatermark";

type OrderStatus = typeof ORDER_STATUS[keyof typeof ORDER_STATUS];

function isValidStatus(value: any): value is OrderStatus {
  return (
    value === ORDER_STATUS.OPEN ||
    value === ORDER_STATUS.IN_PREPARATION ||
    value === ORDER_STATUS.DELIVERING ||
    value === ORDER_STATUS.CLOSED
  );
}

export function useOrderDatabase() {
  const database = useSQLiteContext();

  async function calculateTotal(items: OrderItem[]): Promise<number> {
    let total = 0;

    for (const { productId, quantity } of items) {
      const product = await database.getFirstAsync<{ price: number }>(
        "SELECT price FROM TB_PRODUCTS WHERE id = ?",
        [productId]
      );

      if (product) {
        total += product.price * quantity;
      }
    }

    return total;
  }

  async function createOrder(
    items: OrderItem[],
    customerName?: string,
    status: OrderStatus = ORDER_STATUS.OPEN,
    createdBy?: string | number | null,
    createdByName?: string | null
  ) {
    const stmt = await database.prepareAsync(
      "INSERT INTO TB_ORDERS (id, total, openedAt, customerName, status, updated_at, sync_status, createdBy, createdByName) VALUES ($id, $total, $openedAt, $customerName, $status, $updated_at, $sync_status, $createdBy, $createdByName)"
    );

    try {
      const total = await calculateTotal(items);
      const openedAt = new Date().toISOString();

      if (!isValidStatus(status)) throw new Error('Status inválido');

      const orderId = generateUUID();
      const updatedAt = Date.now();

      await stmt.executeAsync({
        $id: orderId,
        $total: total,
        $openedAt: openedAt,
        $customerName: customerName ?? null,
        $status: status,
        $updated_at: updatedAt,
        $sync_status: 'pending',
        $createdBy: createdBy != null ? String(createdBy) : null,
        $createdByName: createdByName ?? null,
      });

      for (const { productId, quantity } of items) {
        const relId = generateUUID();
        const relStmt = await database.prepareAsync(
          'INSERT INTO RL_ORDER_PRODUCT (id, orderId, productId, quantity) VALUES ($id, $orderId, $productId, $quantity)'
        );
        try {
          await relStmt.executeAsync({ $id: relId, $orderId: orderId, $productId: productId, $quantity: quantity });
        } finally {
          await relStmt.finalizeAsync();
        }
      }

      markChanged('orders')

      return { orderId };
    } finally {
      await stmt.finalizeAsync();
    }
  }

  async function createFromSync(data: Order & { items?: OrderItem[] }) {
    const stmt = await database.prepareAsync(
      "INSERT INTO TB_ORDERS (id, total, openedAt, customerName, status, updated_at, sync_status) VALUES ($id, $total, $openedAt, $customerName, $status, $updated_at, $sync_status)"
    );

    try {
      if (!isValidStatus(data.status)) throw new Error('Status inválido');

      await stmt.executeAsync({
        $id: data.id,
        $total: data.total,
        $openedAt: data.openedAt,
        $customerName: data.customerName ?? null,
        $status: data.status,
        $updated_at: (data as any).updated_at ?? Date.now(),
        $sync_status: 'synced',
      });

      if (Array.isArray(data.items)) {
        for (const { productId, quantity } of data.items) {
          const relId = generateUUID();
          const relStmt = await database.prepareAsync(
            'INSERT INTO RL_ORDER_PRODUCT (id, orderId, productId, quantity) VALUES ($id, $orderId, $productId, $quantity)'
          );
          try {
            await relStmt.executeAsync({ $id: relId, $orderId: data.id, $productId: productId, $quantity: quantity });
          } finally {
            await relStmt.finalizeAsync();
          }
        }
      }

      markChanged('orders')

      return { orderId: data.id };
    } finally {
      await stmt.finalizeAsync();
    }
  }

  async function getOrderById(orderId: string) {
    try {
      const order = await database.getFirstAsync<Order>(
        "SELECT * FROM TB_ORDERS WHERE id = ?",
        [orderId]
      );

      if (!order) throw new Error(`Pedido com ID ${orderId} não encontrado.`);

      const items = await database.getAllAsync<OrderItem>(
        "SELECT productId, quantity FROM RL_ORDER_PRODUCT WHERE orderId = ?",
        [orderId]
      );

      return { ...order, items };
    } catch (error) {
      throw error;
    }
  }

  async function updateOrder(
    orderId: string,
    items?: OrderItem[],
    customerName?: string,
    status?: OrderStatus
  ) {
    try {
      if (Array.isArray(items)) {
        const existing = await database.getAllAsync<{ id: string; productId: string; quantity: number }>(
          `SELECT id, productId, quantity FROM RL_ORDER_PRODUCT WHERE orderId = ?`,
          [orderId]
        );

        const existingMap = new Map<string, string[]>();
        for (const row of existing || []) {
          const key = String(row.productId);
          if (!existingMap.has(key)) existingMap.set(key, []);
          existingMap.get(key)!.push(row.id);
        }

        const usedIds = new Set<string>();

        for (const { productId, quantity } of items) {
          const prodKey = String(productId);
          let relId: string | undefined;

          const list = existingMap.get(prodKey);
          if (list && list.length) {
            relId = list.shift()!;
            const updateRelStmt = await database.prepareAsync(
              'UPDATE RL_ORDER_PRODUCT SET quantity = $quantity WHERE id = $id'
            );
            try {
              await updateRelStmt.executeAsync({ $quantity: Number(quantity), $id: relId });
            } finally {
              await updateRelStmt.finalizeAsync();
            }
          } else {
            relId = generateUUID();
            const insertRelStmt = await database.prepareAsync(
              'INSERT INTO RL_ORDER_PRODUCT (id, orderId, productId, quantity) VALUES ($id, $orderId, $productId, $quantity)'
            );
            try {
              await insertRelStmt.executeAsync({ $id: relId, $orderId: orderId, $productId: productId, $quantity: Number(quantity) });
            } finally {
              await insertRelStmt.finalizeAsync();
            }
          }

          if (relId) usedIds.add(relId);
        }

        // remove leftover relations
        try {
          const toDelete = (existing || []).filter(r => !usedIds.has(r.id));
          for (const row of toDelete) {
            const delStmt = await database.prepareAsync('DELETE FROM RL_ORDER_PRODUCT WHERE id = $id');
            try {
              await delStmt.executeAsync({ $id: row.id });
            } finally {
              await delStmt.finalizeAsync();
            }
          }
        } catch (errDel) {
          // if delete fails, ignore silently
        }

        const total = await calculateTotal(items);
        const updateTotalStmt = await database.prepareAsync(
          'UPDATE TB_ORDERS SET total = $total, updated_at = $updatedAt, sync_status = $syncStatus WHERE id = $id'
        );
        try {
          await updateTotalStmt.executeAsync({ $total: total, $updatedAt: Date.now(), $syncStatus: 'pending', $id: orderId });
        } finally {
          await updateTotalStmt.finalizeAsync();
        }
      }

      if (typeof customerName !== 'undefined') {
        const updateClienteStmt = await database.prepareAsync(
          'UPDATE TB_ORDERS SET customerName = $customerName, updated_at = $updatedAt, sync_status = $syncStatus WHERE id = $id'
        );
        try {
          await updateClienteStmt.executeAsync({ $customerName: customerName ?? null, $updatedAt: Date.now(), $syncStatus: 'pending', $id: orderId });
        } finally {
          await updateClienteStmt.finalizeAsync();
        }
      }

      if (typeof status !== 'undefined') {
        if (status !== null && !isValidStatus(status)) throw new Error('Status inválido');
        const updateStatusStmt = await database.prepareAsync(
          'UPDATE TB_ORDERS SET status = $status, updated_at = $updatedAt, sync_status = $syncStatus WHERE id = $id'
        );
        try {
          await updateStatusStmt.executeAsync({ $status: status ?? null, $updatedAt: Date.now(), $syncStatus: 'pending', $id: orderId });
        } finally {
          await updateStatusStmt.finalizeAsync();
        }
      }

      markChanged('orders')
    } catch (error) {
      throw error;
    }
  }

  async function removeOrder(orderId: string) {
    try {
      const now = Date.now();
      const stmt = await database.prepareAsync(
        'UPDATE TB_ORDERS SET deleted_at = $deletedAt, updated_at = $updatedAt, sync_status = $syncStatus WHERE id = $id'
      );
      try {
        await stmt.executeAsync({ $deletedAt: now, $updatedAt: now, $syncStatus: 'pending', $id: orderId });
      } finally {
        await stmt.finalizeAsync();
      }

      markChanged('orders')
    } catch (error) {
      throw error;
    }
  }

  async function listRecentOrders() {
    try {
      const tresDiasAtras = new Date();
      tresDiasAtras.setDate(tresDiasAtras.getDate() - 3);
      const iso = tresDiasAtras.toISOString();

      const orders = await database.getAllAsync<Order>(
        `SELECT * FROM TB_ORDERS WHERE (deleted_at IS NULL) AND openedAt >= ? ORDER BY openedAt DESC LIMIT 500`,
        [iso]
      );

      const ordersWithProducts = await Promise.all(
        orders.map(async (order) => {
          const products = await database.getAllAsync<{ name: string; quantity: number }>(
            `SELECT P.name, PP.quantity
             FROM RL_ORDER_PRODUCT PP
             JOIN TB_PRODUCTS P ON PP.productId = P.id
             WHERE PP.orderId = ?`,
            [order.id]
          );

          const productNames = products.map(p => `( ${p.quantity}x ) ${p.name}`);

          const displayedProducts = productNames.length > 3 ? [...productNames.slice(0, 3), "..."] : productNames;

          return { ...order, products: displayedProducts };
        })
      );

      const ordersByDate: Record<string, (Order & { products: string[] })[]> = {};

      for (const order of ordersWithProducts) {
        const date = new Date(order.openedAt).toLocaleDateString();
        if (!ordersByDate[date]) ordersByDate[date] = [];
        ordersByDate[date].push(order);
      }

      return ordersByDate;
    } catch (error) {
      throw error;
    }
  }

  async function listOrdersByDay(data: string) {
    try {
      const inicioDoDia = `${data}T00:00:00.000Z`;
      const fimDoDia = `${data}T23:59:59.999Z`;

      const orders = await database.getAllAsync<Order>(
        "SELECT * FROM TB_ORDERS WHERE openedAt BETWEEN ? AND ? AND (deleted_at IS NULL)",
        [inicioDoDia, fimDoDia]
      );

      const ordersWithProducts = await Promise.all(
        orders.map(async (order) => {
          const products = await database.getAllAsync<{ name: string; quantity: number }>(
            `SELECT P.name, PP.quantity
             FROM RL_ORDER_PRODUCT PP
             JOIN TB_PRODUCTS P ON PP.productId = P.id
             WHERE PP.orderId = ?`,
            [order.id]
          );

          const productNames = products.map(p => `( ${p.quantity}x ) ${p.name}`);

          const displayedProducts = productNames.length > 3 ? [...productNames.slice(0, 3), "..."] : productNames;

          return { ...order, products: displayedProducts };
        })
      );

      return ordersWithProducts;
    } catch (error) {
      throw error;
    }
  }

  async function getProductsByOrderId(orderId: string) {
    try {
      const products = await database.getAllAsync<{ name: string; quantity: number }>(
        `SELECT P.name, PP.quantity
         FROM RL_ORDER_PRODUCT PP
         JOIN TB_PRODUCTS P ON PP.productId = P.id
         WHERE PP.orderId = ?`,
        [orderId]
      );

      return products;
    } catch (err) {
      throw err;
    }
  }

  async function listRecentOrdersByUser(userId: string | number) {
    try {
      const tresDiasAtras = new Date();
      tresDiasAtras.setDate(tresDiasAtras.getDate() - 3);
      const iso = tresDiasAtras.toISOString();

      const orders = await database.getAllAsync<Order>(
        `SELECT * FROM TB_ORDERS WHERE (deleted_at IS NULL) AND openedAt >= ? AND createdBy = ? AND status IN (?, ?) ORDER BY openedAt DESC`,
        [iso, String(userId), ORDER_STATUS.OPEN, ORDER_STATUS.IN_PREPARATION]
      );

      const ordersWithProducts = await Promise.all(
        orders.map(async (order) => {
          const products = await database.getAllAsync<{ name: string; quantity: number }>(
            `SELECT P.name, PP.quantity
             FROM RL_ORDER_PRODUCT PP
             JOIN TB_PRODUCTS P ON PP.productId = P.id
             WHERE PP.orderId = ?`,
            [order.id]
          );

          const productNames = products.map(p => `( ${p.quantity}x ) ${p.name}`);
          const displayedProducts = productNames.length > 3 ? [...productNames.slice(0, 3), "..."] : productNames;

          return { ...order, products: displayedProducts };
        })
      );

      const ordersByDate: Record<string, (Order & { products: string[] })[]> = {};
      for (const order of ordersWithProducts) {
        const date = new Date(order.openedAt).toLocaleDateString();
        if (!ordersByDate[date]) ordersByDate[date] = [];
        ordersByDate[date].push(order);
      }

      return ordersByDate;
    } catch (error) {
      throw error;
    }
  }

  async function countOpenOrders(userId?: string | number | null): Promise<number> {
    if (userId) {
      const row = await database.getFirstAsync<{ total: number }>(
        `SELECT COUNT(*) as total FROM TB_ORDERS WHERE status = ? AND deleted_at IS NULL AND createdBy = ?`,
        [ORDER_STATUS.OPEN, String(userId)]
      );
      return row?.total ?? 0;
    }
    const row = await database.getFirstAsync<{ total: number }>(
      `SELECT COUNT(*) as total FROM TB_ORDERS WHERE status = ? AND deleted_at IS NULL`,
      [ORDER_STATUS.OPEN]
    );
    return row?.total ?? 0;
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
