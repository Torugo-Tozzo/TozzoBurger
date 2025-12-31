import { type SQLiteDatabase } from 'expo-sqlite';
import * as api from '@/services/api';
import { generateUUID } from './utils/uuid';

export async function sincronizarComServidor(database: SQLiteDatabase, token: string) {
  try {
    // read last sync timestamp (if any)
    const schema = await database.getFirstAsync<{ lastSyncAt?: number }>(`SELECT lastSyncAt FROM TB_SCHEMA LIMIT 1`).catch(() => null);
    const since = schema && typeof schema.lastSyncAt !== 'undefined' ? schema.lastSyncAt : null;

    // Collect local products to push: only items changed since last sync (if we have `since`), otherwise push all
    // Prefer explicit pending-state push: send only rows marked as pending
    const produtosLocal: any[] = await database.getAllAsync(
      `SELECT id, nome, tipoProdutoId, preco, origemProdutoId, ingredientes, updated_at, deleted_at FROM TB_PRODUTOS WHERE sync_status = 'pending' OR sync_status IS NULL;`
    ).catch(() => []);

    // Collect vendas and pedidos to push: only those where every item already has origemProdutoId (so we can reference server product ids)
    const vendasRows: any[] = await database.getAllAsync(`SELECT id, total, horario, cliente, excluida, updated_at, deleted_at FROM TB_VENDAS WHERE sync_status = 'pending' OR sync_status IS NULL;`).catch(() => []);

    const pedidosRows: any[] = await database.getAllAsync(`SELECT id, total, horario, cliente, status, updated_at, deleted_at FROM TB_PEDIDOS WHERE sync_status = 'pending' OR sync_status IS NULL;`).catch(() => []);

    const vendasLocal: any[] = [];
    for (const v of vendasRows) {
      // include relation id and prefer produto origem (server id) when available
      const items = await database.getAllAsync(
        `SELECT R.id as relId, R.vendaId as vendaId, R.produtoId as produtoId, R.quantidade as quantidade, P.origemProdutoId as origemProdutoId
         FROM RL_VENDA_PRODUTO R
         LEFT JOIN TB_PRODUTOS P ON P.id = R.produtoId
         WHERE R.vendaId = '${String(v.id).replace(/'/g, "''")}'`
      ).catch(() => []);

      const mappedItems: any[] = (items || []).map((it: any) => ({
        id: it.relId ? String(it.relId).replace(/'/g, "''") : generateUUID(),
        vendaId: String(v.id).replace(/'/g, "''"),
        produtoId: it.origemProdutoId ? String(it.origemProdutoId).replace(/'/g, "''") : String(it.produtoId).replace(/'/g, "''"),
        quantidade: Number(it.quantidade ?? 1),
      }));

      vendasLocal.push({ ...v, itens: mappedItems });
    }

    const pedidosLocal: any[] = [];
    for (const p of pedidosRows) {
      // include relation id and prefer produto origem (server id) when available
      const items = await database.getAllAsync(
        `SELECT R.id as relId, R.pedidoId as pedidoId, R.produtoId as produtoId, R.quantidade as quantidade, P.origemProdutoId as origemProdutoId
         FROM RL_PEDIDO_PRODUTO R
         LEFT JOIN TB_PRODUTOS P ON P.id = R.produtoId
         WHERE R.pedidoId = '${String(p.id).replace(/'/g, "''")}'`
      ).catch(() => []);

      const mappedItems: any[] = (items || []).map((it: any) => ({
        id: it.relId ? String(it.relId).replace(/'/g, "''") : generateUUID(),
        pedidoId: String(p.id).replace(/'/g, "''"),
        produtoId: it.origemProdutoId ? String(it.origemProdutoId).replace(/'/g, "''") : String(it.produtoId).replace(/'/g, "''"),
        quantidade: Number(it.quantidade ?? 1),
      }));

      pedidosLocal.push({ ...p, itens: mappedItems });
    }

    const payload = { produtos: produtosLocal, vendas: vendasLocal, pedidos: pedidosLocal };
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
    const syncRes: any = await api.sincronizar(token, payload).catch((err) => {
      console.warn('[sync] push failed', err);
      return null;
    });

    // If server returned id maps (idMobile -> idServidor), apply them locally
    if (syncRes) {
      // If push succeeded but server did not return explicit maps for vendas/pedidos,
      // mark the records we pushed as 'synced' to avoid repeatedly re-sending them.
      // We do this only for vendas and pedidos (not produtos) because produtos
      // require server-origin IDs (origemProdutoId) to be safe to mark fully synced.
      try {
        if (Array.isArray(vendasLocal) && vendasLocal.length) {
          const ids = vendasLocal.map(v => `'${String(v.id).replace(/'/g, "''")}'`).join(',');
          if (ids.length) {
            await database.execAsync(`UPDATE TB_VENDAS SET sync_status = 'synced' WHERE id IN (${ids});`).catch(() => {});
          }
        }
        if (Array.isArray(pedidosLocal) && pedidosLocal.length) {
          const ids = pedidosLocal.map(p => `'${String(p.id).replace(/'/g, "''")}'`).join(',');
          if (ids.length) {
            await database.execAsync(`UPDATE TB_PEDIDOS SET sync_status = 'synced' WHERE id IN (${ids});`).catch(() => {});
          }
        }
      } catch (err) {
        // ignore; we still proceed to per-map handling below
      }
      const mapaProdutos = syncRes.mapaProdutos || syncRes.mapa_produtos || null;
      const mapaPedidos = syncRes.mapaPedidos || syncRes.mapa_pedidos || null;
      const mapaVendas = syncRes.mapaVendas || syncRes.mapa_vendas || null;

      if (mapaProdutos && typeof mapaProdutos === 'object') {
        try {
          await database.execAsync('BEGIN;');
          for (const localId of Object.keys(mapaProdutos)) {
            const serverId = String(mapaProdutos[localId]);
            // set origemProdutoId on local product so we don't send it again
            await database.execAsync(`UPDATE TB_PRODUTOS SET origemProdutoId = '${serverId}', sync_status = 'synced' WHERE id = '${String(localId).replace(/'/g, "''")}'`).catch(() => {});
            console.log('[sync] mapaProdutos applied', { localId, serverId });
          }
          await database.execAsync('COMMIT;');
        } catch (err) {
          await database.execAsync('ROLLBACK;').catch(() => {});
        }
      }

      if (mapaPedidos && typeof mapaPedidos === 'object') {
        console.log('[sync] mapaPedidos', mapaPedidos);
        try {
          await database.execAsync('BEGIN;');
          for (const localId of Object.keys(mapaPedidos)) {
            const serverId = String(mapaPedidos[localId]);
            await database.execAsync(`UPDATE TB_PEDIDOS SET sync_status = 'synced' WHERE id = '${String(localId).replace(/'/g, "''")}'`).catch(() => {});
            console.log('[sync] mapaPedidos applied', { localId, serverId });
          }
          await database.execAsync('COMMIT;');
        } catch (err) {
          await database.execAsync('ROLLBACK;').catch(() => {});
        }
      }

      if (mapaVendas && typeof mapaVendas === 'object') {
        console.log('[sync] mapaVendas', mapaVendas);
        try {
          await database.execAsync('BEGIN;');
          for (const localId of Object.keys(mapaVendas)) {
            const serverId = String(mapaVendas[localId]);
            await database.execAsync(`UPDATE TB_VENDAS SET sync_status = 'synced' WHERE id = '${String(localId).replace(/'/g, "''")}'`).catch(() => {});
            console.log('[sync] mapaVendas applied', { localId, serverId });
          }
          await database.execAsync('COMMIT;');
        } catch (err) {
          await database.execAsync('ROLLBACK;').catch(() => {});
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

    // Replace TB_TP_PRODUTO if server provided tipos
    if (changes && Array.isArray(changes.tipos)) {
      try {
        await database.execAsync('BEGIN;');
        // Upsert received tipos; avoid blind DELETE to prevent destructive behavior on mobile
        for (const t of changes.tipos) {
          const cor = t.cor ? String(t.cor).replace(/'/g, "''") : '#9E9E9E';
          const idNum = Number(t.id);
          await database.execAsync(`INSERT OR REPLACE INTO TB_TP_PRODUTO (id, descricao, cor) VALUES (${idNum}, '${String(t.descricao).replace(/'/g, "''")}', '${cor}');`).catch(() => {});
        }
        await database.execAsync('COMMIT;');
      } catch (err) {
        await database.execAsync('ROLLBACK;').catch(() => {});
      }
    }

    // Upsert produtos: match by origemProdutoId OR id to avoid duplicates; respect deleted_at
    if (changes && Array.isArray(changes.produtos)) {
      try {
        await database.execAsync('BEGIN;');
        for (const p of changes.produtos) {
          const id = String(p.id).replace(/'/g, "''");
          const nome = String(p.nome ?? '').replace(/'/g, "''");
          const ingredientes = p.ingredientes ? String(p.ingredientes).replace(/'/g, "''") : null;
          console.log('[sync] produto recebido', { id, nome, preco: p.preco, tipoProdutoId: p.tipoProdutoId, origemProdutoId: p.origemProdutoId, updated_at: p.updated_at, deleted_at: p.deleted_at });
          const tipoProdutoId = typeof p.tipoProdutoId !== 'undefined' && p.tipoProdutoId !== null ? Number(p.tipoProdutoId) : null;
          const origemProdutoId = p.origemProdutoId ? String(p.origemProdutoId).replace(/'/g, "''") : null;
          const updatedAt = typeof p.updated_at !== 'undefined' && p.updated_at !== null ? Number(p.updated_at) : 0;
          const deletedAt = typeof p.deleted_at !== 'undefined' && p.deleted_at !== null ? Number(p.deleted_at) : null;

          // try to find local by origemProdutoId OR id
          const local = await database.getFirstAsync<{ updated_at?: number; id?: string }>(`SELECT id, updated_at FROM TB_PRODUTOS WHERE origemProdutoId = ? OR id = ? LIMIT 1`, [id, id]).catch(() => null);

          if (deletedAt !== null && !Number.isNaN(deletedAt)) {
            // server says deleted -> mark locally as deleted (soft-delete) instead of removing rows
            await database.execAsync(`UPDATE TB_PRODUTOS SET deleted_at = ${deletedAt}, updated_at = ${updatedAt} WHERE id = '${id}' OR origemProdutoId = '${id}'`).catch(() => {});
            continue;
          }

          if (!local) {
            await database.execAsync(`INSERT OR IGNORE INTO TB_PRODUTOS (id, nome, tipoProdutoId, preco, origemProdutoId, ingredientes, updated_at, deleted_at) VALUES ('${id}', '${nome}', ${tipoProdutoId === null ? 'NULL' : tipoProdutoId}, ${Number(p.preco ?? 0)}, ${origemProdutoId ? `'${origemProdutoId}'` : 'NULL'}, ${ingredientes ? `'${ingredientes}'` : 'NULL'}, ${updatedAt}, ${deletedAt === null ? 'NULL' : deletedAt});`).catch(() => {});
          } else {
            const localUpdated = Number(local.updated_at || 0);
            if (updatedAt >= localUpdated) {
              // update the found record (may be the local id or a mapped record)
              const targetId = String((local.id ?? id)).replace(/'/g, "''");
              await database.execAsync(`UPDATE TB_PRODUTOS SET nome = '${nome}', tipoProdutoId = ${tipoProdutoId === null ? 'NULL' : tipoProdutoId}, preco = ${Number(p.preco ?? 0)}, origemProdutoId = ${origemProdutoId ? `'${origemProdutoId}'` : 'NULL'}, ingredientes = ${ingredientes ? `'${ingredientes}'` : 'NULL'}, updated_at = ${updatedAt}, deleted_at = ${deletedAt === null ? 'NULL' : deletedAt}, sync_status = 'synced' WHERE id = '${targetId}'`).catch(() => {});
            }
          }
        }
        await database.execAsync('COMMIT;');
      } catch (err) {
        await database.execAsync('ROLLBACK;').catch(() => {});
      }
    }

    // Upsert pedidos (orders) from server
    if (changes && Array.isArray(changes.pedidos)) {
      try {
        await database.execAsync('BEGIN;');
        for (const ped of changes.pedidos) {
          const id = String(ped.id).replace(/'/g, "''");
          const horario = ped.horario ? String(ped.horario).replace(/'/g, "''") : new Date().toISOString();
          const cliente = typeof ped.cliente !== 'undefined' && ped.cliente !== null ? String(ped.cliente).replace(/'/g, "''") : null;
          const status = ped.status ? String(ped.status).replace(/'/g, "''") : 'ABERTO';
          const updatedAt = typeof ped.updated_at !== 'undefined' && ped.updated_at !== null ? Number(ped.updated_at) : 0;
          const deletedAt = typeof ped.deleted_at !== 'undefined' && ped.deleted_at !== null ? Number(ped.deleted_at) : null;

          if (deletedAt !== null && !Number.isNaN(deletedAt)) {
            // mark pedido as deleted instead of removing it
            await database.execAsync(`UPDATE TB_PEDIDOS SET deleted_at = ${deletedAt}, updated_at = ${updatedAt} WHERE id = '${id}'`).catch(() => {});
            continue;
          }

          const itensArray = Array.isArray(ped.itens) ? ped.itens : Array.isArray(ped.items) ? ped.items : [];

          const local = await database.getFirstAsync<{ updated_at?: number }>(`SELECT updated_at FROM TB_PEDIDOS WHERE id = ?`, [id]).catch(() => null);

          if (!local) {
            await database.execAsync(`INSERT INTO TB_PEDIDOS (id, total, horario, cliente, status, updated_at, deleted_at) VALUES ('${id}', ${Number(ped.total ?? 0)}, '${horario}', ${cliente ? `'${cliente}'` : 'NULL'}, '${status}', ${updatedAt}, ${deletedAt === null ? 'NULL' : deletedAt});`).catch(() => {});
            if (itensArray.length) {
              for (const it of itensArray) {
                const produtoId = String(it.produtoId).replace(/'/g, "''");
                const relId = it.id ? String(it.id).replace(/'/g, "''") : generateUUID();
                await database.execAsync(`INSERT INTO RL_PEDIDO_PRODUTO (id, pedidoId, produtoId, quantidade) VALUES ('${relId}', '${id}', '${produtoId}', ${Number(it.quantidade ?? 1)});`).catch(() => {});
              }
            }
          } else {
            const localUpdated = Number(local.updated_at || 0);
            if (updatedAt >= localUpdated) {
              await database.execAsync(`UPDATE TB_PEDIDOS SET total = ${Number(ped.total ?? 0)}, horario = '${horario}', cliente = ${cliente ? `'${cliente}'` : 'NULL'}, status = '${status}', updated_at = ${updatedAt}, deleted_at = ${deletedAt === null ? 'NULL' : deletedAt}, sync_status = 'synced' WHERE id = '${id}'`).catch(() => {});
              // replace items
              await database.execAsync(`DELETE FROM RL_PEDIDO_PRODUTO WHERE pedidoId = '${id}'`).catch(() => {});
              if (itensArray.length) {
                for (const it of itensArray) {
                  const produtoId = String(it.produtoId).replace(/'/g, "''");
                  const relId = it.id ? String(it.id).replace(/'/g, "''") : generateUUID();
                  await database.execAsync(`INSERT INTO RL_PEDIDO_PRODUTO (id, pedidoId, produtoId, quantidade) VALUES ('${relId}', '${id}', '${produtoId}', ${Number(it.quantidade ?? 1)});`).catch(() => {});
                }
              }
            }
          }
        }
        await database.execAsync('COMMIT;');
      } catch (err) {
        await database.execAsync('ROLLBACK;').catch(() => {});
      }
    }

    // Upsert vendas (completed sales) from server
    if (changes && Array.isArray(changes.vendas)) {
      try {
        await database.execAsync('BEGIN;');
        for (const ven of changes.vendas) {
          const id = String(ven.id).replace(/'/g, "''");
          const horario = ven.horario ? String(ven.horario).replace(/'/g, "''") : new Date().toISOString();
          const cliente = typeof ven.cliente !== 'undefined' && ven.cliente !== null ? String(ven.cliente).replace(/'/g, "''") : null;
          const excluida = ven.excluida ? 1 : 0;
          const updatedAt = typeof ven.updated_at !== 'undefined' && ven.updated_at !== null ? Number(ven.updated_at) : 0;
          const deletedAt = typeof ven.deleted_at !== 'undefined' && ven.deleted_at !== null ? Number(ven.deleted_at) : null;

          if (deletedAt !== null && !Number.isNaN(deletedAt)) {
            // mark venda as deleted (soft-delete) instead of removing it
            await database.execAsync(`UPDATE TB_VENDAS SET deleted_at = ${deletedAt}, updated_at = ${updatedAt}, excluida = 1 WHERE id = '${id}'`).catch(() => {});
            continue;
          }

          const itensArray = Array.isArray(ven.itens) ? ven.itens : Array.isArray(ven.items) ? ven.items : [];
          console.log('[sync] venda itens', { id, itensArray });

          const local = await database.getFirstAsync<{ updated_at?: number }>(`SELECT updated_at FROM TB_VENDAS WHERE id = ?`, [id]).catch(() => null);

          if (!local) {
            await database.execAsync(`INSERT INTO TB_VENDAS (id, total, horario, cliente, excluida, updated_at, deleted_at) VALUES ('${id}', ${Number(ven.total ?? 0)}, '${horario}', ${cliente ? `'${cliente}'` : 'NULL'}, ${excluida}, ${updatedAt}, ${deletedAt === null ? 'NULL' : deletedAt});`).catch(() => {});
            if (itensArray.length) {
              for (const it of itensArray) {
                const produtoId = String(it.produtoId).replace(/'/g, "''");
                const relId = it.id ? String(it.id).replace(/'/g, "''") : generateUUID();
                await database.execAsync(`INSERT INTO RL_VENDA_PRODUTO (id, vendaId, produtoId, quantidade) VALUES ('${relId}', '${id}', '${produtoId}', ${Number(it.quantidade ?? 1)});`).catch(() => {});
              }
            }
          } else {
            const localUpdated = Number(local.updated_at || 0);
            if (updatedAt >= localUpdated) {
              await database.execAsync(`UPDATE TB_VENDAS SET total = ${Number(ven.total ?? 0)}, horario = '${horario}', cliente = ${cliente ? `'${cliente}'` : 'NULL'}, excluida = ${excluida}, updated_at = ${updatedAt}, deleted_at = ${deletedAt === null ? 'NULL' : deletedAt}, sync_status = 'synced' WHERE id = '${id}'`).catch(() => {});
              await database.execAsync(`DELETE FROM RL_VENDA_PRODUTO WHERE vendaId = '${id}'`).catch(() => {});
              if (itensArray.length) {
                for (const it of itensArray) {
                  const produtoId = String(it.produtoId).replace(/'/g, "''");
                  const relId = it.id ? String(it.id).replace(/'/g, "''") : generateUUID();
                  await database.execAsync(`INSERT INTO RL_VENDA_PRODUTO (id, vendaId, produtoId, quantidade) VALUES ('${relId}', '${id}', '${produtoId}', ${Number(it.quantidade ?? 1)});`).catch(() => {});
                }
              }
            }
          }
        }
        await database.execAsync('COMMIT;');
      } catch (err) {
        await database.execAsync('ROLLBACK;').catch(() => {});
      }
    }

    // update lastSyncAt in schema — only if push and pull were successful
    try {
      if (syncRes && changes !== null) {
        // prefer server-provided timestamp if present
        const serverTime = (changes && (changes.serverTime || changes.now || changes.timestamp)) || null;
        const nowToStore = serverTime && typeof serverTime === 'string' ? Date.parse(serverTime) : (typeof serverTime === 'number' ? serverTime : Date.now());
        if (!Number.isNaN(nowToStore)) {
          await database.execAsync(`UPDATE TB_SCHEMA SET lastSyncAt = ${nowToStore};`).catch(() => {});
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

export default sincronizarComServidor;
