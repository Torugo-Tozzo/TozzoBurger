import React, { useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Dimensions, useColorScheme, Share, Alert } from 'react-native';
import { View, Text } from '@/components/Themed';
import { useLocalSearchParams, router } from 'expo-router';
import { useProductDatabase } from '@/database/useProductDatabase';
import { useSaleDatabase } from '@/database/useSaleDatabase';
import { Picker } from "@react-native-picker/picker";
import { PieChart, ProgressChart } from 'react-native-chart-kit';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { useTranslation } from 'react-i18next';
import { getProductTypeLabel } from '@/components/productTypeLabel';
import { buildReportChartData, type RelatorioProduto } from '@/app/modais/reportChartData';

type TipoGrafico = 'pizza' | 'progresso';

export default function RelatorioModal() {
  const params = useLocalSearchParams();
  const { getProductTypes } = useProductDatabase();
  const { getSalesReportByPeriod } = useSaleDatabase();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const { t, i18n } = useTranslation();

  const [dataInicial] = useState(() =>
    params.dataInicial ? new Date(params.dataInicial as string) : new Date()
  );
  
  const [dataFinal] = useState(() =>
    params.dataFinal ? new Date(params.dataFinal as string) : new Date()
  );
  
  const [productTypeId, setTipoProdutoId] = useState<number | null>(
    params.productTypeId && params.productTypeId !== ''
      ? Number(params.productTypeId)
      : 100
  );
  
  const [tipoGrafico, setTipoGrafico] = useState<TipoGrafico>('pizza');
  const [tiposProdutos, setTiposProdutos] = useState<{ id: number; description: string }[]>([]);
  
  const dataInicialFormatada = dataInicial.toLocaleDateString(i18n.language);
  const dataFinalFormatada = dataFinal.toLocaleDateString(i18n.language);
  const formatCurrency = (value: number) => new Intl.NumberFormat(i18n.language, { style: 'currency', currency: 'BRL' }).format(value);
  
  const [tipoDescricao, setTipoDescricao] = useState<string>(t('charts.allTypes'));
  const [relatorioData, setRelatorioData] = useState<RelatorioProduto[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    async function fetchTiposProdutos() {
      try {
        const types = await getProductTypes();
        setTiposProdutos(types);
      } catch (error) {
        console.error('Erro ao carregar tipos de produtos:', error);
      }
    }
    
    fetchTiposProdutos();
  }, []);
  
  useEffect(() => {
    async function fetchTipoDescricao() {
      if (productTypeId && productTypeId !== 100) {
        try {
          const types = await getProductTypes();
          const productType = types.find(t => t.id === productTypeId);
          if (productType) {
            setTipoDescricao(getProductTypeLabel(productType.id, productType.description, t));
          }
        } catch (error) {
          console.error('Erro ao carregar tipo de produto:', error);
        }
      } else {
        setTipoDescricao(t('charts.allTypes'));
      }
    }
    
    fetchTipoDescricao();
  }, [productTypeId, i18n.language]);
  
  useEffect(() => {
    async function carregarDadosRelatorio() {
      setLoading(true);
      try {
        let tipoIdParam = '';
        
        if (productTypeId) {
          if (productTypeId === 100) {
            tipoIdParam = '';
          } else {
            tipoIdParam = productTypeId.toString();
          }
        }
        
        const report = await getSalesReportByPeriod(
          dataInicial.toISOString(),
          dataFinal.toISOString(),
          tipoIdParam
        );
        setRelatorioData(report);
      } catch (error) {
        console.error('Failed to load sales report:', error);
        Alert.alert(t('common.error'), t('errors.loadFailed'));
      } finally {
        setLoading(false);
      }
    }
    
    carregarDadosRelatorio();
  }, [dataInicial, dataFinal, productTypeId]);

  const ListHeader = () => (
    <View style={[styles.listHeaderContainer, { backgroundColor: colors.text, borderBottomColor: colors.border }]}>
      <Text style={[styles.listHeaderText, { color: colors.background }]}>{t('charts.product')}</Text>
      <Text style={[styles.listHeaderText, { color: colors.background }]}>{t('charts.numberSales')}</Text>
      <Text style={[styles.listHeaderText, { color: colors.background }]}>{t('charts.total')}</Text>
    </View>
  );
  
  const chartConfig = {
    backgroundColor: '#ffffff',
    backgroundGradientFrom: '#ffffff',
    backgroundGradientTo: '#ffffff',
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
    style: {
      borderRadius: 16
    },
    propsForDots: {
      r: "6",
      strokeWidth: "2",
      stroke: "#ffa726"
    }
  };
  
  const compartilharRelatorio = async (relatorioData: RelatorioProduto[], dataInicial: Date, dataFinal: Date) => {
    try {
      const dataInicialFormatada = dataInicial.toLocaleDateString(i18n.language);
      const dataFinalFormatada = dataFinal.toLocaleDateString(i18n.language);
      
      let textoRelatorio = `${t('charts.reportTitle').toUpperCase()} - ${t('charts.period').toUpperCase()}: ${dataInicialFormatada} ${t('charts.until')} ${dataFinalFormatada}\n\n`;
      textoRelatorio += `${t('charts.mostSold').toUpperCase()}:\n`;
      
      relatorioData.forEach((item, index) => {
        textoRelatorio += `${index + 1}. ${item.name}; ${item.totalVendido} ${t('charts.units')}: ${t('charts.total')}: ${formatCurrency(item.price * item.totalVendido)}\n`;
      });
      
      const totalGeral = relatorioData.reduce((total, item) => total + item.totalVendido, 0);
      const totalPreco = relatorioData.reduce((total, item) => total + (item.price * item.totalVendido), 0);
      textoRelatorio += `\n${t('charts.grandTotal')}: ${totalGeral} ${t('charts.units')} | ${t('charts.total')}: ${formatCurrency(totalPreco)}`;

      await Share.share({
        message: textoRelatorio,
        title: t('charts.reportTitle')
      });
    } catch (error) {
      console.error('Failed to share sales report:', error);
      Alert.alert(t('common.error'), t('errors.generic'));
    }
  };

  const { dadosPizza, dadosProgresso } = buildReportChartData(relatorioData, (key) => t(key));
  const screenWidth = Dimensions.get('window').width - 40;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { backgroundColor: colors.text, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.background }]}>{t('charts.reportTitle')}</Text>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        >
          <Text style={[styles.closeButtonText, { color: colors.background }]}>X</Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.dateInfoContainer}>
        <Text style={styles.dateInfoText}>
          {t('charts.period')}: {dataInicialFormatada} {t('charts.until')} {dataFinalFormatada}
        </Text>
      </View>
      
      <ScrollView style={styles.content}>
        <View style={styles.chartControls}>
          <View style={styles.controlRow}>
            <Text style={styles.controlLabel}>{t('charts.title')}:</Text>
            <View style={styles.pickerSmallContainer}>
              <Picker
                selectedValue={tipoGrafico}
                onValueChange={(itemValue) => setTipoGrafico(itemValue)}
                style={{ color: colors.text }}
                dropdownIconColor={colors.text}
                accessibilityLabel={t('charts.title')}
              >
                <Picker.Item label={t('charts.pie')} value="pizza" />
                <Picker.Item label={t('charts.progress')} value="progresso" />
              </Picker>
            </View>
          </View>
          
          <View style={styles.controlRow}>
            <Text style={styles.controlLabel}>{t('products.productType')}:</Text>
            <View style={styles.pickerSmallContainer}>
              <Picker
                selectedValue={productTypeId}
                onValueChange={(itemValue) => setTipoProdutoId(itemValue)}
                style={{ color: colors.text }}
                dropdownIconColor={colors.text}
                accessibilityLabel={t('products.productType')}
              >
                <Picker.Item label={t('charts.allTypes')} value={100} />
                {tiposProdutos.map((tipo) => (
                  <Picker.Item key={tipo.id} label={getProductTypeLabel(tipo.id, tipo.description, t)} value={tipo.id} />
                ))}
              </Picker>
            </View>
          </View>
        </View>
        
        <View style={styles.chartContainer}>
          <Text style={styles.subtitle}>{t('charts.mostSold')} - {tipoDescricao}</Text>
          
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>{t('charts.loading')}</Text>
            </View>
          ) : relatorioData.length === 0 ? (
            <Text style={styles.emptyText}>
              {t('charts.emptyPeriod')}
            </Text>
          ) : (
            <>
              {tipoGrafico === 'pizza' ? (
                <>
                  <PieChart
                    data={dadosPizza}
                    width={screenWidth}
                    height={220}
                    chartConfig={chartConfig}
                    accessor="totalVendido"
                    backgroundColor="transparent"
                    paddingLeft='0'
                    center={[100 , 10]} 
                    absolute
                    hasLegend={false}
                  />
                  
                  <View style={styles.customLegend}>
                    {dadosPizza.map((item, index) => (
                      <View key={index} style={styles.legendItem}>
                        <View 
                          style={[
                            styles.legendColor, 
                            { backgroundColor: item.color }
                          ]} 
                        />
                        <Text style={styles.legendText}>
                          {item.name} ({item.totalVendido} {t('charts.units')})
                        </Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : (
                <>
                  <ProgressChart
                    data={dadosProgresso.data}
                    width={screenWidth}
                    height={220}
                    chartConfig={{
                      ...chartConfig,
                      color: (opacity = 1, index) => {
                        return index !== undefined && dadosProgresso.colors[index] 
                          ? `${dadosProgresso.colors[index]}${Math.floor(opacity * 255).toString(16).padStart(2, '0')}`
                          : `rgba(54, 162, 235, ${opacity})`;
                      }
                    }}
                    radius={32}
                    strokeWidth={8}
                    hideLegend={true}
                    absolute
                    style={{
                      marginVertical: 8,
                      borderRadius: 16,
                    }}
                  />
                  
                  <View style={styles.customLegend}>
                    {dadosProgresso.labels.map((label, index) => (
                      <View key={index} style={styles.legendItem}>
                        <View 
                          style={[
                            styles.legendColor, 
                            { backgroundColor: dadosProgresso.colors[index] }
                          ]} 
                        />
                        <Text style={styles.legendText}>
                          {label} ({Math.round(dadosProgresso.data[index] * 100)}%)
                        </Text>
                      </View>
                    ))}
                  </View>
                </>
              )}
            </>
          )}
        </View>
        
        <Text style={[styles.subtitle, { marginTop: 20 }]}>
          {t('charts.listTitle', { from: dataInicialFormatada, to: dataFinalFormatada })}
        </Text>
        {!loading && relatorioData.length > 0 && (
          <>
            <ListHeader />
            {relatorioData.map(item => (
              <View key={item.id} style={styles.itemContainer}>
                <Text style={styles.itemTabela}>{item.name}</Text>
                <Text style={styles.itemTabela}>{item.totalVendido} {t('charts.units')}</Text>
                <Text style={styles.itemTabela}>{formatCurrency(item.price * item.totalVendido)}</Text>
              </View>
            ))}
            
              <View style={styles.itemContainer}>
                <Text style={styles.itemTabela}>{t('charts.grandTotal')}</Text>
                <Text style={styles.itemTabela}>{relatorioData.reduce((total, item) => total + item.totalVendido, 0)} {t('charts.units')}</Text>
                <Text style={styles.itemTabela}>{formatCurrency(relatorioData.reduce((total, item) => total + (item.price * item.totalVendido), 0))}</Text>
              </View>
            
            <TouchableOpacity
              style={[styles.shareButton, { backgroundColor: colors.text }]}
              onPress={() => compartilharRelatorio(relatorioData, dataInicial, dataFinal)}
              accessibilityRole="button"
              accessibilityLabel={t('charts.share')}
            >
              <Ionicons name="share-outline" size={20} color={colors.background} />
              <Text style={[styles.shareButtonText, { color: colors.background }]}>{t('charts.share')}</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    borderColor: 'black',
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
  dateInfoContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  dateInfoText: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  subtitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  chartControls: {
    marginBottom: 20,
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  controlLabel: {
    fontSize: 16,
    fontWeight: '500',
    width: '40%',
  },
  pickerSmallContainer: {
    borderWidth: 1,
    borderColor: '#999',
    borderRadius: 8,
    overflow: 'hidden',
    width: '60%',
  },
  chartContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  listHeaderContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  listHeaderText: {
    fontWeight: 'bold',
    fontSize: 16,
    textAlign: 'center',
  },
  itemContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  finalListContainer: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  itemTabela: {
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    height: 220,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
  },
  emptyText: {
    fontSize: 16,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 40,
  },
  customLegend: {
    marginTop: 16,
    alignItems: 'flex-start',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  legendColor: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 8,
  },
  legendText: {
    fontSize: 14,
  },
  shareButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginTop: 20,
    marginBottom: 30,
  },
  shareButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
});
