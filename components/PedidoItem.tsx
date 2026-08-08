import { Pressable, PressableProps, TouchableOpacity, StyleSheet, useColorScheme, View } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Text } from "@/components/Themed";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import Colors from '@/constants/Colors';
import { getStatusColor } from '@/constants/status';
import { spacing, type } from '@/constants/theme';
import { PedidoDatabase } from '@/database/types/Pedido';
import { useEffect, useState } from 'react';
import { usePedidosDatabase } from '@/database/usePedidoDatabase';

type Props = PressableProps & {
  data: PedidoDatabase;
  index?: number;
  onEdit: () => void;
  onDelete?: () => void;
};

export function PedidoItem({ data, index, onEdit, onDelete, ...rest }: Props) {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

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

  return (
    <Pressable {...rest}>
      <Card padding={0} style={styles.container}>
        <TouchableOpacity onPress={onEdit} style={styles.header}>
          <Text style={styles.cliente}>
            {(data.cliente && String(data.cliente).trim().length > 0) ? data.cliente : 'Cliente não Informado'}
          </Text>
          <FontAwesome name="search" size={16} color={colors.textMuted} />
        </TouchableOpacity>

        <View style={styles.body}>
          <Text style={styles.produtos}>
            Hora: {new Date(data.horario).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </Text>
          <Text style={styles.produtos}>Total: R$ {data.total?.toFixed?.(2) ?? data.total}</Text>
          <Badge label={statusLabel} color={getStatusColor(statusLabel)} />
        </View>

        {produtos && produtos.length > 0 ? (
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <Text style={styles.prodListText}>
              {produtos.slice(0, 3).map(p => `( ${p.quantidade}x ) ${p.nome}`).join(', ')}
              {produtos.length > 3 ? ' ...' : ''}
            </Text>
          </View>
        ) : null}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.md, overflow: 'hidden' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md },
  cliente: { fontWeight: '700', fontSize: type.subtitle },
  body: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  produtos: { fontSize: type.body },
  footer: { padding: spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
  prodListText: { fontSize: type.body },
});

export default PedidoItem;
