import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Image } from 'react-native';
import { useColorScheme } from '@/components/useColorScheme';
import { useAuth } from '@/context/AuthContext';
import { useAutoSync } from '@/context/AutoSyncContext';
import Colors from '@/constants/Colors';

export default function LoginScreen() {
  const { login } = useAuth();
  const colorScheme = useColorScheme() ?? 'light';
  const colors = Colors[colorScheme];
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [waitingSync, setWaitingSync] = useState(false);
  const { isSyncing, lastSync, triggerSync } = useAutoSync();
  const isSyncingRef = useRef(isSyncing);
  const lastSyncRef = useRef(lastSync);

  useEffect(() => { isSyncingRef.current = isSyncing; }, [isSyncing]);
  useEffect(() => { lastSyncRef.current = lastSync; }, [lastSync]);

  const handleLogin = async () => {
    if (!email || !senha) {
      Alert.alert('Preencha email e senha');
      return;
    }
    setLoading(true);
    try {
      const ok = await login(email, senha);
      if (ok) {
        // Start/ensure a sync and wait for the initial sync to complete
        setWaitingSync(true);
        try {
          await triggerSync();
        } catch (e) {
          console.warn('triggerSync failed', e);
        }

        // Wait until we observe a completed sync or timeout (20s)
        await new Promise((resolve) => {
          const start = Date.now();
          const interval = setInterval(() => {
            if (lastSyncRef.current !== null && !isSyncingRef.current) {
              clearInterval(interval);
              resolve(null);
            } else if (Date.now() - start > 20000) {
              clearInterval(interval);
              resolve(null);
            }
          }, 250);
        });

        setWaitingSync(false);
        console.log('Login successful — initial sync awaited');
      } else {
        Alert.alert('Falha no login', 'Credenciais inválidas');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('Login error:', err);
      Alert.alert('Erro', msg);
    } finally {
      // keep loading true while waiting for sync; otherwise hide
      if (!waitingSync) setLoading(false);
      else {
        const t = setInterval(() => {
          if (!isSyncingRef.current) {
            setLoading(false);
            clearInterval(t);
          }
        }, 300);
      }
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
        <Pressable style={[styles.button, { backgroundColor: colors.primary }]} onPress={handleLogin} disabled={loading}>
          {(loading || waitingSync) ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <ActivityIndicator color={colors.background} />
              <Text style={[styles.buttonText, { color: colors.background, marginLeft: 8 }]}>{waitingSync ? 'Sincronizando...' : 'Entrando...'}</Text>
            </View>
          ) : (
            <Text style={[styles.buttonText, { color: colors.background }]}>Entrar</Text>
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
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    fontWeight: '700',
  },
});
