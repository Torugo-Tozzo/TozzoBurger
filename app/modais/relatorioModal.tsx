import React, { useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Dimensions, useColorScheme, Share } from 'react-native';
import { View, Text } from '@/components/Themed';
import { useLocalSearchParams, router } from 'expo-router';
import { useProductDatabase } from '@/database/useProductDatabase';
import { useVendasDatabase } from '@/database/useVendaDatabse';
import { Picker } from "@react-native-picker/picker";
import { PieChart, ProgressChart } from 'react-native-chart-kit';
import { Ionicons } from '@expo/vector-icons';

type RelatorioProduto = {
  id: number;
  nome: string;
  totalVendido: number;
};

type TipoGrafico = 'pizza' | 'progresso';

export default function RelatorioModal() {
  const params = useLocalSearchParams();
  const { getTipoProdutos } = useProductDatabase();
  const { getRelatorioPorPeriodo } = useVendasDatabase();
  const colorScheme = useColorScheme();
  
  const [dataInicial] = useState(() =>
    params.dataInicial ? new Date(params.dataInicial as string) : new Date()
  );
  
  const [dataFinal] = useState(() =>
    params.dataFinal ? new Date(params.dataFinal as string) : new Date()
  );
  
  const [tipoProdutoId, setTipoProdutoId] = useState<number | null>(
    params.tipoProdutoId && params.tipoProdutoId !== '' 
      ? Number(params.tipoProdutoId) 
      : 100
  );
  
  const [tipoGrafico, setTipoGrafico] = useState<TipoGrafico>('pizza');
  const [tiposProdutos, setTiposProdutos] = useState<{ id: number; descricao: string }[]>([]);
  
  const dataInicialFormatada = dataInicial.toLocaleDateString('pt-BR');
  const dataFinalFormatada = dataFinal.toLocaleDateString('pt-BR');
  
  const [tipoDescricao, setTipoDescricao] = useState<string>("Todos os tipos");
  const [relatorioData, setRelatorioData] = useState<RelatorioProduto[]>([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    async function fetchTiposProdutos() {
      try {
        const tipos = await getTipoProdutos();
        setTiposProdutos(tipos);
      } catch (error) {
        console.error('Erro ao carregar tipos de produtos:', error);
      }
    }
    
    fetchTiposProdutos();
  }, []);
  
  useEffect(() => {
    async function fetchTipoDescricao() {
      if (tipoProdutoId && tipoProdutoId !== 100) {
        try {
          const tipos = await getTipoProdutos();
          const tipo = tipos.find(t => t.id === tipoProdutoId);
          if (tipo) {
            setTipoDescricao(tipo.descricao);
          }
        } catch (error) {
          console.error('Erro ao carregar tipo de produto:', error);
        }
      } else {
        setTipoDescricao("Todos os tipos");
      }
    }
    
    fetchTipoDescricao();
  }, [tipoProdutoId]);
  
  useEffect(() => {
    async function carregarDadosRelatorio() {
      setLoading(true);
      try {
        let tipoIdParam = '';
        
        if (tipoProdutoId) {
          if (tipoProdutoId === 100) {
            tipoIdParam = '';
          } else {
            tipoIdParam = tipoProdutoId.toString();
          }
        }
        
        const dados = await getRelatorioPorPeriodo(
          dataInicial.toISOString(),
          dataFinal.toISOString(),
          tipoIdParam
        );
        setRelatorioData(dados);
      } catch (error) {
        console.error('Erro ao carregar dados do relatório:', error);
      } finally {
        setLoading(false);
      }
    }
    
    carregarDadosRelatorio();
  }, [dataInicial, dataFinal, tipoProdutoId]);

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
          name: item.nome,
          totalVendido: item.totalVendido,
          color: color,
          legendFontColor: '#7F7F7F',
          legendFontSize: 12
        };
      });
      
      labels = dadosOrdenados.map(item => item.nome);
      values = dadosOrdenados.map(item => item.totalVendido);
    } else {
      const top5 = dadosOrdenados.slice(0, 5);
      const outros = dadosOrdenados.slice(5);
      
      const totalOutros = outros.reduce((sum, item) => sum + item.totalVendido, 0);
      
      top5.forEach((item, index) => {
        const color = getColor(index);
        colors.push(color);
        dadosPizza.push({
          name: item.nome,
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
      
      labels = [...top5.map(item => item.nome), 'Outros'];
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
    <View style={styles.listHeaderContainer}>
      <Text style={styles.listHeaderText}>Produto</Text>
      <Text style={styles.listHeaderText}>Nº Vendas</Text>
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
        textoRelatorio += `${index + 1}. ${item.nome}: ${item.totalVendido} unidades\n`;
      });
      
      const totalGeral = relatorioData.reduce((total, item) => total + item.totalVendido, 0);
      textoRelatorio += `\nTotal de itens vendidos: ${totalGeral} unidades`;
      
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
      <View style={styles.header}>
        <Text style={styles.title}>Relatório de Vendas</Text>
        <TouchableOpacity 
          style={styles.closeButton}
          onPress={() => router.back()}
        >
          <Text style={styles.closeButtonText}>X</Text>
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
                style={colorScheme === "dark" ? { color: "#fff" } : { color: "#000" }}
                dropdownIconColor={colorScheme === "dark" ? "#fff" : "#000"}
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
                selectedValue={tipoProdutoId}
                onValueChange={(itemValue) => setTipoProdutoId(itemValue)}
                style={colorScheme === "dark" ? { color: "#fff" } : { color: "#000" }}
                dropdownIconColor={colorScheme === "dark" ? "#fff" : "#000"}
              >
                <Picker.Item label="Todos os tipos" value={100} />
                {tiposProdutos.map((tipo) => (
                  <Picker.Item key={tipo.id} label={tipo.descricao} value={tipo.id} />
                ))}
              </Picker>
            </View>
          </View>
        </View>
        
        <View style={styles.chartContainer}>
          <Text style={styles.subtitle}>Produtos mais vendidos - {tipoDescricao}</Text>
          
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#2196F3" />
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
                <Text style={styles.itemNome}>{item.nome}</Text>
                <Text style={styles.itemQuantidade}>{item.totalVendido} un.</Text>
              </View>
            ))}
            
            <TouchableOpacity 
              style={styles.shareButton}
              onPress={() => compartilharRelatorio(relatorioData, dataInicial, dataFinal)}
            >
              <Ionicons name="share-outline" size={20} color="white" />
              <Text style={styles.shareButtonText}>Compartilhar</Text>
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
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#2196F3',
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
    backgroundColor: '#2196F3',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  listHeaderText: {
    fontWeight: 'bold',
    fontSize: 16,
    color: 'white',
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
  itemNome: {
    fontSize: 16,
    flex: 3,
  },
  itemQuantidade: {
    fontSize: 16,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'right',
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
    backgroundColor: '#2196F3',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginTop: 20,
    marginBottom: 30,
  },
  shareButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
});