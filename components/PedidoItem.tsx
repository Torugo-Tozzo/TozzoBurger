import React from 'react';
import { RecordCard, RecordCardAction } from '@/components/ui/RecordCard';
import { getStatusColor, getStatusLabel } from '@/constants/status';
import { Order } from '@/database/types/Order';

type Props = {
  data: Order;
  products: string[];
  onEdit: () => void;
  onDelete?: () => void;
};

export function PedidoItem({ data, products, onEdit, onDelete }: Props) {
  const statusLabel = data.status ?? 'DESCONHECIDO';

  const horaFormatada = new Date(data.openedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const autorTrecho = data.createdByName ? `Criado por ${data.createdByName} · ` : '';

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
      title={(data.customerName && String(data.customerName).trim().length > 0) ? data.customerName : 'Cliente não Informado'}
      subtitle={products.length > 0 ? products.join(', ') : undefined}
      meta={`${autorTrecho}${horaFormatada}`}
      total={data.total ?? 0}
      actions={actions}
    />
  );
}

export default PedidoItem;
