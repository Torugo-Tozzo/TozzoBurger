import React from 'react';
import { RecordCard, RecordCardAction } from '@/components/ui/RecordCard';
import { getStatusColor } from '@/constants/status';
import type { VendaRenderizavel } from '@/services/vendas';

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
  const excluida = data.excluida === true;
  const horaFormatada = new Date(data.horario).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const autorTrecho = data.criado_por_nome ? `Criado por ${data.criado_por_nome} · ` : '';

  const actions: RecordCardAction[] = readOnly ? [] : [
    ...(onView ? [{ icon: 'eye' as const, label: 'Ver detalhes', onPress: onView, disabled: excluida }] : []),
    ...(onPrint ? [{ icon: 'print' as const, label: 'Imprimir', onPress: onPrint, disabled: excluida, loading: printing }] : []),
    ...(onDelete ? [{ icon: 'trash' as const, label: 'Excluir venda', onPress: onDelete, disabled: excluida, destructive: true }] : []),
  ];

  return (
    <RecordCard
      accentColor={getStatusColor('FECHADO')}
      title={(data.cliente && String(data.cliente).trim().length > 0) ? data.cliente : 'Cliente não Informado'}
      subtitle={data.produtos.length > 0 ? data.produtos.join(', ') : undefined}
      meta={`Venda #${index + 1} · ${autorTrecho}${horaFormatada}`}
      total={data.total ?? 0}
      strikethrough={excluida}
      actions={actions}
      onPress={onPress}
    />
  );
}

export default VendaItem;
