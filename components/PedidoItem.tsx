import React from 'react';
import { RecordCard, RecordCardAction } from '@/components/ui/RecordCard';
import { getStatusColor, getStatusLabel } from '@/constants/status';
import { PedidoDatabase } from '@/database/types/Pedido';

type Props = {
  data: PedidoDatabase;
  produtos: string[];
  onEdit: () => void;
  onDelete?: () => void;
};

export function PedidoItem({ data, produtos, onEdit, onDelete }: Props) {
  const statusLabel = data.status ?? 'DESCONHECIDO';

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
      subtitle={produtos.length > 0 ? produtos.join(', ') : undefined}
      meta={`${autorTrecho}${horaFormatada}`}
      total={data.total ?? 0}
      actions={actions}
    />
  );
}

export default PedidoItem;
