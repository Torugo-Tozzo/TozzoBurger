import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Alert } from 'react-native';
import { Image } from 'react-native';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/Button';
import Colors from '@/constants/Colors';

export default function LoginScreen() {
  const { login } = useAuth();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
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
        console.log('Login successful - initial sync running in background');
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
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Image
        source={require('../assets/images/logo-login.png')}
        style={styles.logo}
        resizeMode="contain"
        fadeDuration={0}
      />
      <Text style={[styles.title, { color: colors.text }]}>Tozzo.uk</Text>
      <View style={styles.form}>
        <TextInput
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
          placeholderTextColor={colors.textMuted}
        />
        <TextInput
          placeholder="Senha"
          value={senha}
          onChangeText={setSenha}
          secureTextEntry
          style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
          placeholderTextColor={colors.textMuted}
        />
        <Button
          title="Entrar"
          onPress={handleLogin}
          loading={loading}
          disabled={loading}
          style={styles.button}
        />
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
    borderColor: 'black',
    borderWidth: 1,
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
    marginTop: 8,
  },
});
