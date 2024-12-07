import { BleManager, Device } from 'react-native-ble-plx';
import { PermissionsAndroid, Platform } from 'react-native';

const manager = new BleManager();

const checkAndRequestPermissions = async (): Promise<boolean> => {
  if (Platform.OS === 'android') {
    // Verificar e solicitar permissão de localização
    const locationGranted = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    );
    if (!locationGranted) {
      const locationRequest = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Permissão de Localização Necessária',
          message: 'Este app precisa de acesso à localização para escanear dispositivos Bluetooth.',
          buttonNeutral: 'Perguntar depois',
          buttonNegative: 'Cancelar',
          buttonPositive: 'OK',
        }
      );
      if (locationRequest !== PermissionsAndroid.RESULTS.GRANTED) {
        console.log('Permissão de localização foi negada.');
        return false;
      }
    }

    // Verificar e solicitar permissões de Bluetooth no Android >= 12
    if (Platform.Version >= 31) {
      const bluetoothScanGranted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN
      );
      if (!bluetoothScanGranted) {
        const bluetoothScanRequest = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          {
            title: 'Permissão para escanear Bluetooth',
            message: 'Este app precisa de permissão para escanear dispositivos Bluetooth.',
            buttonNeutral: 'Perguntar depois',
            buttonNegative: 'Cancelar',
            buttonPositive: 'OK',
          }
        );
        if (bluetoothScanRequest !== PermissionsAndroid.RESULTS.GRANTED) {
          console.log('Permissão de escaneamento Bluetooth foi negada.');
          return false;
        }
      }

      const bluetoothConnectGranted = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
      );
      if (!bluetoothConnectGranted) {
        const bluetoothConnectRequest = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          {
            title: 'Permissão para conectar Bluetooth',
            message: 'Este app precisa de permissão para conectar dispositivos Bluetooth.',
            buttonNeutral: 'Perguntar depois',
            buttonNegative: 'Cancelar',
            buttonPositive: 'OK',
          }
        );
        if (bluetoothConnectRequest !== PermissionsAndroid.RESULTS.GRANTED) {
          console.log('Permissão de conexão Bluetooth foi negada.');
          return false;
        }
      }
    }
  } else if (Platform.OS === 'ios') {
    const bluetoothState = await manager.state();
    if (bluetoothState !== 'PoweredOn') {
      console.log('Bluetooth no iOS não está ligado ou disponível.');
      return false;
    }
  }
  return true;
};

const listNearbyDevices = async (): Promise<Device[]> => {
  const devices: Device[] = [];
  const permissionsGranted = await checkAndRequestPermissions();

  if (!permissionsGranted) {
    console.log('As permissões necessárias não foram concedidas.');
    return devices;
  }

  console.log('Escaneando dispositivos Bluetooth...');
  return new Promise((resolve) => {
    manager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.log('Erro ao escanear dispositivos:', error.message);
        manager.stopDeviceScan();
        resolve([]);
        return;
      }

      if (device && !devices.find((d) => d.id === device.id)) {
        devices.push(device);
        console.log(`Encontrado: ${device.name || 'Desconhecido'} - ${device.id}`);
      }
    });

    // Parar o scan após 10 segundos
    setTimeout(() => {
      manager.stopDeviceScan();
      console.log('Parando de escanear');
      resolve(devices);
    }, 10000);
  });
};

const connectToDevice = async (deviceId: string): Promise<Device | null> => {
  try {
    console.log('tentando conectar...');
    const device = await manager.connectToDevice(deviceId);
    console.log(`Conectado ao dispositivo: ${device.name || 'Desconhecido'} - ${device.id}`);
    await device.discoverAllServicesAndCharacteristics(); // Necessário para acessar serviços/características
    return device;
  } catch (error) {
    console.error(`Erro ao conectar ao dispositivo ${deviceId}`);
    return null;
  }
};

const disconnectFromDevice = async (deviceId: string): Promise<void> => {
  try {
    await manager.cancelDeviceConnection(deviceId);
    console.log(`Desconectado do dispositivo: ${deviceId}`);
  } catch (error) {
    console.error(`Erro ao desconectar do dispositivo ${deviceId}`);
  }
};

export { listNearbyDevices, connectToDevice, disconnectFromDevice };
