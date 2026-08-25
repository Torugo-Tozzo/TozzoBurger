import React, { useState } from 'react';
import { StyleSheet, FlatList, Alert, ActivityIndicator } from 'react-native';
import { Text, View } from '@/components/Themed';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useSaleDatabase } from '@/database/useSaleDatabase';
import { Sale } from '@/database/types/Sale';
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
import { getVendaDetalhes } from '@/services/salesDetails';
import type { VendaRenderizavel } from '@/services/sales';
import { spacing, type } from '@/constants/theme';
import { useTranslation } from 'react-i18next';

type VendaDetalheItem = { name: string; quantity: number; price: number; subtotal: number };

function toSale(venda: VendaRenderizavel): Sale {
  return {
    id: venda.id,
    total: venda.total,
    soldAt: venda.soldAt,
    customerName: venda.customerName,
    isCancelled: venda.isCancelled,
    updated_at: Date.now(),
    createdBy: venda.createdBy,
    createdByName: venda.createdByName,
  };
}

export default function ContaHistoricoModal() {
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const { saleId, origem } = useLocalSearchParams<{ saleId?: string; origem?: string }>();
  const { getSaleById } = useSaleDatabase();
  const { showAdd: getProductById } = useProductDatabase();
  const { getPrinter } = usePrinterDatabase();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const formatCurrency = (value: number) => new Intl.NumberFormat(i18n.language, { style: 'currency', currency: 'BRL' }).format(value);

  const [venda, setVenda] = useState<Sale | null>(null);
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
          if (!saleId) {
            Alert.alert(t('common.error'), t('sales.idMissing'));
            router.back();
            return;
          }

          if (origem === 'establishment') {
          const remoteVenda = getVendaDetalhes(String(saleId));
            if (!remoteVenda) {
              Alert.alert(t('common.error'), t('sales.notAvailable'));
              router.back();
              return;
            }
            setVenda(toSale(remoteVenda));
            setProdutos(remoteVenda.items.map((item) => ({
              name: item.name,
              quantity: item.quantity,
              price: item.price,
              subtotal: item.subtotal,
            })));
          } else {
            const saleData = await getSaleById(String(saleId));
            if (!saleData) {
              Alert.alert(t('common.error'), t('sales.notFound'));
              router.back();
              return;
            }

            setVenda(saleData);

            const produtosComNomes = await Promise.all(
              saleData.items.map(async (item) => {
                const productData = await getProductById(item.productId);
                return {
                  name: productData?.name || t('common.unknownProduct'),
                  quantity: item.quantity,
                  price: productData?.price || 0,
                  subtotal: item.quantity * (productData?.price || 0),
                };
              })
            );

            setProdutos(produtosComNomes);
          }
        } catch (error) {
          console.error('Erro ao carregar a venda:', error);
          Alert.alert(t('common.error'), t('sales.loadDetailsFailed'));
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
    }, [saleId, origem])
  );

  const handlePrint = async () => {
    if (!venda) return;

    setLoadingPrint(venda?.id);

    let printContent = await formatarVendaParaImpressao(venda, produtos);

    try {
      await sendMessageToDevice(printContent, await getPrinter());
    } catch (error) {
      Alert.alert(t('common.error'), t('printer.printFailed'));
      return;
    } finally {
      setLoadingPrint(null); // Desativar carregamento ao finalizar
    }
    Alert.alert(t('common.success'), t('sales.sentToPrinter'));
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
      title={item.name}
      subtitle={`${item.quantity}x · ${formatCurrency(item.price)} / ${t('charts.units')}`}
      trailing={<Text style={styles.itemTextRight}>{formatCurrency(item.subtotal)}</Text>}
    />
  );

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text>{t('common.loading')}</Text>
      </View>
    );
  }

  if (!venda) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t('sales.loadingDetails')}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('sales.detailsTitle')}</Text>
      <Text style={[styles.saleId, { color: colors.textMuted }]}>#{venda.id}</Text>
      <View style={[styles.separator, { backgroundColor: colors.border }]} />

      <Text style={styles.detailText}>
        {t('sales.date')}: {new Date(venda.soldAt).toLocaleDateString(i18n.language)}
      </Text>
      <Text style={styles.detailText}>
        {t('sales.time')}: {new Date(venda.soldAt).toLocaleTimeString(i18n.language)}
      </Text>
      <Text style={styles.detailText}>{t('sales.customer')}: {venda.customerName?.trim() || t('sales.customerNotProvided')}</Text>
      {venda.createdByName ? <Text style={styles.detailText}>{t('sales.seller')}: {venda.createdByName}</Text> : null}
      <View style={[styles.separator, { backgroundColor: colors.border }]} />
      <Text style={styles.subtitle}>{t('sales.products')}</Text>

      <ListFrame style={styles.itemsFrame}>
        <FlatList
          data={produtos}
          renderItem={renderItem}
          keyExtractor={(item, index) => String(item.name + index)}
        />
      </ListFrame>
      <Text style={styles.title}>{t('sales.totalLabel', { amount: formatCurrency(venda.total) })}</Text>
      <View style={[styles.separator, { backgroundColor: colors.border }]} />

      <View style={styles.buttonContainer}>
        <IconButton icon="share-alt" label={t('sales.shareSale')} onPress={handleShare} />
        <Button
          title={t('sales.printAccount')}
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
