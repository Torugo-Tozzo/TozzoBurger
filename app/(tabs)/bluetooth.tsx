import React, { useState, useEffect } from 'react';
import { Button, FlatList, Alert, ActivityIndicator } from 'react-native';
import { Text, View } from '@/components/Themed';
import { usePrinterDatabase } from '@/database/usePrinterDatabase'; // Importando o hook de banco de dados
import { listNearbyDevices, connectToDevice, disconnectFromDevice } from '@/useBLE'; // Importando os métodos de BLE

const BluetoothScreen = () => {
  const { setPrinter, getPrinter, removePrinter } = usePrinterDatabase(); // Métodos do banco de dados
  const [devices, setDevices] = useState<any[]>([]); // Dispositivos Bluetooth encontrados
  const [connectedPrinter, setConnectedPrinter] = useState<string | null>(null); // Impressora conectada (UUID)
  const [isScanning, setIsScanning] = useState(false); // Estado para controlar se está escaneando

  useEffect(() => {
    // Verifica se já existe uma impressora registrada
    const fetchPrinter = async () => {
      try {
        const printerUUID = await getPrinter(); // Obtém o UUID da impressora
        setConnectedPrinter(printerUUID.nome); // Define o UUID da impressora conectada
      } catch (error) {
        console.log("Nenhuma impressora registrada.");
      }
    };
    
    fetchPrinter();
  }, [getPrinter]);

  // Função que escaneia os dispositivos Bluetooth
  const handleScanDevices = async () => {
    setIsScanning(true); // Inicia o carregamento
    try {
      const foundDevices = await listNearbyDevices(); // Obtém os dispositivos encontrados
      if (foundDevices.length === 0) {
        Alert.alert('Nenhum dispositivo encontrado. \nSeu bluetooth está ligado?');
      } else {
        setDevices(foundDevices); // Atualiza a lista de dispositivos encontrados
      }
    } catch (error) {
      console.error('Erro ao escanear dispositivos:', error);
    } finally {
      setIsScanning(false); // Finaliza o carregamento
    }
  };

  // Função para conectar e registrar uma impressora
  const handleConnect = async (device: any) => {
    try {
      const connectedDevice = await connectToDevice(device.id); // Conecta ao dispositivo

      if (connectedDevice) {
        // Quando o dispositivo for conectado, registra o UUID e o nome
        await setPrinter(device.id, device.name); // Salva o UUID da impressora no banco de dados
        setConnectedPrinter(device.id); // Atualiza o estado com o UUID da impressora conectada
        setDevices([]); // Limpa a lista de dispositivos após conectar a impressora
        Alert.alert('Impressora conectada com sucesso!');
      } else {
        Alert.alert('Erro ao conectar ao dispositivo.');
      }
    } catch (error) {
      console.error('Erro ao conectar:', error);
    }
    await disconnectFromDevice(device.id); // Desconecta do dispositivo
  };

  // Função para remover a impressora conectada
  const handleRemovePrinter = async () => {
    try {
      await removePrinter(); // Remove o UUID da impressora do banco de dados
      setConnectedPrinter(null); // Limpa o estado
      Alert.alert('Impressora removida.');
    } catch (error) {
      console.error('Erro ao remover impressora:', error);
    }
  };

  return (
    <View style={{ flex: 1, padding: 20 }}>
      {connectedPrinter ? (
        <View>
          <Text style={{fontSize: 18, marginBottom: 10}}>Impressora conectada: {connectedPrinter}</Text>
          <Button title="Remover Impressora" onPress={handleRemovePrinter} />
        </View>
      ) : (
        <View>
          <Button title="Adicionar Impressora" onPress={handleScanDevices} />
        </View>
      )}

      {isScanning ? (
        <ActivityIndicator size="large" color="#0000ff" />
      ) : (
        <FlatList
          data={devices}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={{ marginVertical: 10 }}>
              <Text style={{textAlign: 'center', margin: 10}}>{item.name || 'Dispositivo desconhecido'}</Text>
              <Button title="Registrar Impressora" onPress={() => handleConnect(item)} />
            </View>
          )}
        />
      )}
    </View>
  );
};

export default BluetoothScreen;
