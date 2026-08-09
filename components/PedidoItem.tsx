import React, { useEffect, useState } from 'react';
import { RecordCard, RecordCardAction } from '@/components/ui/RecordCard';
import { getStatusColor, getStatusLabel } from '@/constants/status';
import { PedidoDatabase } from '@/database/types/Pedido';
import { usePedidosDatabase } from '@/database/usePedidoDatabase';

type Props = {
  data: PedidoDatabase;
  index?: number;
  onEdit: () => void;
  onDelete?: () => void;
};

export function PedidoItem({ data, onEdit, onDelete }: Props) {
  const statusLabel = data.status ?? 'DESCONHECIDO';
  const { getProdutosByPedidoId } = usePedidosDatabase();
  const [produtos, setProdutos] = useState<{ nome: string; quantidade: number }[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const p = await getProdutosByPedidoId(data.id);
        if (mounted) setProdutos(Array.isArray(p) ? p : []);
      } catch (err) {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, [data.id, data.updated_at]);

  const horaFormatada = new Date(data.horario).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const autorTrecho = data.criado_por_nome ? `Criado por ${data.criado_por_nome} · ` : '';

  const actions: RecordCardAction[] = [
    { icon: 'pencil', label: 'Editar pedido', onPress: onEdit },
  ];
  if (onDelete) {
    actions.push({ icon: 'trash', label: 'Excluir pedido', onPress: onDelete, destructive: true });
  }

  return (
    <RecordCard
      accentColor={getStatusColor(statusLabel)}
      badge={{ label: getStatusLabel(statusLabel), color: getStatusColor(statusLabel) }}
      title={(data.cliente && String(data.cliente).trim().length > 0) ? data.cliente : 'Cliente não Informado'}
      subtitle={
        produtos.length > 0
          ? `${produtos.slice(0, 3).map((p) => `(${p.quantidade}x) ${p.nome}`).join(', ')}${produtos.length > 3 ? ' ...' : ''}`
          : undefined
      }
      meta={`${autorTrecho}${horaFormatada}`}
      total={data.total ?? 0}
      actions={actions}
    />
  );
}

export default PedidoItem;
