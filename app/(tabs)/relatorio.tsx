import React, { useState, useEffect } from 'react';
import { StyleSheet, TouchableOpacity, TextInput, useColorScheme, Alert, Modal } from 'react-native';
import { View, Text } from '@/components/Themed';
import { Calendar } from 'react-native-calendars';
import { router } from 'expo-router';
import { Picker } from "@react-native-picker/picker";
import { useProductDatabase } from '@/database/useProductDatabase';

export default function Relatorio() {
  const [dataInicial, setDataInicial] = useState(new Date());
  const [dataFinal, setDataFinal] = useState(new Date());
  const [showCalendarInicial, setShowCalendarInicial] = useState(false);
  const [showCalendarFinal, setShowCalendarFinal] = useState(false);
  const [tipoProdutoId, setTipoProdutoId] = useState<number | null>(null);
  const [tiposProdutos, setTiposProdutos] = useState<{ id: number; descricao: string }[]>([]);
  const colorScheme = useColorScheme();
  
  const { getTipoProdutos } = useProductDatabase();
  
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

  const handleGerarRelatorio = () => {
    if (tipoProdutoId === null) {
      Alert.alert(
        "Tipo não selecionado", 
        "Por favor, selecione um tipo de produto ou a opção 'Todos'",
        [{ text: "OK", style: "default" }]
      );
      return;
    }
    
    router.push({
      pathname: '/modais/relatorioModal',
      params: {
        dataInicial: dataInicial.toISOString(),
        dataFinal: dataFinal.toISOString(),
        tipoProdutoId: tipoProdutoId === 100 ? '' : tipoProdutoId.toString()
      }
    });
  };

  // Função para formatar data para o formato YYYY-MM-DD (usado pelo Calendar)
  const formatCalendarDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  return (
    <View style={styles.container}>      
      <View style={styles.dateContainer}>
        <Text style={styles.label}>Data Inicial:</Text>
        <TouchableOpacity 
          style={styles.dateButton} 
          onPress={() => setShowCalendarInicial(true)}
        >
          <Text style={styles.dateText}>
            {dataInicial.toLocaleDateString('pt-BR', { 
              weekday: 'short', 
              day: '2-digit', 
              month: '2-digit', 
              year: 'numeric' 
            })}
          </Text>
        </TouchableOpacity>
        
        <Modal
          visible={showCalendarInicial}
          transparent={true}
          animationType="slide"
        >
          <View style={styles.modalContainer}>
            <View style={styles.calendarContainer}>
              <Text style={styles.modalTitle}>Selecione a Data Inicial</Text>
              
              <Calendar
                current={formatCalendarDate(dataInicial)}
                onDayPress={(day: {timestamp: number; dateString: string; day: number; month: number; year: number}) => {
                  const selectedDate = new Date(day.timestamp);
                  setDataInicial(selectedDate);
                  setShowCalendarInicial(false);
                }}
                markedDates={{
                  [formatCalendarDate(dataInicial)]: {
                    selected: true,
                    selectedColor: '#2196F3',
                  }
                }}
                theme={{
                  calendarBackground: colorScheme === 'dark' ? '#333' : '#fff',
                  textSectionTitleColor: '#b6c1cd',
                  selectedDayBackgroundColor: '#2196F3',
                  selectedDayTextColor: '#ffffff',
                  todayTextColor: '#2196F3',
                  dayTextColor: colorScheme === 'dark' ? '#fff' : '#2d4150',
                  textDisabledColor: '#d9e1e8',
                  dotColor: '#2196F3',
                  selectedDotColor: '#ffffff',
                  arrowColor: '#2196F3',
                  monthTextColor: colorScheme === 'dark' ? '#fff' : '#2d4150',
                  indicatorColor: '#2196F3',
                }}
                firstDay={0} // Domingo como primeiro dia da semana
              />
              
              <TouchableOpacity 
                style={styles.closeButton}
                onPress={() => setShowCalendarInicial(false)}
              >
                <Text style={styles.closeButtonText}>Fechar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>

      <View style={styles.dateContainer}>
        <Text style={styles.label}>Data Final:</Text>
        <TouchableOpacity 
          style={styles.dateButton} 
          onPress={() => setShowCalendarFinal(true)}
        >
          <Text style={styles.dateText}>
            {dataFinal.toLocaleDateString('pt-BR', { 
              weekday: 'short', 
              day: '2-digit', 
              month: '2-digit', 
              year: 'numeric' 
            })}
          </Text>
        </TouchableOpacity>
        
        <Modal
          visible={showCalendarFinal}
          transparent={true}
          animationType="slide"
        >
          <View style={styles.modalContainer}>
            <View style={styles.calendarContainer}>
              <Text style={styles.modalTitle}>Selecione a Data Final</Text>
              
              <Calendar
                current={formatCalendarDate(dataFinal)}
                onDayPress={(day: {timestamp: number; dateString: string; day: number; month: number; year: number}) => {
                  const selectedDate = new Date(day.timestamp);
                  setDataFinal(selectedDate);
                  setShowCalendarFinal(false);
                }}
                markedDates={{
                  [formatCalendarDate(dataFinal)]: {
                    selected: true,
                    selectedColor: '#2196F3',
                  }
                }}
                theme={{
                  calendarBackground: colorScheme === 'dark' ? '#333' : '#fff',
                  textSectionTitleColor: '#b6c1cd',
                  selectedDayBackgroundColor: '#2196F3',
                  selectedDayTextColor: '#ffffff',
                  todayTextColor: '#2196F3',
                  dayTextColor: colorScheme === 'dark' ? '#fff' : '#2d4150',
                  textDisabledColor: '#d9e1e8',
                  dotColor: '#2196F3',
                  selectedDotColor: '#ffffff',
                  arrowColor: '#2196F3',
                  monthTextColor: colorScheme === 'dark' ? '#fff' : '#2d4150',
                  indicatorColor: '#2196F3',
                }}
                firstDay={0} // Domingo como primeiro dia da semana
              />
              
              <TouchableOpacity 
                style={styles.closeButton}
                onPress={() => setShowCalendarFinal(false)}
              >
                <Text style={styles.closeButtonText}>Fechar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
      
      <View style={styles.dateContainer}>
        <Text style={styles.label}>Tipo de Produto :</Text>
        <View style={styles.pickerContainer}>
          <Picker
            selectedValue={tipoProdutoId}
            onValueChange={(itemValue) => setTipoProdutoId(itemValue)}
            style={styles.picker}
            dropdownIconColor={colorScheme === "dark" ? "#fff" : "#000"}
          >
            <Picker.Item label="Selecione" value={null} />
            <Picker.Item label="Todos os tipos" value={100} />
            {tiposProdutos.map((tipo) => (
              <Picker.Item key={tipo.id} label={tipo.descricao} value={tipo.id} />
            ))}
          </Picker>
        </View>
      </View>

      <TouchableOpacity 
        style={styles.button}
        onPress={handleGerarRelatorio}
      >
        <Text style={styles.buttonText}>Gerar Relatório</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    padding: 20,
    paddingTop: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30,
  },
  dateContainer: {
    width: '100%',
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    marginBottom: 8,
    fontWeight: '500',
  },
  dateButton: {
    padding: 12,
    borderRadius: 8,
    width: '100%',
    borderWidth: 1,
    borderColor: '#999',
  },
  dateText: {
    fontSize: 16,
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#999',
    borderRadius: 8,
    overflow: 'hidden',
  },
  picker: {
    color: 'grey',
  },
  button: {
    backgroundColor: '#2196F3',
    padding: 15,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  calendarContainer: {
    width: '90%',
    padding: 20,
    backgroundColor: 'white',
    borderRadius: 10,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  closeButton: {
    backgroundColor: '#2196F3',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 15,
  },
  closeButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});