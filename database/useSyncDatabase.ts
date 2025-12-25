import { type SQLiteDatabase } from 'expo-sqlite';
import * as api from '@/services/api';

export async function sincronizarComServidor(database: SQLiteDatabase, token: string) {
  try {
    // Collect local data to push: send full records (IDs are UUID strings)
    const produtosLocal: any[] = await database.getAllAsync(`SELECT id, nome, tipoProdutoId, preco, origemProdutoId, ingredientes, updated_at, deleted_at FROM TB_PRODUTOS;`).catch(() => []);
    const vendasRows: any[] = await database.getAllAsync(`SELECT id, total, horario, cliente, excluida, updated_at, deleted_at FROM TB_VENDAS;`).catch(() => []);
    const pedidosRows: any[] = await database.getAllAsync(`SELECT id, total, horario, cliente, status, updated_at, deleted_at FROM TB_PEDIDOS;`).catch(() => []);

    // Attach items for vendas and pedidos
    const vendasLocal = [] as any[];
    for (const v of vendasRows) {
      const items = await database.getAllAsync(`SELECT produtoId, quantidade FROM RL_VENDA_PRODUTO WHERE vendaId = '${String(v.id).replace(/'/g, "''")}'`).catch(() => []);
      vendasLocal.push({ ...v, itens: items });
    }

    const pedidosLocal = [] as any[];
    for (const p of pedidosRows) {
      const items = await database.getAllAsync(`SELECT produtoId, quantidade FROM RL_PEDIDO_PRODUTO WHERE pedidoId = '${String(p.id).replace(/'/g, "''")}'`).catch(() => []);
      pedidosLocal.push({ ...p, itens: items });
    }

    const payload = { produtos: produtosLocal, vendas: vendasLocal, pedidos: pedidosLocal };

    // push local data to server (POST /sincronizacao/push)
    const syncRes: any = await api.sincronizar(token, payload).catch(() => null);

    // If server returned id maps (idMobile -> idServidor), apply them locally
    if (syncRes) {
      const mapaProdutos = syncRes.mapaProdutos || syncRes.mapa_produtos || null;
      const mapaPedidos = syncRes.mapaPedidos || syncRes.mapa_pedidos || null;

      if (mapaProdutos && typeof mapaProdutos === 'object') {
        try {
          await database.execAsync('BEGIN;');
          for (const localId of Object.keys(mapaProdutos)) {
            const serverId = String(mapaProdutos[localId]);
            await database.execAsync(`UPDATE RL_PEDIDO_PRODUTO SET produtoId = '${serverId}' WHERE produtoId = '${String(localId).replace(/'/g, "''")}'`).catch(() => {});
            await database.execAsync(`UPDATE RL_VENDA_PRODUTO SET produtoId = '${serverId}' WHERE produtoId = '${String(localId).replace(/'/g, "''")}'`).catch(() => {});
            await database.execAsync(`UPDATE TB_PRODUTOS SET origemProdutoId = '${serverId}' WHERE origemProdutoId = '${String(localId).replace(/'/g, "''")}'`).catch(() => {});

            const exists = await database.getFirstAsync(`SELECT id FROM TB_PRODUTOS WHERE id = ?`, [serverId]).catch(() => null);
            if (!exists) {
              await database.execAsync(`UPDATE TB_PRODUTOS SET id = '${serverId}' WHERE id = '${String(localId).replace(/'/g, "''")}'`).catch(() => {});
            } else {
              await database.execAsync(`DELETE FROM TB_PRODUTOS WHERE id = '${String(localId).replace(/'/g, "''")}'`).catch(() => {});
            }
          }
          await database.execAsync('COMMIT;');
        } catch (err) {
          await database.execAsync('ROLLBACK;').catch(() => {});
        }
      }

      if (mapaPedidos && typeof mapaPedidos === 'object') {
        try {
          await database.execAsync('BEGIN;');
          for (const localId of Object.keys(mapaPedidos)) {
            const serverId = String(mapaPedidos[localId]);
            await database.execAsync(`UPDATE RL_PEDIDO_PRODUTO SET pedidoId = '${serverId}' WHERE pedidoId = '${String(localId).replace(/'/g, "''")}'`).catch(() => {});

            const exists = await database.getFirstAsync(`SELECT id FROM TB_PEDIDOS WHERE id = ?`, [serverId]).catch(() => null);
            if (!exists) {
              await database.execAsync(`UPDATE TB_PEDIDOS SET id = '${serverId}' WHERE id = '${String(localId).replace(/'/g, "''")}'`).catch(() => {});
            } else {
              await database.execAsync(`DELETE FROM TB_PEDIDOS WHERE id = '${String(localId).replace(/'/g, "''")}'`).catch(() => {});
            }
          }
          await database.execAsync('COMMIT;');
        } catch (err) {
          await database.execAsync('ROLLBACK;').catch(() => {});
        }
      }
    }

    // then pull authoritative state from server (GET /sincronizacao/pull)
    const changes = await api.getChanges(token).catch(() => null);

    // Replace TB_TP_PRODUTO if server provided tipos
    if (changes && Array.isArray(changes.tipos)) {
      try {
        await database.execAsync('BEGIN;');
        await database.execAsync('DELETE FROM TB_TP_PRODUTO;');
        for (const t of changes.tipos) {
          const cor = t.cor ? String(t.cor).replace(/'/g, "''") : '#9E9E9E';
          await database.execAsync(`INSERT OR IGNORE INTO TB_TP_PRODUTO (id, descricao, cor) VALUES (${Number(t.id)}, '${String(t.descricao).replace(/'/g, "''")}', '${cor}');`).catch(() => {});
        }
        await database.execAsync('COMMIT;');
      } catch (err) {
        await database.execAsync('ROLLBACK;').catch(() => {});
      }
    }

    // Upsert produtos: compare updated_at and respect deleted_at per registro
    if (changes && Array.isArray(changes.produtos)) {
      try {
        await database.execAsync('BEGIN;');
        for (const p of changes.produtos) {
          const id = String(p.id).replace(/'/g, "''");
          const nome = String(p.nome ?? '').replace(/'/g, "''");
          const ingredientes = p.ingredientes ? String(p.ingredientes).replace(/'/g, "''") : null;
          const tipoProdutoId = typeof p.tipoProdutoId !== 'undefined' && p.tipoProdutoId !== null ? Number(p.tipoProdutoId) : null;
          const origemProdutoId = p.origemProdutoId ? String(p.origemProdutoId).replace(/'/g, "''") : null;
          const updatedAt = typeof p.updated_at !== 'undefined' && p.updated_at !== null ? Number(p.updated_at) : 0;
          const deletedAt = typeof p.deleted_at !== 'undefined' && p.deleted_at !== null ? Number(p.deleted_at) : null;

          const local = await database.getFirstAsync<{ updated_at?: number }>(`SELECT updated_at FROM TB_PRODUTOS WHERE id = ?`, [id]).catch(() => null);

          if (deletedAt) {
            // server says deleted -> remove locally
            await database.execAsync(`DELETE FROM RL_PEDIDO_PRODUTO WHERE produtoId = '${id}'`).catch(() => {});
            await database.execAsync(`DELETE FROM RL_VENDA_PRODUTO WHERE produtoId = '${id}'`).catch(() => {});
            await database.execAsync(`DELETE FROM TB_PRODUTOS WHERE id = '${id}'`).catch(() => {});
            continue;
          }

          if (!local) {
            await database.execAsync(`INSERT INTO TB_PRODUTOS (id, nome, tipoProdutoId, preco, origemProdutoId, ingredientes, updated_at, deleted_at) VALUES ('${id}', '${nome}', ${tipoProdutoId === null ? 'NULL' : tipoProdutoId}, ${Number(p.preco ?? 0)}, ${origemProdutoId ? `'${origemProdutoId}'` : 'NULL'}, ${ingredientes ? `'${ingredientes}'` : 'NULL'}, ${updatedAt}, ${deletedAt === null ? 'NULL' : deletedAt});`).catch(() => {});
          } else {
            const localUpdated = Number(local.updated_at || 0);
            if (updatedAt >= localUpdated) {
              await database.execAsync(`UPDATE TB_PRODUTOS SET nome = '${nome}', tipoProdutoId = ${tipoProdutoId === null ? 'NULL' : tipoProdutoId}, preco = ${Number(p.preco ?? 0)}, origemProdutoId = ${origemProdutoId ? `'${origemProdutoId}'` : 'NULL'}, ingredientes = ${ingredientes ? `'${ingredientes}'` : 'NULL'}, updated_at = ${updatedAt}, deleted_at = ${deletedAt === null ? 'NULL' : deletedAt} WHERE id = '${id}'`).catch(() => {});
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

          const local = await database.getFirstAsync<{ updated_at?: number }>(`SELECT updated_at FROM TB_PEDIDOS WHERE id = ?`, [id]).catch(() => null);

          if (deletedAt) {
            await database.execAsync(`DELETE FROM RL_PEDIDO_PRODUTO WHERE pedidoId = '${id}'`).catch(() => {});
            await database.execAsync(`DELETE FROM TB_PEDIDOS WHERE id = '${id}'`).catch(() => {});
            continue;
          }

          const itensArray = Array.isArray(ped.itens) ? ped.itens : Array.isArray(ped.items) ? ped.items : [];

          if (!local) {
            await database.execAsync(`INSERT INTO TB_PEDIDOS (id, total, horario, cliente, status, updated_at, deleted_at) VALUES ('${id}', ${Number(ped.total ?? 0)}, '${horario}', ${cliente ? `'${cliente}'` : 'NULL'}, '${status}', ${updatedAt}, ${deletedAt === null ? 'NULL' : deletedAt});`).catch(() => {});
            if (itensArray.length) {
              for (const it of itensArray) {
                const produtoId = String(it.produtoId).replace(/'/g, "''");
                await database.execAsync(`INSERT INTO RL_PEDIDO_PRODUTO (pedidoId, produtoId, quantidade) VALUES ('${id}', '${produtoId}', ${Number(it.quantidade ?? 1)});`).catch(() => {});
              }
            }
          } else {
            const localUpdated = Number(local.updated_at || 0);
            if (updatedAt >= localUpdated) {
              await database.execAsync(`UPDATE TB_PEDIDOS SET total = ${Number(ped.total ?? 0)}, horario = '${horario}', cliente = ${cliente ? `'${cliente}'` : 'NULL'}, status = '${status}', updated_at = ${updatedAt}, deleted_at = ${deletedAt === null ? 'NULL' : deletedAt} WHERE id = '${id}'`).catch(() => {});
              // replace items
              await database.execAsync(`DELETE FROM RL_PEDIDO_PRODUTO WHERE pedidoId = '${id}'`).catch(() => {});
              if (itensArray.length) {
                for (const it of itensArray) {
                  const produtoId = String(it.produtoId).replace(/'/g, "''");
                  await database.execAsync(`INSERT INTO RL_PEDIDO_PRODUTO (pedidoId, produtoId, quantidade) VALUES ('${id}', '${produtoId}', ${Number(it.quantidade ?? 1)});`).catch(() => {});
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

          const local = await database.getFirstAsync<{ updated_at?: number }>(`SELECT updated_at FROM TB_VENDAS WHERE id = ?`, [id]).catch(() => null);

          if (deletedAt) {
            await database.execAsync(`DELETE FROM RL_VENDA_PRODUTO WHERE vendaId = '${id}'`).catch(() => {});
            await database.execAsync(`DELETE FROM TB_VENDAS WHERE id = '${id}'`).catch(() => {});
            continue;
          }

          const itensArray = Array.isArray(ven.itens) ? ven.itens : Array.isArray(ven.items) ? ven.items : [];

          if (!local) {
            await database.execAsync(`INSERT INTO TB_VENDAS (id, total, horario, cliente, excluida, updated_at, deleted_at) VALUES ('${id}', ${Number(ven.total ?? 0)}, '${horario}', ${cliente ? `'${cliente}'` : 'NULL'}, ${excluida}, ${updatedAt}, ${deletedAt === null ? 'NULL' : deletedAt});`).catch(() => {});
            if (itensArray.length) {
              for (const it of itensArray) {
                const produtoId = String(it.produtoId).replace(/'/g, "''");
                await database.execAsync(`INSERT INTO RL_VENDA_PRODUTO (vendaId, produtoId, quantidade) VALUES ('${id}', '${produtoId}', ${Number(it.quantidade ?? 1)});`).catch(() => {});
              }
            }
          } else {
            const localUpdated = Number(local.updated_at || 0);
            if (updatedAt >= localUpdated) {
              await database.execAsync(`UPDATE TB_VENDAS SET total = ${Number(ven.total ?? 0)}, horario = '${horario}', cliente = ${cliente ? `'${cliente}'` : 'NULL'}, excluida = ${excluida}, updated_at = ${updatedAt}, deleted_at = ${deletedAt === null ? 'NULL' : deletedAt} WHERE id = '${id}'`).catch(() => {});
              await database.execAsync(`DELETE FROM RL_VENDA_PRODUTO WHERE vendaId = '${id}'`).catch(() => {});
              if (itensArray.length) {
                for (const it of itensArray) {
                  const produtoId = String(it.produtoId).replace(/'/g, "''");
                  await database.execAsync(`INSERT INTO RL_VENDA_PRODUTO (vendaId, produtoId, quantidade) VALUES ('${id}', '${produtoId}', ${Number(it.quantidade ?? 1)});`).catch(() => {});
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

    return changes;
  } catch (err) {
    console.warn('Sincronização falhou', err);
    throw err;
  }
}

export default sincronizarComServidor;
