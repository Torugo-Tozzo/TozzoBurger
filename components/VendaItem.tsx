import React from 'react';
import { RecordCard, RecordCardAction } from '@/components/ui/RecordCard';
import { getStatusColor } from '@/constants/status';
import type { VendaRenderizavel } from '@/services/sales';

type Props = {
  data: VendaRenderizavel;
  index: number;
  onPress?: () => void;
  onView?: () => void;
  onPrint?: () => void;
  onDelete?: () => void;
  printing?: boolean;
  readOnly?: boolean;
};

export function VendaItem({ data, index, onPress, onView, onPrint, onDelete, printing, readOnly = false }: Props) {
  const isCancelled = data.isCancelled === true;
  const horaFormatada = new Date(data.soldAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const autorTrecho = data.createdByName ? `Criado por ${data.createdByName} · ` : '';

  const actions: RecordCardAction[] = readOnly ? [] : [
    ...(onView ? [{ icon: 'eye' as const, label: 'Ver detalhes', onPress: onView, disabled: isCancelled }] : []),
    ...(onPrint ? [{ icon: 'print' as const, label: 'Imprimir', onPress: onPrint, disabled: isCancelled, loading: printing }] : []),
    ...(onDelete ? [{ icon: 'trash' as const, label: 'Excluir venda', onPress: onDelete, disabled: isCancelled, destructive: true }] : []),
  ];

  return (
    <RecordCard
      accentColor={getStatusColor('FECHADO')}
      title={(data.customerName && String(data.customerName).trim().length > 0) ? data.customerName : 'Cliente não Informado'}
      subtitle={data.products.length > 0 ? data.products.join(', ') : undefined}
      meta={`Venda #${index + 1} · ${autorTrecho}${horaFormatada}`}
      total={data.total ?? 0}
      strikethrough={isCancelled}
      actions={actions}
      onPress={onPress}
    />
  );
}

export default VendaItem;
