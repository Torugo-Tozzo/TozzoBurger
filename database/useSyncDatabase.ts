import { type SQLiteDatabase } from 'expo-sqlite';
import * as api from '@/services/api';
import { generateUUID } from './utils/uuid';
import { markChanged } from './tableWatermark';

function parseTimestamp(val: any): number | null {
  if (val === undefined || val === null) return null;
  if (typeof val === 'number' && !Number.isNaN(val)) return val;
  const s = String(val).trim();
  if (/^\d+$/.test(s)) return Number(s);
  const parsed = Date.parse(s);
  return Number.isNaN(parsed) ? null : parsed;
}

export async function synchronizeWithServer(database: SQLiteDatabase, token: string) {
  try {
    // read last sync timestamp (if any)
    const schema = await database.getFirstAsync<{ lastSyncAt?: number }>(`SELECT lastSyncAt FROM TB_SCHEMA LIMIT 1`).catch(() => null);
    const since = schema && typeof schema.lastSyncAt !== 'undefined' ? schema.lastSyncAt : null;

    // Collect local products to push: only items changed since last sync (if we have `since`), otherwise push all
    // Prefer explicit pending-state push: send only rows marked as pending
    const produtosLocal: any[] = await database.getAllAsync(
      `SELECT id, name, productTypeId, price, sourceProductId, ingredients, updated_at, deleted_at FROM TB_PRODUCTS WHERE sync_status = 'pending' OR sync_status IS NULL;`
    ).catch((e) => { console.warn('[sync] query failed', e); return []; });

    // Collect vendas and pedidos to push: only those where every item already has sourceProductId (so we can reference server product ids)
    const vendasRows: any[] = await database.getAllAsync(`SELECT id, total, soldAt, customerName, isCancelled, updated_at, deleted_at, createdBy, createdByName FROM TB_SALES WHERE sync_status = 'pending' OR sync_status IS NULL;`).catch((e) => { console.warn('[sync] query failed', e); return []; });

    const pedidosRows: any[] = await database.getAllAsync(`SELECT id, total, openedAt, customerName, status, updated_at, deleted_at, createdBy, createdByName FROM TB_ORDERS WHERE sync_status = 'pending' OR sync_status IS NULL;`).catch((e) => { console.warn('[sync] query failed', e); return []; });

    const vendasLocal: any[] = [];
    for (const v of vendasRows) {
      // include relation id and prefer produto origem (server id) when available
      const items = await database.getAllAsync(
        `SELECT R.id as relId, R.saleId as saleId, R.productId as productId, R.quantity as quantity, P.sourceProductId as sourceProductId
         FROM RL_SALE_PRODUCT R
         LEFT JOIN TB_PRODUCTS P ON P.id = R.productId
         WHERE R.saleId = ?`,
        [String(v.id)]
      ).catch((e) => { console.warn('[sync] query failed', e); return []; });

      const mappedItems: any[] = (items || []).map((it: any) => ({
        id: it.relId ? String(it.relId) : generateUUID(),
        saleId: String(v.id),
        productId: it.sourceProductId ? String(it.sourceProductId) : String(it.productId),
        quantity: Number(it.quantity ?? 1),
      }));

      vendasLocal.push({ ...v, items: mappedItems, soldAt: v.soldAt });
    }

    const pedidosLocal: any[] = [];
    for (const p of pedidosRows) {
      // include relation id and prefer produto origem (server id) when available
      const items = await database.getAllAsync(
        `SELECT R.id as relId, R.orderId as orderId, R.productId as productId, R.quantity as quantity, P.sourceProductId as sourceProductId
         FROM RL_ORDER_PRODUCT R
         LEFT JOIN TB_PRODUCTS P ON P.id = R.productId
         WHERE R.orderId = ?`,
        [String(p.id)]
      ).catch((e) => { console.warn('[sync] query failed', e); return []; });

      const mappedItems: any[] = (items || []).map((it: any) => ({
        id: it.relId ? String(it.relId) : generateUUID(),
        orderId: String(p.id),
        productId: it.sourceProductId ? String(it.sourceProductId) : String(it.productId),
        quantity: Number(it.quantity ?? 1),
      }));

      pedidosLocal.push({ ...p, items: mappedItems, openedAt: p.openedAt });
    }

    const payload = { products: produtosLocal, sales: vendasLocal, orders: pedidosLocal };
    console.log('[sync] push: payload counts', { produtos: produtosLocal.length, vendas: vendasLocal.length, pedidos: pedidosLocal.length });

    // Detailed debug: log full payload when there is anything to push
    try {
      if ((produtosLocal && produtosLocal.length) || (vendasLocal && vendasLocal.length) || (pedidosLocal && pedidosLocal.length)) {
        console.log('[sync] push payload full', {
          produtos: produtosLocal && produtosLocal.length ? produtosLocal : [],
          vendas: vendasLocal && vendasLocal.length ? vendasLocal : [],
          pedidos: pedidosLocal && pedidosLocal.length ? pedidosLocal : [],
        });

        if (produtosLocal && produtosLocal.length) console.log('[sync] produtos ->', produtosLocal);
        if (vendasLocal && vendasLocal.length) console.log('[sync] vendas ->', vendasLocal);
        if (pedidosLocal && pedidosLocal.length) console.log('[sync] pedidos ->', pedidosLocal);
      }
    } catch (errLog) {
      console.warn('[sync] failed to log push payload', errLog);
    }

    // push local data to server (POST /sincronizacao/push)
    const synchronize = api.synchronize ?? (api as any).sincronizar;
    const syncRes: any = await synchronize(token, payload).catch((err) => {
      console.warn('[sync] push failed', err);
      return null;
    });

    // If server returned id maps (idMobile -> idServidor), apply them locally
    if (syncRes) {
      // If push succeeded but server did not return explicit maps for vendas/pedidos,
      // mark the records we pushed as 'synced' to avoid repeatedly re-sending them.
      // We do this only for vendas and pedidos (not produtos) because produtos
      // require server-origin IDs (sourceProductId) to be safe to mark fully synced.
      try {
        if (Array.isArray(vendasLocal) && vendasLocal.length) {
          for (const v of vendasLocal) {
            await database.runAsync('UPDATE TB_SALES SET sync_status = ? WHERE id = ?', ['synced', String(v.id)]).catch((e) => console.warn('[sync] db op failed', e));
          }
        }
        if (Array.isArray(pedidosLocal) && pedidosLocal.length) {
          for (const p of pedidosLocal) {
            await database.runAsync('UPDATE TB_ORDERS SET sync_status = ? WHERE id = ?', ['synced', String(p.id)]).catch((e) => console.warn('[sync] db op failed', e));
          }
        }
      } catch (err) {
        // ignore; we still proceed to per-map handling below
      }
      const mapaProdutos = syncRes.productIdMap || null;
      const mapaPedidos = syncRes.orderIdMap || null;
      const mapaVendas = syncRes.saleIdMap || null;

      if (mapaProdutos && typeof mapaProdutos === 'object' && Object.keys(mapaProdutos).length > 0) {
        for (const localId of Object.keys(mapaProdutos)) {
          const serverId = String(mapaProdutos[localId]);
          await database.runAsync('UPDATE TB_PRODUCTS SET sourceProductId = ?, sync_status = ? WHERE id = ?', [serverId, 'synced', String(localId)]).catch((e) => console.warn('[sync] db op failed', e));
          console.log('[sync] mapaProdutos applied', { localId, serverId });
        }
      }

      if (mapaPedidos && typeof mapaPedidos === 'object' && Object.keys(mapaPedidos).length > 0) {
        for (const localId of Object.keys(mapaPedidos)) {
          await database.runAsync('UPDATE TB_ORDERS SET sync_status = ? WHERE id = ?', ['synced', String(localId)]).catch((e) => console.warn('[sync] db op failed', e));
        }
      }

      if (mapaVendas && typeof mapaVendas === 'object' && Object.keys(mapaVendas).length > 0) {
        console.log('[sync] mapaVendas', mapaVendas);
        for (const localId of Object.keys(mapaVendas)) {
          const serverId = String(mapaVendas[localId]);
          await database.runAsync('UPDATE TB_SALES SET sync_status = ? WHERE id = ?', ['synced', String(localId)]).catch((e) => console.warn('[sync] db op failed', e));
          console.log('[sync] mapaVendas applied', { localId, serverId });
        }
      }
    }

    // then pull authoritative state from server (GET /sincronizacao/pull)
    // Convert stored lastSyncAt (epoch ms) to ISO string expected by the API.
    let sinceIso: string | undefined = undefined;
    if (schema && typeof schema.lastSyncAt !== 'undefined' && schema.lastSyncAt !== null) {
      const raw = schema.lastSyncAt;
      const s = raw == null ? '' : String(raw).trim();
      const num = /^\d+$/.test(s) ? Number(s) : NaN;
      if (!Number.isNaN(num)) {
        sinceIso = new Date(num).toISOString();
      }
    }

    const changes = sinceIso
      ? await api.getChanges(token, sinceIso).catch((err) => {
          console.warn('[sync] pull failed', err);
          return null;
        })
      : await api.getChanges(token).catch((err) => {
          console.warn('[sync] pull failed', err);
          return null;
        });

    // Debug: log full changes payload for diagnosis of missing deletions
    try {
      console.log('[sync] pull changes', changes);
    } catch (err) {
      // ignore logging errors
    }

    // derive a base server timestamp to use when individual items don't provide `updated_at`
    // support several possible server time fields including `checkpoint`
    const baseServerTimeRaw = changes
      ? parseTimestamp((changes.serverTime || changes.now || changes.timestamp || changes.checkpoint) as any)
      : null;
    const baseServerTime = baseServerTimeRaw !== null ? baseServerTimeRaw : Date.now();

    // Replace TB_PRODUCT_TYPES if server provided tipos
    if (changes && Array.isArray(changes.productTypes) && changes.productTypes.length > 0) {
      try {
        await database.execAsync('BEGIN;');
        // Apply tipos received from server using conditional upserts:
        // - do INSERT when local row doesn't exist
        // - do UPDATE only when server updated_at >= local.updated_at
        // - honor deleted_at by setting deleted_at and isActive = 0
        for (const t of changes.productTypes) {
          const idNum = Number(t.id);
          if (Number.isNaN(idNum)) continue;
          const description = String(t.description ?? '');
          const color = t.color ? String(t.color) : '#9E9E9E';
          const isActive = typeof t.isActive !== 'undefined' && t.isActive !== null ? (t.isActive ? 1 : 0) : 1;
          const updatedAtRaw = parseTimestamp(t.updated_at ?? t.updatedAt);
          const updatedAt = updatedAtRaw !== null ? updatedAtRaw : Date.now();
          const deletedAtRaw = parseTimestamp(t.deleted_at ?? t.deletedAt);
          const deletedAt = deletedAtRaw !== null ? deletedAtRaw : null;

          const local = await database.getFirstAsync<{ updated_at?: number }>(`SELECT updated_at FROM TB_PRODUCT_TYPES WHERE id = ? LIMIT 1`, [idNum]).catch(() => null);

          if (!local) {
            await database.runAsync(
              'INSERT OR IGNORE INTO TB_PRODUCT_TYPES (id, description, color, isActive, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?)',
              [idNum, description, color, isActive, updatedAt, deletedAt]
            ).catch((e) => console.warn('[sync] db op failed', e));
            continue;
          }

          const localUpdated = Number(parseTimestamp(local.updated_at) || 0);
          if (updatedAt >= localUpdated) {
            await database.runAsync(
              'UPDATE TB_PRODUCT_TYPES SET description = ?, color = ?, isActive = ?, updated_at = ?, deleted_at = ? WHERE id = ?',
              [description, color, isActive, updatedAt, deletedAt, idNum]
            ).catch((e) => console.warn('[sync] db op failed', e));
          }
        }
        await database.execAsync('COMMIT;');
        markChanged('products');
      } catch (err) {
        await database.execAsync('ROLLBACK;').catch((e) => console.warn('[sync] db op failed', e));
      }
    }

    // Upsert produtos: match by sourceProductId OR id to avoid duplicates; respect deleted_at
    if (changes && Array.isArray(changes.products) && changes.products.length > 0) {
      try {
        await database.execAsync('BEGIN;');
        for (const p of changes.products) {
          const id = String(p.id);
          const name = String(p.name ?? '');
          const ingredients = p.ingredients ? String(p.ingredients) : null;
          const productTypeId = typeof p.productTypeId !== 'undefined' && p.productTypeId !== null ? Number(p.productTypeId) : null;
          const sourceProductId = p.sourceProductId ? String(p.sourceProductId) : null;
          const updatedAtRaw = parseTimestamp(p.updated_at ?? p.updatedAt);
          const updatedAt = updatedAtRaw !== null ? updatedAtRaw : baseServerTime;
          const deletedAtRaw = parseTimestamp(p.deleted_at ?? p.deletedAt);
          const deletedAt = deletedAtRaw !== null ? deletedAtRaw : null;
          console.log('[sync] produto recebido', {
            id, name, price: p.price, productTypeId: p.productTypeId,
            sourceProductId: p.sourceProductId,
            updated_at: updatedAt, deleted_at: deletedAt,
          });

          const local = await database.getFirstAsync<{ updated_at?: number; id?: string }>(`SELECT id, updated_at FROM TB_PRODUCTS WHERE sourceProductId = ? OR id = ? LIMIT 1`, [id, id]).catch(() => null);

          if (deletedAt !== null && !Number.isNaN(deletedAt)) {
            await database.runAsync(
              'UPDATE TB_PRODUCTS SET deleted_at = ?, updated_at = ? WHERE id = ? OR sourceProductId = ?',
              [deletedAt, updatedAt, id, id]
            ).catch((e) => console.warn('[sync] db op failed', e));
            continue;
          }

          if (!local) {
            await database.runAsync(
              'INSERT OR IGNORE INTO TB_PRODUCTS (id, name, productTypeId, price, sourceProductId, ingredients, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
              [id, name, productTypeId, Number(p.price ?? 0), sourceProductId, ingredients, updatedAt, deletedAt]
            ).catch((e) => console.warn('[sync] db op failed', e));
          } else {
            const localUpdated = Number(parseTimestamp(local.updated_at) || 0);
            if (updatedAt >= localUpdated) {
              const targetId = String(local.id ?? id);
              await database.runAsync(
                'UPDATE TB_PRODUCTS SET name = ?, productTypeId = ?, price = ?, sourceProductId = ?, ingredients = ?, updated_at = ?, deleted_at = ?, sync_status = ? WHERE id = ?',
                [name, productTypeId, Number(p.price ?? 0), sourceProductId, ingredients, updatedAt, deletedAt, 'synced', targetId]
              ).catch((e) => console.warn('[sync] db op failed', e));
            }
          }
        }
        await database.execAsync('COMMIT;');
        markChanged('products');
      } catch (err) {
        await database.execAsync('ROLLBACK;').catch((e) => console.warn('[sync] db op failed', e));
      }
    }

    // Upsert pedidos (orders) from server
    if (changes && Array.isArray(changes.orders) && changes.orders.length > 0) {
      try {
        await database.execAsync('BEGIN;');
        for (const ped of changes.orders) {
          const id = String(ped.id);
          const openedAt = ped.openedAt ? String(ped.openedAt) : new Date().toISOString();
          const customerName = typeof ped.customerName !== 'undefined' && ped.customerName !== null ? String(ped.customerName) : null;
          const status = ped.status ? String(ped.status) : 'OPEN';
          const updatedAtRaw = parseTimestamp(ped.updated_at ?? ped.updatedAt);
          const updatedAt = updatedAtRaw !== null ? updatedAtRaw : baseServerTime;
          const deletedAtRaw = parseTimestamp(ped.deleted_at ?? ped.deletedAt);
          const deletedAt = deletedAtRaw !== null ? deletedAtRaw : null;

          if (status === 'CLOSED' || (deletedAt !== null && !Number.isNaN(deletedAt))) {
            await database.runAsync('DELETE FROM RL_ORDER_PRODUCT WHERE orderId = ?', [id]).catch((e) => console.warn('[sync] db op failed', e));
            await database.runAsync('DELETE FROM TB_ORDERS WHERE id = ?', [id]).catch((e) => console.warn('[sync] db op failed', e));
            continue;
          }

          const itemsArray = Array.isArray(ped.items) ? ped.items : [];

          const local = await database.getFirstAsync<{ updated_at?: number }>(`SELECT updated_at FROM TB_ORDERS WHERE id = ?`, [id]).catch(() => null);

          const createdBy = ped.createdBy ? String(ped.createdBy) : null;
          const createdByName = ped.createdByName ? String(ped.createdByName) : null;

          if (!local) {
            await database.runAsync(
              'INSERT INTO TB_ORDERS (id, total, openedAt, customerName, status, updated_at, deleted_at, createdBy, createdByName) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [id, Number(ped.total ?? 0), openedAt, customerName, status, updatedAt, deletedAt, createdBy, createdByName]
            ).catch((e) => console.warn('[sync] db op failed', e));
            for (const it of itemsArray) {
              const productId = String(it.productId);
              const relId = it.id ? String(it.id) : generateUUID();
              await database.runAsync(
                'INSERT INTO RL_ORDER_PRODUCT (id, orderId, productId, quantity) VALUES (?, ?, ?, ?)',
                [relId, id, productId, Number(it.quantity ?? 1)]
              ).catch((e) => console.warn('[sync] db op failed', e));
            }
          } else {
            const localUpdated = Number(local.updated_at || 0);
            if (updatedAt >= localUpdated) {
              await database.runAsync(
                'UPDATE TB_ORDERS SET total = ?, openedAt = ?, customerName = ?, status = ?, updated_at = ?, deleted_at = ?, createdBy = ?, createdByName = ?, sync_status = ? WHERE id = ?',
                [Number(ped.total ?? 0), openedAt, customerName, status, updatedAt, deletedAt, createdBy, createdByName, 'synced', id]
              ).catch((e) => console.warn('[sync] db op failed', e));
              await database.runAsync('DELETE FROM RL_ORDER_PRODUCT WHERE orderId = ?', [id]).catch((e) => console.warn('[sync] db op failed', e));
              for (const it of itemsArray) {
                const productId = String(it.productId);
                const relId = it.id ? String(it.id) : generateUUID();
                await database.runAsync(
                  'INSERT INTO RL_ORDER_PRODUCT (id, orderId, productId, quantity) VALUES (?, ?, ?, ?)',
                  [relId, id, productId, Number(it.quantity ?? 1)]
                ).catch((e) => console.warn('[sync] db op failed', e));
              }
            }
          }
        }
        await database.execAsync('COMMIT;');
        markChanged('orders');
      } catch (err) {
        await database.execAsync('ROLLBACK;').catch((e) => console.warn('[sync] db op failed', e));
      }
    }

    // Upsert vendas (completed sales) from server
    if (changes && Array.isArray(changes.sales) && changes.sales.length > 0) {
      try {
        await database.execAsync('BEGIN;');
        for (const ven of changes.sales) {
          const id = String(ven.id);
          const soldAt = ven.soldAt ? String(ven.soldAt) : new Date().toISOString();
          const customerName = typeof ven.customerName !== 'undefined' && ven.customerName !== null ? String(ven.customerName) : null;
          const isCancelled = ven.isCancelled ? 1 : 0;
          const updatedAtRaw = parseTimestamp(ven.updated_at ?? ven.updatedAt);
          const updatedAt = updatedAtRaw !== null ? updatedAtRaw : baseServerTime;
          const deletedAtRaw = parseTimestamp(ven.deleted_at ?? ven.deletedAt);
          const deletedAt = deletedAtRaw !== null ? deletedAtRaw : null;

          const isSaleDeleted = (deletedAt !== null && !Number.isNaN(deletedAt)) || isCancelled === 1;
          if (isSaleDeleted) {
            const deletedEpoch = deletedAt !== null && !Number.isNaN(deletedAt) ? deletedAt : updatedAt;
            await database.runAsync(
              'UPDATE TB_SALES SET deleted_at = ?, updated_at = ?, isCancelled = 1 WHERE id = ?',
              [deletedEpoch, updatedAt, id]
            ).catch((e) => console.warn('[sync] db op failed', e));
            continue;
          }

          const itemsArray = Array.isArray(ven.items) ? ven.items : [];
          console.log('[sync] sale items', { id, itemsArray });

          const createdBy = ven.createdBy ? String(ven.createdBy) : null;
          const createdByName = ven.createdByName ? String(ven.createdByName) : null;

          const local = await database.getFirstAsync<{ updated_at?: number }>(`SELECT updated_at FROM TB_SALES WHERE id = ?`, [id]).catch(() => null);

          if (!local) {
            await database.runAsync(
              'INSERT INTO TB_SALES (id, total, soldAt, customerName, isCancelled, updated_at, deleted_at, createdBy, createdByName) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [id, Number(ven.total ?? 0), soldAt, customerName, isCancelled, updatedAt, deletedAt, createdBy, createdByName]
            ).catch((e) => console.warn('[sync] db op failed', e));
            for (const it of itemsArray) {
              const productId = String(it.productId);
              const relId = it.id ? String(it.id) : generateUUID();
              await database.runAsync(
                'INSERT INTO RL_SALE_PRODUCT (id, saleId, productId, quantity) VALUES (?, ?, ?, ?)',
                [relId, id, productId, Number(it.quantity ?? 1)]
              ).catch((e) => console.warn('[sync] db op failed', e));
            }
          } else {
            const localUpdated = Number(local.updated_at || 0);
            if (updatedAt >= localUpdated) {
              await database.runAsync(
                'UPDATE TB_SALES SET total = ?, soldAt = ?, customerName = ?, isCancelled = ?, updated_at = ?, deleted_at = ?, createdBy = ?, createdByName = ?, sync_status = ? WHERE id = ?',
                [Number(ven.total ?? 0), soldAt, customerName, isCancelled, updatedAt, deletedAt, createdBy, createdByName, 'synced', id]
              ).catch((e) => console.warn('[sync] db op failed', e));
              await database.runAsync('DELETE FROM RL_SALE_PRODUCT WHERE saleId = ?', [id]).catch((e) => console.warn('[sync] db op failed', e));
              for (const it of itemsArray) {
                const productId = String(it.productId);
                const relId = it.id ? String(it.id) : generateUUID();
                await database.runAsync(
                  'INSERT INTO RL_SALE_PRODUCT (id, saleId, productId, quantity) VALUES (?, ?, ?, ?)',
                  [relId, id, productId, Number(it.quantity ?? 1)]
                ).catch((e) => console.warn('[sync] db op failed', e));
              }
            }
          }
        }
        await database.execAsync('COMMIT;');
        markChanged('sales');
      } catch (err) {
        await database.execAsync('ROLLBACK;').catch((e) => console.warn('[sync] db op failed', e));
      }
    }

    // Limpeza local baseada na política retornada pelo servidor
    if (changes) {
      const vendasDias = changes.politica?.vendasDias ?? 7;
      const vendasLimite = new Date(Date.now() - vendasDias * 24 * 60 * 60 * 1000).toISOString();

      try {
        // Remove vendas antigas que já foram sincronizadas
        await database.runAsync(
          'DELETE FROM RL_SALE_PRODUCT WHERE saleId IN (SELECT id FROM TB_SALES WHERE soldAt < ? AND sync_status = ?)',
          [vendasLimite, 'synced']
        ).catch((e) => console.warn('[sync] db op failed', e));
        await database.runAsync(
          'DELETE FROM TB_SALES WHERE soldAt < ? AND sync_status = ?',
          [vendasLimite, 'synced']
        ).catch((e) => console.warn('[sync] db op failed', e));

        // Remove qualquer pedido FECHADO que ainda reste localmente
        await database.runAsync(
          'DELETE FROM RL_ORDER_PRODUCT WHERE orderId IN (SELECT id FROM TB_ORDERS WHERE status = ? AND sync_status = ?)',
          ['CLOSED', 'synced']
        ).catch((e) => console.warn('[sync] db op failed', e));
        await database.runAsync(
          'DELETE FROM TB_ORDERS WHERE status = ? AND sync_status = ?',
          ['CLOSED', 'synced']
        ).catch((e) => console.warn('[sync] db op failed', e));
      } catch (err) {
        console.warn('[sync] limpeza local falhou', err);
      }
    }

    // update lastSyncAt in schema — only if push and pull were successful
    try {
      if (syncRes && changes !== null) {
        // prefer server-provided timestamp if present
        const serverTime = (changes && (changes.serverTime || changes.now || changes.timestamp)) || null;
        const nowToStore = serverTime && typeof serverTime === 'string' ? Date.parse(serverTime) : (typeof serverTime === 'number' ? serverTime : Date.now());
        if (!Number.isNaN(nowToStore)) {
          await database.runAsync('UPDATE TB_SCHEMA SET lastSyncAt = ?', [nowToStore]).catch((e) => console.warn('[sync] db op failed', e));
        }
      }
    } catch (err) {
      // ignore
    }
    
    return changes;
  } catch (err) {
    console.warn('Sincronização falhou', err);
    throw err;
  }
}

/** @deprecated Use synchronizeWithServer. */
export const sincronizarComServidor = synchronizeWithServer;
export default synchronizeWithServer;
