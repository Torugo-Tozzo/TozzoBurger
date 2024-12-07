import { useState, useEffect, useCallback } from 'react';
import { BleManager, Device } from 'react-native-ble-plx';

// Inicializando o gerente BLE
const manager = new BleManager();

export const useBLE = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Função para iniciar o escaneamento de dispositivos
  const startScan = useCallback(() => {

    setIsScanning(true);
    setDevices([]); // Limpa a lista de dispositivos antes de escanear
    manager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        setError(error.message);
        setIsScanning(false);
        return;
      }

      // Adiciona dispositivos encontrados à lista
      if (device && !devices.find(d => d.id === device.id)) {
        setDevices(prevDevices => [...prevDevices, device]);
      }
    });
  }, []);

  // Função para parar o escaneamento
  const stopScan = useCallback(() => {
    setIsScanning(false);
    manager.stopDeviceScan();
  }, []);

  // Função para conectar a um dispositivo
  const connectDevice = useCallback((device: Device) => {
    manager.connectToDevice(device.id)
      .then((connectedDevice) => {
        setConnectedDevice(connectedDevice);
        console.log('Conectado a:', connectedDevice.name);
      })
      .catch((err) => {
        setError(`Falha ao conectar: ${err.message}`);
      });
  }, []);

  // Função para desconectar um dispositivo
  const disconnectDevice = useCallback(() => {
    if (connectedDevice) {
      connectedDevice.cancelConnection()
        .then(() => {
          setConnectedDevice(null);
          console.log('Desconectado');
        })
        .catch((err) => {
          setError(`Falha ao desconectar: ${err.message}`);
        });
    }
  }, [connectedDevice]);

  // Limpeza quando o componente for desmontado
  useEffect(() => {
    return () => {
      stopScan();
      manager.destroy();
    };
  }, [stopScan]);

  return {
    devices,
    isScanning,
    connectedDevice,
    startScan,
    stopScan,
    connectDevice,
    disconnectDevice,
    error,
  };
};
