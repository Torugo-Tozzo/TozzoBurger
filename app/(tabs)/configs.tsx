import React, { useState, useEffect } from 'react';
import { Button, Alert, ActivityIndicator, TextInput, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Text, View } from '@/components/Themed';
import { useColorScheme } from '@/components/useColorScheme';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { usePrinterDatabase } from '@/database/usePrinterDatabase'; // Importando o hook de banco de dados
import { listNearbyDevices, connectToDevice, disconnectFromDevice } from '@/useBLE'; // Importando os métodos de BLE
import { useAuth } from '@/context/AuthContext';
import Constants from 'expo-constants';
import { useSyncRefresh } from '@/hooks/useSyncRefresh';

const BluetoothScreen = () => {
  const { setPrinter, getPrinter, removePrinter } = usePrinterDatabase(); // Métodos do banco de dados
  const [devices, setDevices] = useState<any[]>([]); // Dispositivos Bluetooth encontrados
  const [connectedPrinter, setConnectedPrinter] = useState<string | null>(null); // Impressora conectada (UUID)
  const [isScanning, setIsScanning] = useState(false); // Estado para controlar se está escaneando

  const { user, login, logout, token } = useAuth();
  const isCliente = user?.role === 'CLIENTE';
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const { refreshing, onRefresh } = useSyncRefresh();

  useEffect(() => {
    // Verifica se já existe uma impressora registrada
    const fetchPrinter = async () => {
      try {
        const printerUUID = await getPrinter(); // Obtém o UUID da impressora
        if (printerUUID && printerUUID.nome) {
          setConnectedPrinter(printerUUID.nome);
        }
      } catch (error) {
        console.log('Nenhuma impressora registrada.');
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
        setConnectedPrinter(device.name || device.id); // Atualiza o estado com o nome da impressora conectada
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

  const handleLogin = async () => {
    setLoginLoading(true);
    try {
      const ok = await login(email.trim(), senha);
      if (!ok) {
        Alert.alert('Falha ao entrar', 'Credenciais inválidas');
      } else {
        setEmail('');
        setSenha('');
      }
    } catch (err) {
      Alert.alert('Erro', 'Erro ao tentar fazer login');
    } finally {
      setLoginLoading(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: isDark ? '#000' : '#fff' }}
      contentContainerStyle={{ padding: 20 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >

      {/* Sections: User / Printer */}
      <View style={[styles.section, { backgroundColor: isDark ? '#111' : '#fff', borderColor: isDark ? '#222' : '#e6e6e6' }]}>
        <View style={[styles.sectionHeader, { backgroundColor: isDark ? '#0d0d0d' : '#fafafa' }] }>
          <Text style={[styles.sectionTitle, { color: isDark ? '#fff' : '#000' }]}>Usuário</Text>
        </View>
        <View style={styles.sectionContent}>
          {user ? (
            <View style={{ alignItems: 'center' }}>
              <FontAwesome name="user-circle" size={56} color={isDark ? '#ddd' : '#666'} style={styles.userIcon} />
              <Text style={[styles.username, { color: isDark ? '#fff' : '#000' }]}>{user.nome ?? user.email}</Text>
              <View style={{ marginTop: 8 }}>
                <Button title="Sair" onPress={() => logout()} />
              </View>
            </View>
          ) : (
            <View>
              <Text style={{ marginBottom: 8, color: isDark ? '#fff' : '#000' }}>Conecte-se à API para sincronizar</Text>
              <TextInput
                placeholder="E-mail"
                value={email}
                onChangeText={setEmail}
                style={[styles.input, { backgroundColor: isDark ? '#111' : '#fff', borderColor: isDark ? '#333' : '#ccc', color: isDark ? '#fff' : '#000' }]}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <TextInput
                placeholder="Senha"
                value={senha}
                onChangeText={setSenha}
                style={[styles.input, { backgroundColor: isDark ? '#111' : '#fff', borderColor: isDark ? '#333' : '#ccc', color: isDark ? '#fff' : '#000' }]}
                secureTextEntry
              />
              <Button title={loginLoading ? 'Entrando...' : 'Entrar'} onPress={handleLogin} disabled={loginLoading} />
            </View>
          )}
        </View>
      </View>

      {!isCliente && (
        <View style={[styles.section, { backgroundColor: isDark ? '#111' : '#fff', borderColor: isDark ? '#222' : '#e6e6e6' }]}>
          <View style={[styles.sectionHeader, { backgroundColor: isDark ? '#0d0d0d' : '#fafafa' }] }>
            <Text style={[styles.sectionTitle, { color: isDark ? '#fff' : '#000' }]}>Impressora</Text>
          </View>
          <View style={styles.sectionContent}>
            {connectedPrinter ? (
              <View>
                <Text style={{ fontSize: 18, marginBottom: 10, color: isDark ? '#fff' : '#000' }}>Impressora conectada: {connectedPrinter}</Text>
                <Button title="Remover Impressora" onPress={handleRemovePrinter} />
              </View>
            ) : (
              <View>
                <Button title="Adicionar Impressora" onPress={handleScanDevices} />
              </View>
            )}
          </View>
        </View>
      )}

      {!isCliente && (isScanning ? (
        <ActivityIndicator size="large" color={isDark ? '#fff' : '#0000ff'} />
      ) : (
        devices.map((item) => (
          <View key={item.id} style={{ marginVertical: 10 }}>
            <Text style={{ textAlign: 'center', margin: 10, color: isDark ? '#fff' : '#000' }}>{item.name || 'Dispositivo desconhecido'}</Text>
            <Button title="Registrar Impressora" onPress={() => handleConnect(item)} />
          </View>
        ))
      ))}

      <Text style={{ textAlign: 'center', color: isDark ? '#555' : '#aaa', fontSize: 12, marginTop: 16 }}>
        v{Constants.expoConfig?.version ?? '?'}
      </Text>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 8,
    marginBottom: 8,
    borderRadius: 4,
  },
  username: {
    fontSize: 18,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginLeft: 8,
  },
  section: {
    marginBottom: 16,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e6e6e6',
  },
  sectionHeader: {
    padding: 12,
    backgroundColor: '#fafafa',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  sectionContent: {
    padding: 12,
  },
  userIcon: {
    marginBottom: 8,
  },
});

export default BluetoothScreen;
