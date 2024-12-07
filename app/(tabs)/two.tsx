import React, { useEffect } from 'react';
import { StyleSheet, FlatList, Button, Text, View } from 'react-native';
import { useBLE } from '@/useBLE'; // Importando o hook useBLE

export default function TabTwoScreen() {
  const {
    devices,
    isScanning,
    connectedDevice,
    startScan,
    stopScan,
    connectDevice,
    disconnectDevice,
    error,
  } = useBLE();

  useEffect(() => {
    // Iniciar o escaneamento ao montar o componente
    startScan();

    // Parar o escaneamento após 10 segundos
    const timer = setTimeout(() => {
      stopScan();
    }, 10000);

    return () => clearTimeout(timer); // Limpeza do timeout ao desmontar
  }, [startScan, stopScan]);

  const renderItem = ({ item }: { item: any }) => (
    <View style={styles.deviceItem}>
      <Text>{item.name}</Text>
      <Button
        title="Conectar"
        onPress={() => connectDevice(item)}
        disabled={isScanning || connectedDevice !== null}
      />
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Dispositivos Bluetooth</Text>
      {error && <Text style={styles.error}>{error}</Text>}

      {/* Botões de controle */}
      <Button
        title={isScanning ? 'Parar escaneamento' : 'Iniciar escaneamento'}
        onPress={isScanning ? stopScan : startScan}
      />
      {connectedDevice && (
        <View style={styles.deviceItem}>
          <Text>Conectado a: {connectedDevice.name}</Text>
          <Button title="Desconectar" onPress={disconnectDevice} />
        </View>
      )}

      {/* Listagem de dispositivos */}
      <FlatList
        data={devices}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    width: '100%',
  },
  error: {
    color: 'red',
    marginBottom: 10,
  },
});
