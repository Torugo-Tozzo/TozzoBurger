import { type SQLiteDatabase } from 'expo-sqlite';
import * as api from '@/services/api';

export async function sincronizarComServidor(database: SQLiteDatabase, token: string) {
  try {
    // Collect local unsynced data
    const produtos: any[] = await database.getAllAsync(`SELECT * FROM TB_PRODUTOS WHERE foiSincronizado = 0;`).catch(() => []);
    const vendas: any[] = await database.getAllAsync(`SELECT * FROM TB_VENDAS WHERE foiSincronizado = 0;`).catch(() => []);
    const pedidos: any[] = await database.getAllAsync(`SELECT * FROM TB_PEDIDOS WHERE status IS NOT NULL AND (foiSincronizado = 0 OR foiSincronizado IS NULL);`).catch(() => []);

    const payload = { produtos, vendas, pedidos };

    // push local changes to server first
    await api.sincronizar(token, payload).catch(() => null);

    // then fetch authoritative changes from server
    const changes = await api.getChanges(token).catch(() => null);

    // If server returned authoritative product/tipo lists, replace local copies
    if (changes && Array.isArray(changes.tipos)) {
      try {
        await database.execAsync('BEGIN;');
        await database.execAsync('DELETE FROM TB_TP_PRODUTO;');
        for (const t of changes.tipos) {
          const cor = t.cor ? String(t.cor).replace(/'/g, "''") : '#9E9E9E';
          await database.execAsync(`INSERT INTO TB_TP_PRODUTO (id, descricao, cor) VALUES (${Number(t.id)}, '${String(t.descricao).replace(/'/g, "''")}', '${cor}');`).catch(() => {});
        }
        await database.execAsync('COMMIT;');
      } catch (err) {
        await database.execAsync('ROLLBACK;').catch(() => {});
      }
    }
    if (changes && Array.isArray(changes.produtos)) {
      try {
        await database.execAsync('BEGIN;');
        await database.execAsync('DELETE FROM TB_PRODUTOS;');
        for (const p of changes.produtos) {
          const ingredientes = p.ingredientes ? `'${String(p.ingredientes).replace(/'/g, "''")}'` : 'NULL';
          await database.execAsync(`INSERT INTO TB_PRODUTOS (id, nome, tipoProdutoId, preco, origemProdutoId, ingredientes, foiSincronizado) VALUES (${Number(p.id)}, '${String(p.nome).replace(/'/g, "''")}', ${p.tipoProdutoId ?? 'NULL'}, ${Number(p.preco)}, ${p.origemProdutoId ?? 'NULL'}, ${ingredientes}, 1);`).catch(() => {});
        }
        await database.execAsync('COMMIT;');
      } catch (err) {
        await database.execAsync('ROLLBACK;').catch(() => {});
      }
    }

    // Apply pedidos (orders) from server
    if (changes && Array.isArray(changes.pedidos)) {
      try {
        await database.execAsync('BEGIN;');
        await database.execAsync('DELETE FROM RL_PEDIDO_PRODUTO;');
        await database.execAsync('DELETE FROM TB_PEDIDOS;');
        for (const ped of changes.pedidos) {
          const horario = ped.horario ? `'${String(ped.horario).replace(/'/g, "''")}'` : `'${new Date().toISOString()}'`;
          const cliente = typeof ped.cliente !== 'undefined' && ped.cliente !== null ? `'${String(ped.cliente).replace(/'/g, "''")}'` : 'NULL';
          const status = ped.status ? `'${String(ped.status).replace(/'/g, "''")}'` : `'ABERTO'`;
          await database.execAsync(`INSERT INTO TB_PEDIDOS (id, total, horario, cliente, status) VALUES (${Number(ped.id)}, ${Number(ped.total)}, ${horario}, ${cliente}, ${status});`).catch(() => {});
          if (Array.isArray(ped.items)) {
            for (const it of ped.items) {
              await database.execAsync(`INSERT INTO RL_PEDIDO_PRODUTO (pedidoId, produtoId, quantidade) VALUES (${Number(ped.id)}, ${Number(it.produtoId)}, ${Number(it.quantidade ?? 1)});`).catch(() => {});
            }
          }
        }
        await database.execAsync('COMMIT;');
      } catch (err) {
        await database.execAsync('ROLLBACK;').catch(() => {});
      }
    }

    // Apply vendas (completed sales) from server
    if (changes && Array.isArray(changes.vendas)) {
      try {
        await database.execAsync('BEGIN;');
        await database.execAsync('DELETE FROM RL_VENDA_PRODUTO;');
        await database.execAsync('DELETE FROM TB_VENDAS;');
        for (const ven of changes.vendas) {
          const horario = ven.horario ? `'${String(ven.horario).replace(/'/g, "''")}'` : `'${new Date().toISOString()}'`;
          const cliente = typeof ven.cliente !== 'undefined' && ven.cliente !== null ? `'${String(ven.cliente).replace(/'/g, "''")}'` : 'NULL';
          const excluida = ven.excluida ? 1 : 0;
          await database.execAsync(`INSERT INTO TB_VENDAS (id, total, horario, cliente, excluida) VALUES (${Number(ven.id)}, ${Number(ven.total)}, ${horario}, ${cliente}, ${excluida});`).catch(() => {});
          if (Array.isArray(ven.items)) {
            for (const it of ven.items) {
              await database.execAsync(`INSERT INTO RL_VENDA_PRODUTO (vendaId, produtoId, quantidade) VALUES (${Number(ven.id)}, ${Number(it.produtoId)}, ${Number(it.quantidade ?? 1)});`).catch(() => {});
            }
          }
        }
        await database.execAsync('COMMIT;');
      } catch (err) {
        await database.execAsync('ROLLBACK;').catch(() => {});
      }
    }

    // Mark local pushed records as synced if server accepted
    try {
      await database.execAsync(`UPDATE TB_PRODUTOS SET foiSincronizado = 1 WHERE foiSincronizado = 0;`).catch(() => {});
      await database.execAsync(`UPDATE TB_VENDAS SET foiSincronizado = 1 WHERE foiSincronizado = 0;`).catch(() => {});
      await database.execAsync(`UPDATE TB_PEDIDOS SET foiSincronizado = 1 WHERE (foiSincronizado = 0 OR foiSincronizado IS NULL);`).catch(() => {});
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
