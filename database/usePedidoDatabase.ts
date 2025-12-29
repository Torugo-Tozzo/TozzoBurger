import { useSQLiteContext } from "expo-sqlite";
import { PedidoProduto, PedidoDatabase, STATUS_PEDIDO } from "./types/Pedido";
import { generateUUID } from "./utils/uuid";

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
    status: PedidoStatus = STATUS_PEDIDO.ABERTO
  ) {
    const stmt = await database.prepareAsync(
      "INSERT INTO TB_PEDIDOS (id, total, horario, cliente, status, updated_at, sync_status) VALUES ($id, $total, $horario, $cliente, $status, $updated_at, $sync_status)"
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
      });

      for (const { produtoId, quantidade } of produtos) {
        const relId = generateUUID();
        await database.execAsync(`INSERT INTO RL_PEDIDO_PRODUTO (id, pedidoId, produtoId, quantidade) VALUES ('${relId}', '${pedidoId}', '${produtoId}', ${quantidade})`);
      }

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
          await database.execAsync(`INSERT INTO RL_PEDIDO_PRODUTO (id, pedidoId, produtoId, quantidade) VALUES ('${relId}', '${data.id}', '${produtoId}', ${quantidade})`);
        }
      }

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
        await database.execAsync(`DELETE FROM RL_PEDIDO_PRODUTO WHERE pedidoId = '${pedidoId}'`);

        for (const { produtoId, quantidade } of produtos) {
          const relId = generateUUID();
          await database.execAsync(`INSERT INTO RL_PEDIDO_PRODUTO (id, pedidoId, produtoId, quantidade) VALUES ('${relId}', '${pedidoId}', '${produtoId}', ${quantidade})`);
        }

        const total = await calculateTotal(produtos);
        await database.execAsync(`UPDATE TB_PEDIDOS SET total = ${total}, updated_at = ${Date.now()}, sync_status = 'pending' WHERE id = '${pedidoId}'`);
      }

      if (typeof cliente !== 'undefined') {
        await database.execAsync(`UPDATE TB_PEDIDOS SET cliente = '${cliente}', updated_at = ${Date.now()}, sync_status = 'pending' WHERE id = '${pedidoId}'`);
      }

      if (typeof status !== 'undefined') {
        if (!isValidStatus(status)) throw new Error('Status inválido');
        await database.execAsync(`UPDATE TB_PEDIDOS SET status = '${status}', updated_at = ${Date.now()}, sync_status = 'pending' WHERE id = '${pedidoId}'`);
      }
    } catch (error) {
      throw error;
    }
  }

  async function removePedido(pedidoId: string) {
    try {
      const deletedAt = Date.now();
      await database.execAsync(`UPDATE TB_PEDIDOS SET deleted_at = ${deletedAt}, updated_at = ${deletedAt}, sync_status = 'pending' WHERE id = '${pedidoId}'`);
      // keep RL_PEDIDO_PRODUTO rows for safety; backend should treat tombstoned pedido
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
        `SELECT * FROM TB_PEDIDOS ORDER BY horario DESC`,
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
        "SELECT * FROM TB_PEDIDOS WHERE horario BETWEEN ? AND ?",
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

  return {
    createPedido,
    createFromSync,
    getPedidoById,
    updatePedido,
    removePedido,
    listPedidosRecentes,
    listPedidosPorDia,
  };
}

export default usePedidosDatabase;
