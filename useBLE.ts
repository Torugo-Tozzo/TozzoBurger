import { BleManager, Device } from 'react-native-ble-plx';
import { PermissionsAndroid, Platform, Alert } from 'react-native';
import { Buffer } from 'buffer';
import { error } from 'console';

const manager = new BleManager();

// Verifica e solicita permissões necessárias para o BLE
const checkAndRequestPermissions = async (): Promise<boolean> => {
  if (Platform.OS === 'android') {
    const permissions = [
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    ];

    const granted = await PermissionsAndroid.requestMultiple(permissions);
    const allGranted = Object.values(granted).every(value => value === PermissionsAndroid.RESULTS.GRANTED);

    if (!allGranted) {
      console.log('Permissões necessárias não foram concedidas.');
      return false;
    }
  }
  return true;
};

// Escaneia dispositivos Bluetooth próximos
const listNearbyDevices = async (): Promise<Device[]> => {
  const permissionsGranted = await checkAndRequestPermissions();
  if (!permissionsGranted) {
    return [];
  }

  console.log('Escaneando dispositivos...');
  const devices: Device[] = [];

  return new Promise((resolve) => {
    manager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        console.error('Erro ao escanear:', error.message);
        manager.stopDeviceScan();
        resolve([]);
        return;
      }

      if (device && device.name && !devices.some(d => d.id === device.id)) {
        console.log(`Dispositivo encontrado: ${device.name} - ${device.id}`);
        devices.push(device);
      }
    });

    setTimeout(() => {
      manager.stopDeviceScan();
      resolve(devices);
    }, 3000); // Escaneia por 3 segundos
  });
};

// Conecta a um dispositivo Bluetooth e registra o UUID e o nome
const connectToDevice = async (deviceId: string): Promise<Device | null> => {
  try {
    console.log(`Conectando ao dispositivo: ${deviceId}`);
    const device = await manager.connectToDevice(deviceId);
    await device.discoverAllServicesAndCharacteristics();

    console.log(`Dispositivo conectado: ${device.id}`);
    return device;
  } catch (error) {
    console.error('Erro ao conectar ao dispositivo:', error);
    return null;
  }
};

// Função para desconectar de um dispositivo
const disconnectFromDevice = async (deviceId: string): Promise<void> => {
  try {
    await manager.cancelDeviceConnection(deviceId);
    console.log('Desconectado do dispositivo:', deviceId);
  } catch (error) {
    console.error('Erro ao desconectar do dispositivo:', error);
  }
};

// Função para enviar dados (como mensagem) para o dispositivo
const sendMessageToDevice = async (message: string, printer: any): Promise<void> => {
  if (!printer || !printer.uuid) {
    console.error('Nenhuma impressora padrão registrada no banco.');
    throw new Error('Nenhuma impressora padrão registrada no banco.');
  }

  // Conectar ao dispositivo com o UUID da impressora
  const device: Device | null = await connectToDevice(printer.uuid);
  if (!device) {
    console.error('Falha ao conectar à impressora.');
    throw new Error('Falha ao conectar à impressora.');
  }

  // Busca os serviços e características e envia a mensagem
  const services = await device.services();
  let messageSent = false;

  for (const service of services) {
    const characteristics = await service.characteristics();
    for (const characteristic of characteristics) {
      if (characteristic.isWritableWithResponse || characteristic.isWritableWithoutResponse) {
        console.log(`Enviando mensagem para a característica: ${characteristic.uuid}`);

        // Dividir a mensagem em blocos menores
        const base64Message = Buffer.from(message, 'utf-8').toString('base64');
        const chunkSize = 20; // Limite do tamanho do bloco
        const chunks = base64Message.match(new RegExp(`.{1,${chunkSize}}`, 'g')) || [];

        // Enviar cada bloco
        for (const chunk of chunks) {
          await characteristic.writeWithResponse(chunk); // Ou writeWithoutResponse, se suportado
          console.log(`Bloco enviado: ${chunk}`);
        }

        console.log('Mensagem enviada com sucesso!');
        messageSent = true;
        break;
      }
    }
    if (messageSent) break;
  }

  if (!messageSent) {
    console.error('Nenhuma característica disponível para escrita encontrada.');
    throw new Error('Nenhuma característica disponível para escrita encontrada.');
  }

  // Desconectar do dispositivo
  await disconnectFromDevice(printer.uuid);
  console.log('Desconectado da impressora.');
};

export { listNearbyDevices, connectToDevice, disconnectFromDevice, sendMessageToDevice };
