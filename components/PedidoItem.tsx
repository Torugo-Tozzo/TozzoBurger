import { Pressable, PressableProps, TouchableOpacity, StyleSheet, useColorScheme, View as RNView } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { View, Text } from "@/components/Themed";
import Colors from '@/constants/Colors';
import { PedidoDatabase } from '@/database/types/Pedido';
import { useEffect, useState } from 'react';
import { usePedidosDatabase } from '@/database/usePedidoDatabase';

type Props = PressableProps & {
  data: PedidoDatabase;
  index?: number;
  onEdit: () => void;
  onDelete: () => void;
};

export function PedidoItem({ data, index, onEdit, onDelete, ...rest }: Props) {
  const colorScheme = useColorScheme();
  const isDarkMode = colorScheme === 'dark';

  const containerStyle = {
    backgroundColor: isDarkMode ? 'grey' : 'whitesmoke',
    shadowColor: isDarkMode ? '#000' : '#666',
    borderColor: isDarkMode ? '#fff' : '#ccc',
    borderWidth: 1,
  };

  const statusColors: Record<string, string> = {
    ABERTO: '#3b82f6', // azul
    EM_PREPARO: '#f59e0b', // laranja
    ENTREGANDO: '#ef4444', // vermelho
    FECHADO: '#10b981', // verde
  };

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
    <Pressable style={[styles.container, containerStyle]} {...rest}>
      <View style={[styles.stack]}>
        {/* Header: client name */}
        <View style={[styles.header, { backgroundColor: containerStyle.backgroundColor }]}>
          <Text style={styles.cliente}>{(data.cliente && String(data.cliente).trim().length > 0) ? data.cliente : 'Cliente não Informado'}</Text>
        </View>

        <View style={[styles.body, { backgroundColor: containerStyle.backgroundColor }]}>
          <TouchableOpacity onPress={onEdit} style={styles.counter}>
            <FontAwesome name="search" size={16} color="#fff" />
          </TouchableOpacity>

          <View style={[styles.bodyCenter, { backgroundColor: containerStyle.backgroundColor }]}>
            <Text style={styles.produtos}>Hora: {new Date(data.horario).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</Text>
            <Text style={styles.produtos}>Total: R$ {data.total?.toFixed?.(2) ?? data.total}</Text>
          </View>

          <View style={[styles.statusBadge, { backgroundColor: statusColors[statusLabel] ?? '#888' }]}>
            <Text style={styles.statusText}>{statusLabel}</Text>
          </View>
        </View>

        {/* Footer: first 3 produtos */}
        <View style={[styles.footer, { backgroundColor: containerStyle.backgroundColor }]}>
          {produtos && produtos.length > 0 ? (
            <Text style={styles.prodListText}>
              {produtos.slice(0,3).map(p => `( ${p.quantidade}x ) ${p.nome}`).join(', ')}{produtos.length > 3 ? ' ...' : ''}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 4,
    borderRadius: 8,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    marginBottom: 8,
  },
  left: {
    // left is no longer a horizontal row; kept for potential other uses
    flex: 1,
  },
  counter: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2196F3',
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    maxWidth: 220,
  },
  cliente: { fontWeight: '700', fontSize: 18 },
  produtos: { fontSize: 16 },
  stack: { flex: 1, width: '100%'},
  header: { flex: 1, justifyContent: 'center' },
  body: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bodyCenter: { flex: 1, alignItems: 'center' },
  footer: { flex: 1, justifyContent: 'center' },
  prodList: { marginTop: 6 },
  prodListText: { fontSize: 16 },
  statusBadge: {
    minWidth: 110,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderColor: '#fff',
    borderWidth: 1,
  },
  statusText: { color: '#fff', fontWeight: '700', fontSize: 12, textAlign: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', marginLeft: 8 },
});

export default PedidoItem;
