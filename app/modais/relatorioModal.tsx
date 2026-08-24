import React, { useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Dimensions, useColorScheme, Share } from 'react-native';
import { View, Text } from '@/components/Themed';
import { useLocalSearchParams, router } from 'expo-router';
import { useProductDatabase } from '@/database/useProductDatabase';
import { useSaleDatabase } from '@/database/useSaleDatabase';
import { Picker } from "@react-native-picker/picker";
import { PieChart, ProgressChart } from 'react-native-chart-kit';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';

type RelatorioProduto = {
  id: string;
  name: string;
  price: number;
  totalVendido: number;
};

type TipoGrafico = 'pizza' | 'progresso';

export default function RelatorioModal() {
  const params = useLocalSearchParams();
  const { getProductTypes } = useProductDatabase();
  const { getSalesReportByPeriod } = useSaleDatabase();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];

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
  
  const dataInicialFormatada = dataInicial.toLocaleDateString('pt-BR');
  const dataFinalFormatada = dataFinal.toLocaleDateString('pt-BR');
  
  const [tipoDescricao, setTipoDescricao] = useState<string>("Todos os tipos");
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
            setTipoDescricao(productType.description);
          }
        } catch (error) {
          console.error('Erro ao carregar tipo de produto:', error);
        }
      } else {
        setTipoDescricao("Todos os tipos");
      }
    }
    
    fetchTipoDescricao();
  }, [productTypeId]);
  
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
        console.error('Erro ao carregar dados do relatório:', error);
      } finally {
        setLoading(false);
      }
    }
    
    carregarDadosRelatorio();
  }, [dataInicial, dataFinal, productTypeId]);

  const prepararDadosGrafico = () => {
    if (!relatorioData || relatorioData.length === 0) 
      return { 
        dadosPizza: [], 
        dadosProgresso: { data: [], colors: [], labels: [] }
      };

    const dadosOrdenados = [...relatorioData].sort((a, b) => b.totalVendido - a.totalVendido);
    
    let dadosPizza = [];
    let labels = [];
    let values = [];
    let colors = [];
    
    if (dadosOrdenados.length <= 5) {
      dadosPizza = dadosOrdenados.map((item, index) => {
        const color = getColor(index);
        colors.push(color);
        return {
          name: item.name,
          totalVendido: item.totalVendido,
          color: color,
          legendFontColor: '#7F7F7F',
          legendFontSize: 12
        };
      });
      
      labels = dadosOrdenados.map(item => item.name);
      values = dadosOrdenados.map(item => item.totalVendido);
    } else {
      const top5 = dadosOrdenados.slice(0, 5);
      const outros = dadosOrdenados.slice(5);
      
      const totalOutros = outros.reduce((sum, item) => sum + item.totalVendido, 0);
      
      top5.forEach((item, index) => {
        const color = getColor(index);
        colors.push(color);
        dadosPizza.push({
          name: item.name,
          totalVendido: item.totalVendido,
          color: color,
          legendFontColor: '#7F7F7F',
          legendFontSize: 12
        });
      });
      
      const outrosColor = getColor(5);
      colors.push(outrosColor);
      dadosPizza.push({
        name: 'Outros',
        totalVendido: totalOutros,
        color: outrosColor,
        legendFontColor: '#7F7F7F',
        legendFontSize: 12
      });
      
      labels = [...top5.map(item => item.name), 'Outros'];
      values = [...top5.map(item => item.totalVendido), totalOutros];
    }
    
    const totalVendido = values.reduce((sum, value) => sum + value, 0);
    
    const dadosProgresso = {
      data: values.map(value => value / totalVendido),
      colors: colors,
      labels: labels
    };
    
    return { dadosPizza, dadosProgresso };
  };
  
  const getColor = (index: number) => {
    const colors = [
      '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', 
      '#FF9F40', '#8AC054', '#5D9CEC', '#F06292', '#7986CB'
    ];
    return colors[index % colors.length];
  };
  
  const ListHeader = () => (
    <View style={[styles.listHeaderContainer, { backgroundColor: colors.text, borderBottomColor: colors.border }]}>
      <Text style={[styles.listHeaderText, { color: colors.background }]}>Produto</Text>
      <Text style={[styles.listHeaderText, { color: colors.background }]}>Nº Vendas</Text>
      <Text style={[styles.listHeaderText, { color: colors.background }]}>Total</Text>
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
      const dataInicialFormatada = dataInicial.toLocaleDateString('pt-BR');
      const dataFinalFormatada = dataFinal.toLocaleDateString('pt-BR');
      
      let textoRelatorio = `RELATÓRIO DE VENDAS - PERÍODO: ${dataInicialFormatada} a ${dataFinalFormatada}\n\n`;
      textoRelatorio += "PRODUTOS VENDIDOS:\n";
      
      relatorioData.forEach((item, index) => {
        textoRelatorio += `${index + 1}. ${item.name}; ${item.totalVendido} unidades: Total: R$ ${(item.price * item.totalVendido).toFixed(2)}\n`;
      });
      
      const totalGeral = relatorioData.reduce((total, item) => total + item.totalVendido, 0);
      const totalPreco = relatorioData.reduce((total, item) => total + (item.price * item.totalVendido), 0);
      textoRelatorio += `\nitens vendidos: ${totalGeral} unidades | Total: R$ ${totalPreco.toFixed(2)}`;

      await Share.share({
        message: textoRelatorio,
        title: 'Relatório de Vendas'
      });
    } catch (error) {
      console.error('Erro ao compartilhar relatório:', error);
    }
  };

  const { dadosPizza, dadosProgresso } = prepararDadosGrafico();
  const screenWidth = Dimensions.get('window').width - 40;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { backgroundColor: colors.text, borderBottomColor: colors.border }]}>
        <Text style={[styles.title, { color: colors.background }]}>Relatório de Vendas</Text>
        <TouchableOpacity
          style={styles.closeButton}
          onPress={() => router.back()}
        >
          <Text style={[styles.closeButtonText, { color: colors.background }]}>X</Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.dateInfoContainer}>
        <Text style={styles.dateInfoText}>
          Período: {dataInicialFormatada} até {dataFinalFormatada}
        </Text>
      </View>
      
      <ScrollView style={styles.content}>
        <View style={styles.chartControls}>
          <View style={styles.controlRow}>
            <Text style={styles.controlLabel}>Tipo de Gráfico:</Text>
            <View style={styles.pickerSmallContainer}>
              <Picker
                selectedValue={tipoGrafico}
                onValueChange={(itemValue) => setTipoGrafico(itemValue)}
                style={{ color: colors.text }}
                dropdownIconColor={colors.text}
              >
                <Picker.Item label="Pizza" value="pizza" />
                <Picker.Item label="Progresso" value="progresso" />
              </Picker>
            </View>
          </View>
          
          <View style={styles.controlRow}>
            <Text style={styles.controlLabel}>Tipo de Produto:</Text>
            <View style={styles.pickerSmallContainer}>
              <Picker
                selectedValue={productTypeId}
                onValueChange={(itemValue) => setTipoProdutoId(itemValue)}
                style={{ color: colors.text }}
                dropdownIconColor={colors.text}
              >
                <Picker.Item label="Todos os tipos" value={100} />
                {tiposProdutos.map((tipo) => (
                  <Picker.Item key={tipo.id} label={tipo.description} value={tipo.id} />
                ))}
              </Picker>
            </View>
          </View>
        </View>
        
        <View style={styles.chartContainer}>
          <Text style={styles.subtitle}>Produtos mais vendidos - {tipoDescricao}</Text>
          
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Carregando dados...</Text>
            </View>
          ) : relatorioData.length === 0 ? (
            <Text style={styles.emptyText}>
              Nenhum produto vendido no período selecionado.
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
                          {item.name} ({item.totalVendido} un.)
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
          Lista de Produtos Vendidos de {dataInicialFormatada} à {dataFinalFormatada}
        </Text>
        {!loading && relatorioData.length > 0 && (
          <>
            <ListHeader />
            {relatorioData.map(item => (
              <View key={item.id} style={styles.itemContainer}>
                <Text style={styles.itemTabela}>{item.name}</Text>
                <Text style={styles.itemTabela}>{item.totalVendido} un.</Text>
                <Text style={styles.itemTabela}>R$ {(item.price * item.totalVendido).toFixed(2)}</Text>
              </View>
            ))}
            
              <View style={styles.itemContainer}>
                <Text style={styles.itemTabela}>Total Geral</Text>
                <Text style={styles.itemTabela}>{relatorioData.reduce((total, item) => total + item.totalVendido, 0)} un.</Text>
                <Text style={styles.itemTabela}>R$ {relatorioData.reduce((total, item) => total + (item.price * item.totalVendido), 0).toFixed(2)}</Text>
              </View>
            
            <TouchableOpacity
              style={[styles.shareButton, { backgroundColor: colors.text }]}
              onPress={() => compartilharRelatorio(relatorioData, dataInicial, dataFinal)}
            >
              <Ionicons name="share-outline" size={20} color={colors.background} />
              <Text style={[styles.shareButtonText, { color: colors.background }]}>Compartilhar</Text>
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
