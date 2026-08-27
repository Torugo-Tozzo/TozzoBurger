import React from 'react';
import { RecordCard, RecordCardAction } from '@/components/ui/RecordCard';
import { Order } from '@/database/types/Order';
import Colors from '@/constants/Colors';
import { useTranslation } from 'react-i18next';

type Props = {
  data: Order;
  products: string[];
  onEdit: () => void;
  onDelete?: () => void;
};

export function PedidoItem({ data, products, onEdit, onDelete }: Props) {
  const { t, i18n } = useTranslation();
  const isOpen = data.isOpen !== false;
  const statusLabel = isOpen ? t('status.open') : t('status.closed');
  const statusColor = isOpen ? Colors.status.info : Colors.status.danger;

  const horaFormatada = new Date(data.openedAt).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });
  const autorTrecho = data.createdByName ? t('common.createdBy', { name: data.createdByName }) : '';

  const actions: RecordCardAction[] = [
    { icon: 'pencil', label: t('common.editOrder'), onPress: onEdit },
  ];
  if (onDelete) {
    actions.push({ icon: 'trash', label: t('common.deleteOrder'), onPress: onDelete, destructive: true });
  }

  return (
    <RecordCard
      accentColor={statusColor}
      badge={{ label: statusLabel, color: statusColor }}
      title={(data.customerName && String(data.customerName).trim().length > 0) ? data.customerName : t('common.customerUnknown')}
      subtitle={products.length > 0 ? products.join(', ') : undefined}
      meta={`${autorTrecho}${horaFormatada}`}
      total={data.total ?? 0}
      actions={actions}
    />
  );
}

export default PedidoItem;
