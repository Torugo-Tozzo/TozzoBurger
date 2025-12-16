import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import * as api from '@/services/api';
import * as SecureStore from 'expo-secure-store';

type User = {
  id?: number | string;
  nome?: string;
  email?: string;
};

type AuthContextData = {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, senha: string) => Promise<boolean>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextData | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const TOKEN_KEY = 'tozzo_token_v1';

  // Rehydrate token on mount and validate it
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const stored = await SecureStore.getItemAsync(TOKEN_KEY);
        if (stored && mounted) {
          setToken(stored);
          try {
            const me = await api.getMe(stored);
            if (me && mounted) setUser(me);
          } catch (err) {
            // token invalid or request failed -> clear
            console.warn('Stored token invalid, clearing', err);
            await SecureStore.deleteItemAsync(TOKEN_KEY);
            if (mounted) {
              setToken(null);
              setUser(null);
            }
          }
        }
      } catch (err) {
        console.warn('Failed to load token from SecureStore', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const login = async (email: string, senha: string) => {
    setLoading(true);
    try {
      const body = await api.login(email, senha);
      // Expect the API to return an object that includes a token string.
      // Common keys: token, accessToken. Try both.
      const t = body?.token ?? body?.accessToken ?? body?.access_token ?? null;
      if (!t) return false;
      setToken(t);
      try {
        await SecureStore.setItemAsync(TOKEN_KEY, t);
      } catch (err) {
        console.warn('Failed to persist token to SecureStore', err);
      }

      // Fetch user profile
      try {
        const me = await api.getMe(t);
        setUser(me || null);
      } catch (err) {
        // ignore profile fetch errors but keep token
        console.warn('Failed to fetch /usuarios/me', err);
      }

      return true;
    } catch (err) {
      console.warn('Login failed', err);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    SecureStore.deleteItemAsync(TOKEN_KEY).catch((err) => console.warn('Failed to delete token', err));
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export default AuthContext;
