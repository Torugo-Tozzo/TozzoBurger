import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  useColorScheme,
} from 'react-native';
import { Calendar } from 'react-native-calendars';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Text, View } from '@/components/Themed';
import { Button } from '@/components/ui/Button';
import Colors from '@/constants/Colors';
import { spacing, type } from '@/constants/theme';
import type { VendasFilters } from '@/services/sales';
import { useTranslation } from 'react-i18next';

type Props = {
  visible: boolean;
  filters: VendasFilters;
  onChange: (filters: VendasFilters) => void;
  onApply: () => void;
  onClear: () => void;
  onClose: () => void;
};

type CalendarField = 'dataInicial' | 'dataFinal' | null;

function formatDate(date: string | null | undefined, locale: string, fallback: string) {
  if (!date) return fallback;
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toLocaleDateString(locale);
}

function calendarDate(date: string | null | undefined) { return date || undefined; }

function dateFromCalendar(day: { year: number; month: number; day: number }) {
  return `${day.year}-${String(day.month).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`;
}

export function VendasFilterModal({ visible, filters, onChange, onApply, onClear, onClose }: Props) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const { t, i18n } = useTranslation();
  const zeroCurrency = new Intl.NumberFormat(i18n.language, { style: 'currency', currency: 'BRL' }).format(0);
  const [calendarField, setCalendarField] = useState<CalendarField>(null);

  const update = (field: keyof VendasFilters, value: string | null) => {
    onChange({ ...filters, [field]: value });
  };

  const handleDayPress = (day: { year: number; month: number; day: number }) => {
    if (!calendarField) return;
    update(calendarField, dateFromCalendar(day));
    setCalendarField(null);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.background, borderColor: colors.border }]}
          onPress={(event) => event.stopPropagation()}
        >
          <View style={styles.header}>
            <Text style={styles.title}>{t('sales.filters')}</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('sales.closeFilters')} hitSlop={10}>
              <FontAwesome name="times" size={18} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionLabel}>{t('sales.period')}</Text>
            <View style={styles.row}>
              <View style={styles.half}>
                <Text style={styles.label}>{t('sales.initialDate')}</Text>
                <TouchableOpacity
                  style={[styles.dateButton, { borderColor: colors.border, backgroundColor: colors.surface }]}
                  onPress={() => setCalendarField('dataInicial')}
                  accessibilityRole="button"
                  accessibilityLabel={t('sales.initialDate')}
                >
                  <Text>{formatDate(filters.dataInicial, i18n.language, t('sales.initialDate'))}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.half}>
                <Text style={styles.label}>{t('sales.finalDate')}</Text>
                <TouchableOpacity
                  style={[styles.dateButton, { borderColor: colors.border, backgroundColor: colors.surface }]}
                  onPress={() => setCalendarField('dataFinal')}
                  accessibilityRole="button"
                  accessibilityLabel={t('sales.finalDate')}
                >
                  <Text>{formatDate(filters.dataFinal, i18n.language, t('sales.finalDate'))}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.half}>
                <Text style={styles.label}>{t('sales.initialTime')}</Text>
                <TextInput
                  value={filters.horaInicial ?? ''}
                  onChangeText={(value) => update('horaInicial', value)}
                  placeholder="00:00"
                  accessibilityLabel={t('sales.initialTime')}
                  keyboardType="numbers-and-punctuation"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                />
              </View>
              <View style={styles.half}>
                <Text style={styles.label}>{t('sales.finalTime')}</Text>
                <TextInput
                  value={filters.horaFinal ?? ''}
                  onChangeText={(value) => update('horaFinal', value)}
                  placeholder="23:59"
                  accessibilityLabel={t('sales.finalTime')}
                  keyboardType="numbers-and-punctuation"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                />
              </View>
            </View>

            <Text style={styles.sectionLabel}>{t('sales.sale')}</Text>
            <Text style={styles.label}>{t('sales.customerName')}</Text>
            <TextInput
              value={filters.customerName ?? ''}
              onChangeText={(value) => update('customerName', value)}
              placeholder={t('sales.allCustomers')}
              accessibilityLabel={t('sales.customerName')}
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            />

            <View style={styles.row}>
              <View style={styles.half}>
                <Text style={styles.label}>{t('sales.minimumTotal')}</Text>
                <TextInput
                  value={filters.totalMin == null ? '' : String(filters.totalMin)}
                  onChangeText={(value) => update('totalMin', value)}
                  placeholder={zeroCurrency}
                  accessibilityLabel={t('sales.minimumTotal')}
                  keyboardType="decimal-pad"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                />
              </View>
              <View style={styles.half}>
                <Text style={styles.label}>{t('sales.maximumTotal')}</Text>
                <TextInput
                  value={filters.totalMax == null ? '' : String(filters.totalMax)}
                  onChangeText={(value) => update('totalMax', value)}
                  placeholder={t('sales.noLimit')}
                  accessibilityLabel={t('sales.maximumTotal')}
                  keyboardType="decimal-pad"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                />
              </View>
            </View>

            <View style={styles.actions}>
              <Button title={t('sales.clearFilters')} variant="outline" onPress={onClear} style={styles.actionButton} />
              <Button title={t('sales.applyFilters')} onPress={onApply} style={styles.actionButton} />
            </View>
          </ScrollView>

          {calendarField ? (
            <View style={[styles.calendarOverlay, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={styles.calendarTitle}>
                {calendarField === 'dataInicial' ? t('sales.initialDate') : t('sales.finalDate')}
              </Text>
              <Calendar
                current={calendarDate(filters[calendarField])}
                onDayPress={handleDayPress}
                markedDates={{
                  [calendarDate(filters[calendarField]) ?? '']: { selected: true, selectedColor: colors.primary },
                }}
                theme={{
                  calendarBackground: colors.background,
                  textSectionTitleColor: colors.textMuted,
                  selectedDayBackgroundColor: colors.primary,
                  selectedDayTextColor: colors.background,
                  todayTextColor: colors.primary,
                  dayTextColor: colors.text,
                  textDisabledColor: colors.textMuted,
                  arrowColor: colors.primary,
                  monthTextColor: colors.text,
                }}
              />
              <Button title={t('sales.backToFilters')} variant="outline" onPress={() => setCalendarField(null)} />
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.45)' },
  sheet: { maxHeight: '92%', borderTopWidth: 1, padding: spacing.xl },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  title: { fontSize: type.subtitle, fontWeight: '700' },
  content: { paddingBottom: spacing.xl },
  sectionLabel: { fontSize: type.body, fontWeight: '700', marginTop: spacing.sm, marginBottom: spacing.md },
  label: { fontSize: type.caption, fontWeight: '700', marginBottom: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
  dateButton: { minHeight: 48, borderWidth: 1, padding: spacing.md, justifyContent: 'center', marginBottom: spacing.md },
  input: { minHeight: 48, borderWidth: 1, paddingHorizontal: spacing.md, marginBottom: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  actionButton: { flex: 1 },
  calendarOverlay: { position: 'absolute', left: spacing.xl, right: spacing.xl, top: spacing.xl, bottom: spacing.xl, borderWidth: 1, padding: spacing.md },
  calendarTitle: { fontSize: type.body, fontWeight: '700', textAlign: 'center', marginBottom: spacing.md },
});

export default VendasFilterModal;
