import { useSQLiteContext } from "expo-sqlite";
import { PedidoProduto, PedidoDatabase, STATUS_PEDIDO } from "./types/Pedido";
import { generateUUID } from "./utils/uuid";
import { markChanged } from "./tableWatermark";

type PedidoStatus = typeof STATUS_PEDIDO[keyof typeof STATUS_PEDIDO];

function isValidStatus(value: any): value is PedidoStatus {
  return (
    value === STATUS_PEDIDO.ABERTO ||
    value === STATUS_PEDIDO.EM_PREPARO ||
    value === STATUS_PEDIDO.ENTREGANDO ||
    value === STATUS_PEDIDO.FECHADO
  );
}

export function usePedidosDatabase() {
  const database = useSQLiteContext();

  async function calculateTotal(produtos: PedidoProduto[]): Promise<number> {
    let total = 0;

    for (const { produtoId, quantidade } of produtos) {
      const produto = await database.getFirstAsync<{ preco: number }>(
        "SELECT preco FROM TB_PRODUTOS WHERE id = ?",
        [produtoId]
      );

      if (produto) {
        total += produto.preco * quantidade;
      }
    }

    return total;
  }

  async function createPedido(
    produtos: PedidoProduto[],
    cliente?: string,
    status: PedidoStatus = STATUS_PEDIDO.ABERTO,
    criadoPor?: string | number | null,
    criadoPorNome?: string | null
  ) {
    const stmt = await database.prepareAsync(
      "INSERT INTO TB_PEDIDOS (id, total, horario, cliente, status, updated_at, sync_status, criado_por, criado_por_nome) VALUES ($id, $total, $horario, $cliente, $status, $updated_at, $sync_status, $criado_por, $criado_por_nome)"
    );

    try {
      const total = await calculateTotal(produtos);
      const horario = new Date().toISOString();

      if (!isValidStatus(status)) throw new Error('Status inválido');

      const pedidoId = generateUUID();
      const updatedAt = Date.now();

      await stmt.executeAsync({
        $id: pedidoId,
        $total: total,
        $horario: horario,
        $cliente: cliente ?? null,
        $status: status,
        $updated_at: updatedAt,
        $sync_status: 'pending',
        $criado_por: criadoPor != null ? String(criadoPor) : null,
        $criado_por_nome: criadoPorNome ?? null,
      });

      for (const { produtoId, quantidade } of produtos) {
        const relId = generateUUID();
        const relStmt = await database.prepareAsync(
          'INSERT INTO RL_PEDIDO_PRODUTO (id, pedidoId, produtoId, quantidade) VALUES ($id, $pedidoId, $produtoId, $quantidade)'
        );
        try {
          await relStmt.executeAsync({ $id: relId, $pedidoId: pedidoId, $produtoId: produtoId, $quantidade: quantidade });
        } finally {
          await relStmt.finalizeAsync();
        }
      }

      markChanged('pedidos')

      return { pedidoId };
    } finally {
      await stmt.finalizeAsync();
    }
  }

  async function createFromSync(data: PedidoDatabase & { produtos?: PedidoProduto[] }) {
    const stmt = await database.prepareAsync(
      "INSERT INTO TB_PEDIDOS (id, total, horario, cliente, status, updated_at, sync_status) VALUES ($id, $total, $horario, $cliente, $status, $updated_at, $sync_status)"
    );

    try {
      if (!isValidStatus(data.status)) throw new Error('Status inválido');

      await stmt.executeAsync({
        $id: data.id,
        $total: data.total,
        $horario: data.horario,
        $cliente: data.cliente ?? null,
        $status: data.status,
        $updated_at: (data as any).updated_at ?? Date.now(),
        $sync_status: 'synced',
      });

      if (Array.isArray(data.produtos)) {
        for (const { produtoId, quantidade } of data.produtos) {
          const relId = generateUUID();
          const relStmt = await database.prepareAsync(
            'INSERT INTO RL_PEDIDO_PRODUTO (id, pedidoId, produtoId, quantidade) VALUES ($id, $pedidoId, $produtoId, $quantidade)'
          );
          try {
            await relStmt.executeAsync({ $id: relId, $pedidoId: data.id, $produtoId: produtoId, $quantidade: quantidade });
          } finally {
            await relStmt.finalizeAsync();
          }
        }
      }

      markChanged('pedidos')

      return { pedidoId: data.id };
    } finally {
      await stmt.finalizeAsync();
    }
  }

  async function getPedidoById(pedidoId: string) {
    try {
      const pedido = await database.getFirstAsync<PedidoDatabase>(
        "SELECT * FROM TB_PEDIDOS WHERE id = ?",
        [pedidoId]
      );

      if (!pedido) throw new Error(`Pedido com ID ${pedidoId} não encontrado.`);

      const produtos = await database.getAllAsync<PedidoProduto>(
        "SELECT produtoId, quantidade FROM RL_PEDIDO_PRODUTO WHERE pedidoId = ?",
        [pedidoId]
      );

      return { ...pedido, produtos };
    } catch (error) {
      throw error;
    }
  }

  async function updatePedido(
    pedidoId: string,
    produtos?: PedidoProduto[],
    cliente?: string,
    status?: PedidoStatus
  ) {
    try {
      if (Array.isArray(produtos)) {
        const existing = await database.getAllAsync<{ id: string; produtoId: string; quantidade: number }>(
          `SELECT id, produtoId, quantidade FROM RL_PEDIDO_PRODUTO WHERE pedidoId = ?`,
          [pedidoId]
        );

        const existingMap = new Map<string, string[]>();
        for (const row of existing || []) {
          const key = String(row.produtoId);
          if (!existingMap.has(key)) existingMap.set(key, []);
          existingMap.get(key)!.push(row.id);
        }

        const usedIds = new Set<string>();

        for (const { produtoId, quantidade } of produtos) {
          const prodKey = String(produtoId);
          let relId: string | undefined;

          const list = existingMap.get(prodKey);
          if (list && list.length) {
            relId = list.shift()!;
            const updateRelStmt = await database.prepareAsync(
              'UPDATE RL_PEDIDO_PRODUTO SET quantidade = $quantidade WHERE id = $id'
            );
            try {
              await updateRelStmt.executeAsync({ $quantidade: Number(quantidade), $id: relId });
            } finally {
              await updateRelStmt.finalizeAsync();
            }
          } else {
            relId = generateUUID();
            const insertRelStmt = await database.prepareAsync(
              'INSERT INTO RL_PEDIDO_PRODUTO (id, pedidoId, produtoId, quantidade) VALUES ($id, $pedidoId, $produtoId, $quantidade)'
            );
            try {
              await insertRelStmt.executeAsync({ $id: relId, $pedidoId: pedidoId, $produtoId: produtoId, $quantidade: Number(quantidade) });
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
            const delStmt = await database.prepareAsync('DELETE FROM RL_PEDIDO_PRODUTO WHERE id = $id');
            try {
              await delStmt.executeAsync({ $id: row.id });
            } finally {
              await delStmt.finalizeAsync();
            }
          }
        } catch (errDel) {
          // if delete fails, ignore silently
        }

        const total = await calculateTotal(produtos);
        const updateTotalStmt = await database.prepareAsync(
          'UPDATE TB_PEDIDOS SET total = $total, updated_at = $updatedAt, sync_status = $syncStatus WHERE id = $id'
        );
        try {
          await updateTotalStmt.executeAsync({ $total: total, $updatedAt: Date.now(), $syncStatus: 'pending', $id: pedidoId });
        } finally {
          await updateTotalStmt.finalizeAsync();
        }
      }

      if (typeof cliente !== 'undefined') {
        const updateClienteStmt = await database.prepareAsync(
          'UPDATE TB_PEDIDOS SET cliente = $cliente, updated_at = $updatedAt, sync_status = $syncStatus WHERE id = $id'
        );
        try {
          await updateClienteStmt.executeAsync({ $cliente: cliente ?? null, $updatedAt: Date.now(), $syncStatus: 'pending', $id: pedidoId });
        } finally {
          await updateClienteStmt.finalizeAsync();
        }
      }

      if (typeof status !== 'undefined') {
        if (status !== null && !isValidStatus(status)) throw new Error('Status inválido');
        const updateStatusStmt = await database.prepareAsync(
          'UPDATE TB_PEDIDOS SET status = $status, updated_at = $updatedAt, sync_status = $syncStatus WHERE id = $id'
        );
        try {
          await updateStatusStmt.executeAsync({ $status: status ?? null, $updatedAt: Date.now(), $syncStatus: 'pending', $id: pedidoId });
        } finally {
          await updateStatusStmt.finalizeAsync();
        }
      }

      markChanged('pedidos')
    } catch (error) {
      throw error;
    }
  }

  async function removePedido(pedidoId: string) {
    try {
      const now = Date.now();
      const stmt = await database.prepareAsync(
        'UPDATE TB_PEDIDOS SET deleted_at = $deletedAt, updated_at = $updatedAt, sync_status = $syncStatus WHERE id = $id'
      );
      try {
        await stmt.executeAsync({ $deletedAt: now, $updatedAt: now, $syncStatus: 'pending', $id: pedidoId });
      } finally {
        await stmt.finalizeAsync();
      }

      markChanged('pedidos')
    } catch (error) {
      throw error;
    }
  }

  async function listPedidosRecentes() {
    try {
      const tresDiasAtras = new Date();
      tresDiasAtras.setDate(tresDiasAtras.getDate() - 3);
      const iso = tresDiasAtras.toISOString();

      const pedidos = await database.getAllAsync<PedidoDatabase>(
        `SELECT * FROM TB_PEDIDOS WHERE (deleted_at IS NULL) AND horario >= ? ORDER BY horario DESC LIMIT 500`,
        [iso]
      );

      const pedidosComProdutos = await Promise.all(
        pedidos.map(async (pedido) => {
          const produtos = await database.getAllAsync<{ nome: string; quantidade: number }>(
            `SELECT P.nome, PP.quantidade
             FROM RL_PEDIDO_PRODUTO PP
             JOIN TB_PRODUTOS P ON PP.produtoId = P.id
             WHERE PP.pedidoId = ?`,
            [pedido.id]
          );

          const nomesProdutos = produtos.map(p => `( ${p.quantidade}x ) ${p.nome}`);

          const produtosExibidos = nomesProdutos.length > 3 ? [...nomesProdutos.slice(0, 3), "..."] : nomesProdutos;

          return { ...pedido, produtos: produtosExibidos };
        })
      );

      const pedidosPorData: Record<string, (PedidoDatabase & { produtos: string[] })[]> = {};

      for (const pedido of pedidosComProdutos) {
        const dataPedido = new Date(pedido.horario).toLocaleDateString();
        if (!pedidosPorData[dataPedido]) pedidosPorData[dataPedido] = [];
        pedidosPorData[dataPedido].push(pedido);
      }

      return pedidosPorData;
    } catch (error) {
      throw error;
    }
  }

  async function listPedidosPorDia(data: string) {
    try {
      const inicioDoDia = `${data}T00:00:00.000Z`;
      const fimDoDia = `${data}T23:59:59.999Z`;

      const pedidos = await database.getAllAsync<PedidoDatabase>(
        "SELECT * FROM TB_PEDIDOS WHERE horario BETWEEN ? AND ? AND (deleted_at IS NULL)",
        [inicioDoDia, fimDoDia]
      );

      const pedidosComProdutos = await Promise.all(
        pedidos.map(async (pedido) => {
          const produtos = await database.getAllAsync<{ nome: string; quantidade: number }>(
            `SELECT P.nome, PP.quantidade
             FROM RL_PEDIDO_PRODUTO PP
             JOIN TB_PRODUTOS P ON PP.produtoId = P.id
             WHERE PP.pedidoId = ?`,
            [pedido.id]
          );

          const nomesProdutos = produtos.map(p => `( ${p.quantidade}x ) ${p.nome}`);

          const produtosExibidos = nomesProdutos.length > 3 ? [...nomesProdutos.slice(0, 3), "..."] : nomesProdutos;

          return { ...pedido, produtos: produtosExibidos };
        })
      );

      return pedidosComProdutos;
    } catch (error) {
      throw error;
    }
  }

  async function getProdutosByPedidoId(pedidoId: string) {
    try {
      const produtos = await database.getAllAsync<{ nome: string; quantidade: number }>(
        `SELECT P.nome, PP.quantidade
         FROM RL_PEDIDO_PRODUTO PP
         JOIN TB_PRODUTOS P ON PP.produtoId = P.id
         WHERE PP.pedidoId = ?`,
        [pedidoId]
      );

      return produtos;
    } catch (err) {
      throw err;
    }
  }

  async function listPedidosRecentesPorUsuario(userId: string | number) {
    try {
      const tresDiasAtras = new Date();
      tresDiasAtras.setDate(tresDiasAtras.getDate() - 3);
      const iso = tresDiasAtras.toISOString();

      const pedidos = await database.getAllAsync<PedidoDatabase>(
        `SELECT * FROM TB_PEDIDOS WHERE (deleted_at IS NULL) AND horario >= ? AND criado_por = ? AND status IN (?, ?) ORDER BY horario DESC`,
        [iso, String(userId), STATUS_PEDIDO.ABERTO, STATUS_PEDIDO.EM_PREPARO]
      );

      const pedidosComProdutos = await Promise.all(
        pedidos.map(async (pedido) => {
          const produtos = await database.getAllAsync<{ nome: string; quantidade: number }>(
            `SELECT P.nome, PP.quantidade
             FROM RL_PEDIDO_PRODUTO PP
             JOIN TB_PRODUTOS P ON PP.produtoId = P.id
             WHERE PP.pedidoId = ?`,
            [pedido.id]
          );

          const nomesProdutos = produtos.map(p => `( ${p.quantidade}x ) ${p.nome}`);
          const produtosExibidos = nomesProdutos.length > 3 ? [...nomesProdutos.slice(0, 3), "..."] : nomesProdutos;

          return { ...pedido, produtos: produtosExibidos };
        })
      );

      const pedidosPorData: Record<string, (PedidoDatabase & { produtos: string[] })[]> = {};
      for (const pedido of pedidosComProdutos) {
        const dataPedido = new Date(pedido.horario).toLocaleDateString();
        if (!pedidosPorData[dataPedido]) pedidosPorData[dataPedido] = [];
        pedidosPorData[dataPedido].push(pedido);
      }

      return pedidosPorData;
    } catch (error) {
      throw error;
    }
  }

  async function countPedidosAbertos(userId?: string | number | null): Promise<number> {
    if (userId) {
      const row = await database.getFirstAsync<{ total: number }>(
        `SELECT COUNT(*) as total FROM TB_PEDIDOS WHERE status = ? AND deleted_at IS NULL AND criado_por = ?`,
        [STATUS_PEDIDO.ABERTO, String(userId)]
      );
      return row?.total ?? 0;
    }
    const row = await database.getFirstAsync<{ total: number }>(
      `SELECT COUNT(*) as total FROM TB_PEDIDOS WHERE status = ? AND deleted_at IS NULL`,
      [STATUS_PEDIDO.ABERTO]
    );
    return row?.total ?? 0;
  }

  return {
    createPedido,
    createFromSync,
    getPedidoById,
      getProdutosByPedidoId,
    updatePedido,
    removePedido,
    listPedidosRecentes,
    listPedidosPorDia,
    listPedidosRecentesPorUsuario,
    countPedidosAbertos,
  };
}

export default usePedidosDatabase;
