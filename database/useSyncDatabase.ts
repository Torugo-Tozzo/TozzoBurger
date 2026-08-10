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

export async function sincronizarComServidor(database: SQLiteDatabase, token: string) {
  try {
    // read last sync timestamp (if any)
    const schema = await database.getFirstAsync<{ lastSyncAt?: number }>(`SELECT lastSyncAt FROM TB_SCHEMA LIMIT 1`).catch(() => null);
    const since = schema && typeof schema.lastSyncAt !== 'undefined' ? schema.lastSyncAt : null;

    // Collect local products to push: only items changed since last sync (if we have `since`), otherwise push all
    // Prefer explicit pending-state push: send only rows marked as pending
    const produtosLocal: any[] = await database.getAllAsync(
      `SELECT id, nome, tipoProdutoId, preco, origemProdutoId, ingredientes, updated_at, deleted_at FROM TB_PRODUTOS WHERE sync_status = 'pending' OR sync_status IS NULL;`
    ).catch((e) => { console.warn('[sync] query failed', e); return []; });

    // Collect vendas and pedidos to push: only those where every item already has origemProdutoId (so we can reference server product ids)
    const vendasRows: any[] = await database.getAllAsync(`SELECT id, total, horario, cliente, excluida, updated_at, deleted_at, criado_por FROM TB_VENDAS WHERE sync_status = 'pending' OR sync_status IS NULL;`).catch((e) => { console.warn('[sync] query failed', e); return []; });

    const pedidosRows: any[] = await database.getAllAsync(`SELECT id, total, horario, cliente, status, updated_at, deleted_at, criado_por FROM TB_PEDIDOS WHERE sync_status = 'pending' OR sync_status IS NULL;`).catch((e) => { console.warn('[sync] query failed', e); return []; });

    const vendasLocal: any[] = [];
    for (const v of vendasRows) {
      // include relation id and prefer produto origem (server id) when available
      const items = await database.getAllAsync(
        `SELECT R.id as relId, R.vendaId as vendaId, R.produtoId as produtoId, R.quantidade as quantidade, P.origemProdutoId as origemProdutoId
         FROM RL_VENDA_PRODUTO R
         LEFT JOIN TB_PRODUTOS P ON P.id = R.produtoId
         WHERE R.vendaId = ?`,
        [String(v.id)]
      ).catch((e) => { console.warn('[sync] query failed', e); return []; });

      const mappedItems: any[] = (items || []).map((it: any) => ({
        id: it.relId ? String(it.relId) : generateUUID(),
        vendaId: String(v.id),
        produtoId: it.origemProdutoId ? String(it.origemProdutoId) : String(it.produtoId),
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
         WHERE R.pedidoId = ?`,
        [String(p.id)]
      ).catch((e) => { console.warn('[sync] query failed', e); return []; });

      const mappedItems: any[] = (items || []).map((it: any) => ({
        id: it.relId ? String(it.relId) : generateUUID(),
        pedidoId: String(p.id),
        produtoId: it.origemProdutoId ? String(it.origemProdutoId) : String(it.produtoId),
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
          for (const v of vendasLocal) {
            await database.runAsync('UPDATE TB_VENDAS SET sync_status = ? WHERE id = ?', ['synced', String(v.id)]).catch((e) => console.warn('[sync] db op failed', e));
          }
        }
        if (Array.isArray(pedidosLocal) && pedidosLocal.length) {
          for (const p of pedidosLocal) {
            await database.runAsync('UPDATE TB_PEDIDOS SET sync_status = ? WHERE id = ?', ['synced', String(p.id)]).catch((e) => console.warn('[sync] db op failed', e));
          }
        }
      } catch (err) {
        // ignore; we still proceed to per-map handling below
      }
      const mapaProdutos = syncRes.mapaProdutos || syncRes.mapa_produtos || null;
      const mapaPedidos = syncRes.mapaPedidos || syncRes.mapa_pedidos || null;
      const mapaVendas = syncRes.mapaVendas || syncRes.mapa_vendas || null;

      if (mapaProdutos && typeof mapaProdutos === 'object' && Object.keys(mapaProdutos).length > 0) {
        for (const localId of Object.keys(mapaProdutos)) {
          const serverId = String(mapaProdutos[localId]);
          await database.runAsync('UPDATE TB_PRODUTOS SET origemProdutoId = ?, sync_status = ? WHERE id = ?', [serverId, 'synced', String(localId)]).catch((e) => console.warn('[sync] db op failed', e));
          console.log('[sync] mapaProdutos applied', { localId, serverId });
        }
      }

      if (mapaPedidos && typeof mapaPedidos === 'object' && Object.keys(mapaPedidos).length > 0) {
        for (const localId of Object.keys(mapaPedidos)) {
          await database.runAsync('UPDATE TB_PEDIDOS SET sync_status = ? WHERE id = ?', ['synced', String(localId)]).catch((e) => console.warn('[sync] db op failed', e));
        }
      }

      if (mapaVendas && typeof mapaVendas === 'object' && Object.keys(mapaVendas).length > 0) {
        console.log('[sync] mapaVendas', mapaVendas);
        for (const localId of Object.keys(mapaVendas)) {
          const serverId = String(mapaVendas[localId]);
          await database.runAsync('UPDATE TB_VENDAS SET sync_status = ? WHERE id = ?', ['synced', String(localId)]).catch((e) => console.warn('[sync] db op failed', e));
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

    // Replace TB_TP_PRODUTO if server provided tipos
    if (changes && Array.isArray(changes.tiposProduto) && changes.tiposProduto.length > 0) {
      try {
        await database.execAsync('BEGIN;');
        // Apply tipos received from server using conditional upserts:
        // - do INSERT when local row doesn't exist
        // - do UPDATE only when server updated_at >= local.updated_at
        // - honor deleted_at by setting deleted_at and ativo = 0
        for (const t of changes.tiposProduto) {
          const idNum = Number(t.id);
          if (Number.isNaN(idNum)) continue;
          const descricao = String(t.descricao ?? '');
          const cor = t.cor ? String(t.cor) : '#9E9E9E';
          const ativoFlag = typeof t.ativo !== 'undefined' && t.ativo !== null ? (t.ativo ? 1 : 0) : 1;
          const updatedAtRaw = parseTimestamp(t.updated_at ?? t.updatedAt);
          const updatedAt = updatedAtRaw !== null ? updatedAtRaw : Date.now();
          const deletedAtRaw = parseTimestamp(t.deleted_at ?? t.deletedAt);
          const deletedAt = deletedAtRaw !== null ? deletedAtRaw : null;

          const local = await database.getFirstAsync<{ updated_at?: number }>(`SELECT updated_at FROM TB_TP_PRODUTO WHERE id = ? LIMIT 1`, [idNum]).catch(() => null);

          if (!local) {
            await database.runAsync(
              'INSERT OR IGNORE INTO TB_TP_PRODUTO (id, descricao, cor, ativo, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?)',
              [idNum, descricao, cor, ativoFlag, updatedAt, deletedAt]
            ).catch((e) => console.warn('[sync] db op failed', e));
            continue;
          }

          const localUpdated = Number(parseTimestamp(local.updated_at) || 0);
          if (updatedAt >= localUpdated) {
            await database.runAsync(
              'UPDATE TB_TP_PRODUTO SET descricao = ?, cor = ?, ativo = ?, updated_at = ?, deleted_at = ? WHERE id = ?',
              [descricao, cor, ativoFlag, updatedAt, deletedAt, idNum]
            ).catch((e) => console.warn('[sync] db op failed', e));
          }
        }
        await database.execAsync('COMMIT;');
        markChanged('produtos');
      } catch (err) {
        await database.execAsync('ROLLBACK;').catch((e) => console.warn('[sync] db op failed', e));
      }
    }

    // Upsert produtos: match by origemProdutoId OR id to avoid duplicates; respect deleted_at
    if (changes && Array.isArray(changes.produtos) && changes.produtos.length > 0) {
      try {
        await database.execAsync('BEGIN;');
        for (const p of changes.produtos) {
          const id = String(p.id);
          const nome = String(p.nome ?? '');
          const ingredientes = p.ingredientes ? String(p.ingredientes) : null;
          const tipoProdutoId = typeof p.tipoProdutoId !== 'undefined' && p.tipoProdutoId !== null ? Number(p.tipoProdutoId) : null;
          const origemProdutoId = p.origemProdutoId ? String(p.origemProdutoId) : null;
          const updatedAtRaw = parseTimestamp(p.updated_at ?? p.updatedAt);
          const updatedAt = updatedAtRaw !== null ? updatedAtRaw : baseServerTime;
          const deletedAtRaw = parseTimestamp(p.deleted_at ?? p.deletedAt);
          const deletedAt = deletedAtRaw !== null ? deletedAtRaw : null;
          console.log('[sync] produto recebido', {
            id, nome, preco: p.preco, tipoProdutoId: p.tipoProdutoId,
            origemProdutoId: p.origemProdutoId,
            updated_at: updatedAt, deleted_at: deletedAt,
          });

          const local = await database.getFirstAsync<{ updated_at?: number; id?: string }>(`SELECT id, updated_at FROM TB_PRODUTOS WHERE origemProdutoId = ? OR id = ? LIMIT 1`, [id, id]).catch(() => null);

          if (deletedAt !== null && !Number.isNaN(deletedAt)) {
            await database.runAsync(
              'UPDATE TB_PRODUTOS SET deleted_at = ?, updated_at = ? WHERE id = ? OR origemProdutoId = ?',
              [deletedAt, updatedAt, id, id]
            ).catch((e) => console.warn('[sync] db op failed', e));
            continue;
          }

          if (!local) {
            await database.runAsync(
              'INSERT OR IGNORE INTO TB_PRODUTOS (id, nome, tipoProdutoId, preco, origemProdutoId, ingredientes, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
              [id, nome, tipoProdutoId, Number(p.preco ?? 0), origemProdutoId, ingredientes, updatedAt, deletedAt]
            ).catch((e) => console.warn('[sync] db op failed', e));
          } else {
            const localUpdated = Number(parseTimestamp(local.updated_at) || 0);
            if (updatedAt >= localUpdated) {
              const targetId = String(local.id ?? id);
              await database.runAsync(
                'UPDATE TB_PRODUTOS SET nome = ?, tipoProdutoId = ?, preco = ?, origemProdutoId = ?, ingredientes = ?, updated_at = ?, deleted_at = ?, sync_status = ? WHERE id = ?',
                [nome, tipoProdutoId, Number(p.preco ?? 0), origemProdutoId, ingredientes, updatedAt, deletedAt, 'synced', targetId]
              ).catch((e) => console.warn('[sync] db op failed', e));
            }
          }
        }
        await database.execAsync('COMMIT;');
        markChanged('produtos');
      } catch (err) {
        await database.execAsync('ROLLBACK;').catch((e) => console.warn('[sync] db op failed', e));
      }
    }

    // Upsert pedidos (orders) from server
    if (changes && Array.isArray(changes.pedidos) && changes.pedidos.length > 0) {
      try {
        await database.execAsync('BEGIN;');
        for (const ped of changes.pedidos) {
          const id = String(ped.id);
          const horario = ped.horario ? String(ped.horario) : new Date().toISOString();
          const cliente = typeof ped.cliente !== 'undefined' && ped.cliente !== null ? String(ped.cliente) : null;
          const status = ped.status ? String(ped.status) : 'ABERTO';
          const updatedAtRaw = parseTimestamp(ped.updated_at ?? ped.updatedAt);
          const updatedAt = updatedAtRaw !== null ? updatedAtRaw : baseServerTime;
          const deletedAtRaw = parseTimestamp(ped.deleted_at ?? ped.deletedAt);
          const deletedAt = deletedAtRaw !== null ? deletedAtRaw : null;

          if (status === 'FECHADO' || (deletedAt !== null && !Number.isNaN(deletedAt))) {
            await database.runAsync('DELETE FROM RL_PEDIDO_PRODUTO WHERE pedidoId = ?', [id]).catch((e) => console.warn('[sync] db op failed', e));
            await database.runAsync('DELETE FROM TB_PEDIDOS WHERE id = ?', [id]).catch((e) => console.warn('[sync] db op failed', e));
            continue;
          }

          const itensArray = Array.isArray(ped.itens) ? ped.itens : Array.isArray(ped.items) ? ped.items : [];

          const local = await database.getFirstAsync<{ updated_at?: number }>(`SELECT updated_at FROM TB_PEDIDOS WHERE id = ?`, [id]).catch(() => null);

          const criadoPor = ped.usuarioVendedorId ? String(ped.usuarioVendedorId) : (ped.vendedor?.id ? String(ped.vendedor.id) : null);
          const criadoPorNome = ped.vendedor?.nome ? String(ped.vendedor.nome) : null;

          if (!local) {
            await database.runAsync(
              'INSERT INTO TB_PEDIDOS (id, total, horario, cliente, status, updated_at, deleted_at, criado_por, criado_por_nome) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [id, Number(ped.total ?? 0), horario, cliente, status, updatedAt, deletedAt, criadoPor, criadoPorNome]
            ).catch((e) => console.warn('[sync] db op failed', e));
            for (const it of itensArray) {
              const produtoId = String(it.produtoId);
              const relId = it.id ? String(it.id) : generateUUID();
              await database.runAsync(
                'INSERT INTO RL_PEDIDO_PRODUTO (id, pedidoId, produtoId, quantidade) VALUES (?, ?, ?, ?)',
                [relId, id, produtoId, Number(it.quantidade ?? 1)]
              ).catch((e) => console.warn('[sync] db op failed', e));
            }
          } else {
            const localUpdated = Number(local.updated_at || 0);
            if (updatedAt >= localUpdated) {
              await database.runAsync(
                'UPDATE TB_PEDIDOS SET total = ?, horario = ?, cliente = ?, status = ?, updated_at = ?, deleted_at = ?, criado_por = ?, criado_por_nome = ?, sync_status = ? WHERE id = ?',
                [Number(ped.total ?? 0), horario, cliente, status, updatedAt, deletedAt, criadoPor, criadoPorNome, 'synced', id]
              ).catch((e) => console.warn('[sync] db op failed', e));
              await database.runAsync('DELETE FROM RL_PEDIDO_PRODUTO WHERE pedidoId = ?', [id]).catch((e) => console.warn('[sync] db op failed', e));
              for (const it of itensArray) {
                const produtoId = String(it.produtoId);
                const relId = it.id ? String(it.id) : generateUUID();
                await database.runAsync(
                  'INSERT INTO RL_PEDIDO_PRODUTO (id, pedidoId, produtoId, quantidade) VALUES (?, ?, ?, ?)',
                  [relId, id, produtoId, Number(it.quantidade ?? 1)]
                ).catch((e) => console.warn('[sync] db op failed', e));
              }
            }
          }
        }
        await database.execAsync('COMMIT;');
        markChanged('pedidos');
      } catch (err) {
        await database.execAsync('ROLLBACK;').catch((e) => console.warn('[sync] db op failed', e));
      }
    }

    // Upsert vendas (completed sales) from server
    if (changes && Array.isArray(changes.vendas) && changes.vendas.length > 0) {
      try {
        await database.execAsync('BEGIN;');
        for (const ven of changes.vendas) {
          const id = String(ven.id);
          const horario = ven.horario ? String(ven.horario) : new Date().toISOString();
          const cliente = typeof ven.cliente !== 'undefined' && ven.cliente !== null ? String(ven.cliente) : null;
          const excluida = ven.excluida ? 1 : 0;
          const updatedAtRaw = parseTimestamp(ven.updated_at ?? ven.updatedAt);
          const updatedAt = updatedAtRaw !== null ? updatedAtRaw : baseServerTime;
          const deletedAtRaw = parseTimestamp(ven.deleted_at ?? ven.deletedAt);
          const deletedAt = deletedAtRaw !== null ? deletedAtRaw : null;

          const venExcluidaFlag = ven.excluida === true || ven.excluida === 1 || String(ven.excluida) === '1' || String(ven.excluida) === 'true';
          const isVendaDeleted = (deletedAt !== null && !Number.isNaN(deletedAt)) || venExcluidaFlag;
          if (isVendaDeleted) {
            const deletedEpoch = deletedAt !== null && !Number.isNaN(deletedAt) ? deletedAt : updatedAt;
            await database.runAsync(
              'UPDATE TB_VENDAS SET deleted_at = ?, updated_at = ?, excluida = 1 WHERE id = ?',
              [deletedEpoch, updatedAt, id]
            ).catch((e) => console.warn('[sync] db op failed', e));
            continue;
          }

          const itensArray = Array.isArray(ven.itens) ? ven.itens : Array.isArray(ven.items) ? ven.items : [];
          console.log('[sync] venda itens', { id, itensArray });

          const venCriadoPor = ven.usuarioVendedorId ? String(ven.usuarioVendedorId) : (ven.vendedor?.id ? String(ven.vendedor.id) : null);
          const venCriadoPorNome = ven.vendedor?.nome ? String(ven.vendedor.nome) : null;

          const local = await database.getFirstAsync<{ updated_at?: number }>(`SELECT updated_at FROM TB_VENDAS WHERE id = ?`, [id]).catch(() => null);

          if (!local) {
            await database.runAsync(
              'INSERT INTO TB_VENDAS (id, total, horario, cliente, excluida, updated_at, deleted_at, criado_por, criado_por_nome) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [id, Number(ven.total ?? 0), horario, cliente, excluida, updatedAt, deletedAt, venCriadoPor, venCriadoPorNome]
            ).catch((e) => console.warn('[sync] db op failed', e));
            for (const it of itensArray) {
              const produtoId = String(it.produtoId);
              const relId = it.id ? String(it.id) : generateUUID();
              await database.runAsync(
                'INSERT INTO RL_VENDA_PRODUTO (id, vendaId, produtoId, quantidade) VALUES (?, ?, ?, ?)',
                [relId, id, produtoId, Number(it.quantidade ?? 1)]
              ).catch((e) => console.warn('[sync] db op failed', e));
            }
          } else {
            const localUpdated = Number(local.updated_at || 0);
            if (updatedAt >= localUpdated) {
              await database.runAsync(
                'UPDATE TB_VENDAS SET total = ?, horario = ?, cliente = ?, excluida = ?, updated_at = ?, deleted_at = ?, criado_por = ?, criado_por_nome = ?, sync_status = ? WHERE id = ?',
                [Number(ven.total ?? 0), horario, cliente, excluida, updatedAt, deletedAt, venCriadoPor, venCriadoPorNome, 'synced', id]
              ).catch((e) => console.warn('[sync] db op failed', e));
              await database.runAsync('DELETE FROM RL_VENDA_PRODUTO WHERE vendaId = ?', [id]).catch((e) => console.warn('[sync] db op failed', e));
              for (const it of itensArray) {
                const produtoId = String(it.produtoId);
                const relId = it.id ? String(it.id) : generateUUID();
                await database.runAsync(
                  'INSERT INTO RL_VENDA_PRODUTO (id, vendaId, produtoId, quantidade) VALUES (?, ?, ?, ?)',
                  [relId, id, produtoId, Number(it.quantidade ?? 1)]
                ).catch((e) => console.warn('[sync] db op failed', e));
              }
            }
          }
        }
        await database.execAsync('COMMIT;');
        markChanged('vendas');
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
          'DELETE FROM RL_VENDA_PRODUTO WHERE vendaId IN (SELECT id FROM TB_VENDAS WHERE horario < ? AND sync_status = ?)',
          [vendasLimite, 'synced']
        ).catch((e) => console.warn('[sync] db op failed', e));
        await database.runAsync(
          'DELETE FROM TB_VENDAS WHERE horario < ? AND sync_status = ?',
          [vendasLimite, 'synced']
        ).catch((e) => console.warn('[sync] db op failed', e));

        // Remove qualquer pedido FECHADO que ainda reste localmente
        await database.runAsync(
          'DELETE FROM RL_PEDIDO_PRODUTO WHERE pedidoId IN (SELECT id FROM TB_PEDIDOS WHERE status = ? AND sync_status = ?)',
          ['FECHADO', 'synced']
        ).catch((e) => console.warn('[sync] db op failed', e));
        await database.runAsync(
          'DELETE FROM TB_PEDIDOS WHERE status = ? AND sync_status = ?',
          ['FECHADO', 'synced']
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

export default sincronizarComServidor;
