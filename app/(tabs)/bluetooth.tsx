import React, { useState } from 'react';
import { StyleSheet, Button, FlatList, View, TouchableOpacity } from 'react-native';
import { useColorScheme } from '@/components/useColorScheme';
import { Text } from '@/components/Themed'

import { listNearbyDevices, connectToDevice, disconnectFromDevice } from '@/useBLE';

interface DeviceItem {
  id: string;
  name: string | null;
  connected: boolean;
}

export default function TabTwoScreen() {
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
    const connectedDevice = await connectToDevice(deviceId);
    if (connectedDevice) {
      setDevices((prevDevices) =>
        prevDevices.map((device) =>
          device.id === deviceId ? { ...device, connected: true } : device
        )
      );
    }
  };

  const handleDisconnect = async (deviceId: string) => {
    await disconnectFromDevice(deviceId);
    setDevices((prevDevices) =>
      prevDevices.map((device) =>
        device.id === deviceId ? { ...device, connected: false } : device
      )
    );
  };

  const renderDevice = ({ item }: { item: DeviceItem }) => (
    <View style={styles.deviceItem}>
      <Text style={styles.deviceText} >
        {item.name || 'Dispositivo Desconhecido'} - {item.id}
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
    fontSize: 16
  },
});
