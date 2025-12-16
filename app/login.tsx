import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Image } from 'react-native';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuth } from '@/context/AuthContext';

export default function LoginScreen() {
  const { login } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !senha) {
      Alert.alert('Preencha email e senha');
      return;
    }
    setLoading(true);
    try {
      const ok = await login(email, senha);
      if (ok) {
        console.log('Login successful — RootLayout will handle redirect');
      } else {
        Alert.alert('Falha no login', 'Credenciais inválidas');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('Login error:', err);
      Alert.alert('Erro', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: isDark ? '#000' : '#fff' }]}>
      <Image
        source={require('../assets/images/logo-login.png')}
        style={[styles.logo, { backgroundColor: isDark ? 'transparent' : '#fff' }]}
        resizeMode="contain"
        fadeDuration={0}
      />
      <Text style={[styles.title, { color: isDark ? '#fff' : '#000' }]}>Tozzo.uk</Text>
      <View style={styles.form}>
        <TextInput
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          style={[styles.input, { backgroundColor: isDark ? '#111' : '#fff', borderColor: isDark ? '#333' : '#ddd', color: isDark ? '#fff' : '#000' }]}
          placeholderTextColor={isDark ? '#9b9b9b' : '#8a8a8a'}
        />
        <TextInput
          placeholder="Senha"
          value={senha}
          onChangeText={setSenha}
          secureTextEntry
          style={[styles.input, { backgroundColor: isDark ? '#111' : '#fff', borderColor: isDark ? '#333' : '#ddd', color: isDark ? '#fff' : '#000' }]}
          placeholderTextColor={isDark ? '#9b9b9b' : '#8a8a8a'}
        />
        <Pressable style={[styles.button, { backgroundColor: isDark ? '#ff8a3a' : '#ff6b00' }]} onPress={handleLogin} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Entrar</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 24,
  },
  logo: {
    width: 140,
    height: 140,
    marginBottom: 12,
  },
  form: {
    width: '100%',
  },
  input: {
    height: 48,
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  button: {
    height: 48,
    backgroundColor: '#ff6b00',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
  },
});
