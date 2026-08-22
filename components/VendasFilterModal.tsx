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
import type { VendasFilters } from '@/services/vendas';

type Props = {
  visible: boolean;
  filters: VendasFilters;
  onChange: (filters: VendasFilters) => void;
  onApply: () => void;
  onClear: () => void;
  onClose: () => void;
};

type CalendarField = 'dataInicial' | 'dataFinal' | null;

function formatDate(date: string | null | undefined) {
  if (!date) return 'Selecionar data';
  const parsed = new Date(`${date}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? 'Selecionar data' : parsed.toLocaleDateString('pt-BR');
}

function calendarDate(date: string | null | undefined) { return date || undefined; }

function dateFromCalendar(day: { year: number; month: number; day: number }) {
  return `${day.year}-${String(day.month).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`;
}

export function VendasFilterModal({ visible, filters, onChange, onApply, onClear, onClose }: Props) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
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
            <Text style={styles.title}>Filtros</Text>
            <Pressable onPress={onClose} accessibilityLabel="Fechar filtros" hitSlop={10}>
              <FontAwesome name="times" size={18} color={colors.text} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionLabel}>Período</Text>
            <View style={styles.row}>
              <View style={styles.half}>
                <Text style={styles.label}>Data inicial</Text>
                <TouchableOpacity
                  style={[styles.dateButton, { borderColor: colors.border, backgroundColor: colors.surface }]}
                  onPress={() => setCalendarField('dataInicial')}
                >
                  <Text>{formatDate(filters.dataInicial)}</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.half}>
                <Text style={styles.label}>Data final</Text>
                <TouchableOpacity
                  style={[styles.dateButton, { borderColor: colors.border, backgroundColor: colors.surface }]}
                  onPress={() => setCalendarField('dataFinal')}
                >
                  <Text>{formatDate(filters.dataFinal)}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.half}>
                <Text style={styles.label}>Hora inicial</Text>
                <TextInput
                  value={filters.horaInicial ?? ''}
                  onChangeText={(value) => update('horaInicial', value)}
                  placeholder="00:00"
                  keyboardType="numbers-and-punctuation"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                />
              </View>
              <View style={styles.half}>
                <Text style={styles.label}>Hora final</Text>
                <TextInput
                  value={filters.horaFinal ?? ''}
                  onChangeText={(value) => update('horaFinal', value)}
                  placeholder="23:59"
                  keyboardType="numbers-and-punctuation"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                />
              </View>
            </View>

            <Text style={styles.sectionLabel}>Venda</Text>
            <Text style={styles.label}>Nome do cliente</Text>
            <TextInput
              value={filters.cliente ?? ''}
              onChangeText={(value) => update('cliente', value)}
              placeholder="Todos os clientes"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
            />

            <View style={styles.row}>
              <View style={styles.half}>
                <Text style={styles.label}>Total mínimo</Text>
                <TextInput
                  value={filters.totalMin == null ? '' : String(filters.totalMin)}
                  onChangeText={(value) => update('totalMin', value)}
                  placeholder="R$ 0,00"
                  keyboardType="decimal-pad"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                />
              </View>
              <View style={styles.half}>
                <Text style={styles.label}>Total máximo</Text>
                <TextInput
                  value={filters.totalMax == null ? '' : String(filters.totalMax)}
                  onChangeText={(value) => update('totalMax', value)}
                  placeholder="Sem limite"
                  keyboardType="decimal-pad"
                  placeholderTextColor={colors.textMuted}
                  style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
                />
              </View>
            </View>

            <View style={styles.actions}>
              <Button title="Limpar" variant="outline" onPress={onClear} style={styles.actionButton} />
              <Button title="Aplicar filtros" onPress={onApply} style={styles.actionButton} />
            </View>
          </ScrollView>

          {calendarField ? (
            <View style={[styles.calendarOverlay, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <Text style={styles.calendarTitle}>
                {calendarField === 'dataInicial' ? 'Data inicial' : 'Data final'}
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
              <Button title="Voltar aos filtros" variant="outline" onPress={() => setCalendarField(null)} />
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
