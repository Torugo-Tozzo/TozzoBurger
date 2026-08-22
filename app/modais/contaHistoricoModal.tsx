import React, { useState } from 'react';
import { StyleSheet, FlatList, Alert, ActivityIndicator } from 'react-native';
import { Text, View } from '@/components/Themed';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useVendasDatabase } from '@/database/useVendaDatabse';
import { VendaDatabase } from '@/database/types/Venda';
import { useProductDatabase } from '@/database/useProductDatabase';
import { sendMessageToDevice } from '@/useBLE';
import { usePrinterDatabase } from '@/database/usePrinterDatabase';
import { formatarVendaParaImpressao } from '@/hooks/formatarVendaImpressao';
import { captureScreen } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { ListItem } from '@/components/ui/ListItem';
import { ListFrame } from '@/components/ui/ListFrame';
import { getVendaDetalhes } from '@/services/vendasDetalhes';
import type { VendaRenderizavel } from '@/services/vendas';
import { spacing, type } from '@/constants/theme';

type VendaDetalheItem = { nome: string; quantidade: number; preco: number; subtotal: number };

function toVendaDatabase(venda: VendaRenderizavel): VendaDatabase {
  return {
    id: venda.id,
    total: venda.total,
    horario: venda.horario,
    cliente: venda.cliente,
    excluida: venda.excluida,
    updated_at: Date.now(),
    criado_por: venda.criado_por,
    criado_por_nome: venda.criado_por_nome,
  };
}

export default function ContaHistoricoModal() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const { vendaId, origem } = useLocalSearchParams<{ vendaId?: string; origem?: string }>();
  const { getVendaById } = useVendasDatabase();
  const { showAdd: getProductById } = useProductDatabase();
  const { getPrinter } = usePrinterDatabase();
  const router = useRouter();

  const [venda, setVenda] = useState<VendaDatabase | null>(null);
  const [produtos, setProdutos] = useState<VendaDetalheItem[]>([]);
  const [isPrinterConnected, setIsPrinterConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingPrint, setLoadingPrint] = useState<string | null>(null);

  useFocusEffect(
    React.useCallback(() => {
      async function fetchPrinter() {
        try {
          setIsPrinterConnected(false); // Reseta o estado antes da verificação
          const printer = await getPrinter(); // Verifica se há uma impressora registrada
          setIsPrinterConnected(printer.uuid !== null); // Atualiza o estado com o resultado
        } catch (error) {
          console.error('Erro ao verificar impressora:', error);
        }
      }

      async function fetchVenda() {
        try {
          if (!vendaId) {
            Alert.alert('Erro', 'ID da venda não fornecido.');
            router.back();
            return;
          }

          if (origem === 'establishment') {
          const remoteVenda = getVendaDetalhes(String(vendaId));
            if (!remoteVenda) {
              Alert.alert('Erro', 'Detalhes da venda não estão mais disponíveis.');
              router.back();
              return;
            }
            setVenda(toVendaDatabase(remoteVenda));
            setProdutos(remoteVenda.itens.map((item) => ({
              nome: item.nome,
              quantidade: item.quantidade,
              preco: item.preco,
              subtotal: item.subtotal,
            })));
          } else {
            const vendaData = await getVendaById(String(vendaId));
            if (!vendaData) {
              Alert.alert('Erro', 'Venda não encontrada.');
              router.back();
              return;
            }

            setVenda(vendaData);

            const produtosComNomes = await Promise.all(
              vendaData.produtos.map(async (produto) => {
                const produtoData = await getProductById(produto.produtoId);
                return {
                  nome: produtoData?.nome || 'Produto não encontrado',
                  quantidade: produto.quantidade,
                  preco: produtoData?.preco || 0,
                  subtotal: produto.quantidade * (produtoData?.preco || 0),
                };
              })
            );

            setProdutos(produtosComNomes);
          }
        } catch (error) {
          console.error('Erro ao carregar a venda:', error);
          Alert.alert('Erro', 'Não foi possível carregar os detalhes da venda.');
          router.back();
        } finally {
          setIsLoading(false);
        }
      }

      setVenda(null);
      setProdutos([]);
      setIsLoading(true);
      fetchPrinter();
      fetchVenda();
    }, [vendaId, origem])
  );

  const handlePrint = async () => {
    if (!venda) return;

    setLoadingPrint(venda?.id);

    let printContent = await formatarVendaParaImpressao(venda, produtos);

    try {
      await sendMessageToDevice(printContent, await getPrinter());
    } catch (error) {
      Alert.alert('Erro', `${error}`);
      return;
    } finally {
      setLoadingPrint(null); // Desativar carregamento ao finalizar
    }
    Alert.alert('Sucesso', 'Conta enviada para impressão.');
  };

  const handleShare = async () => {
    try {
      const uri = await captureScreen({
        format: 'png',
        quality: 0.8,
      });

      await Sharing.shareAsync(uri);
    } catch (error) {
      console.error("Erro ao capturar e compartilhar:", error);
    } 
  };

  const renderItem = ({ item }: { item: VendaDetalheItem }) => (
    <ListItem
      title={item.nome}
      subtitle={`${item.quantidade}x · R$ ${item.preco.toFixed(2)} un.`}
      trailing={<Text style={styles.itemTextRight}>R$ {item.subtotal.toFixed(2)}</Text>}
    />
  );

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text>Carregando...</Text>
      </View>
    );
  }

  if (!venda) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Carregando detalhes da venda...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Detalhes da venda</Text>
      <Text style={[styles.saleId, { color: colors.textMuted }]}>#{venda.id}</Text>
      <View style={[styles.separator, { backgroundColor: colors.border }]} />

      <Text style={styles.detailText}>
        Data: {new Date(venda.horario).toLocaleDateString('pt-BR')}
      </Text>
      <Text style={styles.detailText}>
        Horário: {new Date(venda.horario).toLocaleTimeString('pt-BR')}
      </Text>
      <Text style={styles.detailText}>Cliente: {venda.cliente?.trim() || 'Não informado'}</Text>
      {venda.criado_por_nome ? <Text style={styles.detailText}>Vendedor: {venda.criado_por_nome}</Text> : null}
      <View style={[styles.separator, { backgroundColor: colors.border }]} />
      <Text style={styles.subtitle}>Produtos</Text>

      <ListFrame style={styles.itemsFrame}>
        <FlatList
          data={produtos}
          renderItem={renderItem}
          keyExtractor={(item, index) => String(item.nome + index)}
        />
      </ListFrame>
      <Text style={styles.title}>Total: R$ {venda.total.toFixed(2)}</Text>
      <View style={[styles.separator, { backgroundColor: colors.border }]} />

      <View style={styles.buttonContainer}>
        <IconButton icon="share-alt" label="Compartilhar venda" onPress={handleShare} />
        <Button
          title="Imprimir conta"
          onPress={handlePrint}
          loading={Boolean(loadingPrint)}
          disabled={!isPrinterConnected}
          style={styles.printButton}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.xl,
    borderWidth: 1,
  },
  title: {
    fontSize: type.heading,
    fontWeight: '700',
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  saleId: { textAlign: 'center', fontSize: type.caption },
  subtitle: {
    fontSize: type.subtitle,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  separator: {
    marginVertical: spacing.md,
    height: 1,
  },
  detailText: {
    fontSize: type.body,
    marginBottom: spacing.xs,
  },
  itemsFrame: { marginBottom: spacing.lg },
  itemTextRight: { fontSize: type.body, fontWeight: '700', textAlign: 'right' },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  printButton: { flex: 1 },
});
