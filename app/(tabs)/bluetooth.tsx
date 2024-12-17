import React, { useState } from 'react';
import { StyleSheet, Button, FlatList } from 'react-native';
import { useColorScheme } from '@/components/useColorScheme';
import { Text, View } from '@/components/Themed';
import { listNearbyDevices, connectToDevice, disconnectFromDevice } from '@/useBLE';
import { Device } from 'react-native-ble-plx';

interface DeviceItem {
  id: string;
  name: string | null;
  connected: boolean;
}

let connectedDevice: Device | null = null; // Exportar o dispositivo conectado

export function getConnectedDevice(): Device | null {
  return connectedDevice; // Função para recuperar o dispositivo conectado
}

export default function BluetoothScreen() {
  const [devices, setDevices] = useState<DeviceItem[]>([]);
  const colorScheme = useColorScheme();

  const handleListDevices = async () => {
    const nearbyDevices = await listNearbyDevices();
    setDevices(
      nearbyDevices.map((device) => ({
        id: device.id,
        name: device.name,
        connected: false,
      }))
    );
  };

  const handleConnect = async (deviceId: string) => {
    const device = await connectToDevice(deviceId);
    if (device) {
      connectedDevice = device; // Armazenar o dispositivo conectado
      setDevices((prevDevices) =>
        prevDevices.map((item) =>
          item.id === deviceId ? { ...item, connected: true } : item
        )
      );
    }
  };

  const handleDisconnect = async (deviceId: string) => {
    await disconnectFromDevice(deviceId);
    if (connectedDevice?.id === deviceId) {
      connectedDevice = null; // Resetar o dispositivo conectado
    }
    setDevices((prevDevices) =>
      prevDevices.map((item) =>
        item.id === deviceId ? { ...item, connected: false } : item
      )
    );
  };

  const renderDevice = ({ item }: { item: DeviceItem }) => (
    <View style={styles.deviceItem}>
      <Text style={styles.deviceText}>
        {item.name || 'Desconhecido'} - {item.id}
      </Text>
      {item.connected ? (
        <Button title="Desconectar" onPress={() => handleDisconnect(item.id)} />
      ) : (
        <Button title="Conectar" onPress={() => handleConnect(item.id)} />
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <Button title="Listar Dispositivos Bluetooth" onPress={handleListDevices} />
      <FlatList
        data={devices}
        keyExtractor={(item) => item.id}
        renderItem={renderDevice}
        contentContainerStyle={styles.deviceList}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
  },
  deviceList: {
    marginTop: 20,
  },
  deviceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    borderColor: '#ccc',
  },
  deviceText: {
    flex: 1,
    fontSize: 16,
  },
});
