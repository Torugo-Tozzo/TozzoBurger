import React from 'react';
import { RecordCard, RecordCardAction } from '@/components/ui/RecordCard';
import Colors from '@/constants/Colors';
import type { VendaRenderizavel } from '@/services/sales';
import { useTranslation } from 'react-i18next';

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
  const { t, i18n } = useTranslation();
  const isCancelled = data.isCancelled === true;
  const horaFormatada = new Date(data.soldAt).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });
  const autorTrecho = data.createdByName ? t('common.createdBy', { name: data.createdByName }) : '';

  const actions: RecordCardAction[] = readOnly ? [] : [
    ...(onView ? [{ icon: 'eye' as const, label: t('common.viewDetails'), onPress: onView, disabled: isCancelled }] : []),
    ...(onPrint ? [{ icon: 'print' as const, label: t('common.print'), onPress: onPrint, disabled: isCancelled, loading: printing }] : []),
    ...(onDelete ? [{ icon: 'trash' as const, label: t('common.deleteSale'), onPress: onDelete, disabled: isCancelled, destructive: true }] : []),
  ];

  return (
    <RecordCard
      accentColor={Colors.light.textMuted}
      title={(data.customerName && String(data.customerName).trim().length > 0) ? data.customerName : t('common.customerUnknown')}
      subtitle={data.products.length > 0 ? data.products.join(', ') : undefined}
      meta={`${t('sales.saleNumber', { number: index + 1 })} · ${autorTrecho}${horaFormatada}`}
      total={data.total ?? 0}
      strikethrough={isCancelled}
      actions={actions}
      onPress={onPress}
    />
  );
}

export default VendaItem;
