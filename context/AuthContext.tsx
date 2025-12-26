import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import * as api from '@/services/api';
import * as SecureStore from 'expo-secure-store';
import { useSQLiteContext } from 'expo-sqlite';
import { seedTipoProduto } from '@/database/initializeDatabase';
import { sincronizarComServidor } from '@/database/useSyncDatabase';
import { runWithLock } from '@/database/syncGuard';

type User = {
  id?: number | string;
  nome?: string;
  email?: string;
  estabelecimentoId?: number | string | null;
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
  const database = useSQLiteContext()
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
            if (me && mounted) {
              setUser(me);
              try {
                const schema = await database.getFirstAsync<{ usuarioId?: number | null }>(`SELECT usuarioId FROM TB_SCHEMA LIMIT 1`).catch(() => null);
                const usuarioId = schema && typeof schema.usuarioId !== 'undefined' ? schema.usuarioId : null;
                if (!usuarioId) {
                      const uid = Number((me as any).id);
                      if (!isNaN(uid)) {
                        await database.execAsync(`UPDATE TB_SCHEMA SET usuarioId = ${uid};`);
                      } else {
                        await database.execAsync(`UPDATE TB_SCHEMA SET usuarioId = NULL;`);
                      }
                }
              } catch (err) {
                console.warn('Failed to run seedProdutosPadrao after rehydrate', err);
              }
            }
          } catch (err: any) {
            // Only clear token on explicit auth errors (401/402/403).
            // For network/server errors (offline) keep the stored token.
            const status = err?.response?.status ?? err?.status ?? null;
            if (status === 401 || status === 402 || status === 403) {
              console.warn('Stored token invalid, clearing', err);
              await SecureStore.deleteItemAsync(TOKEN_KEY);
              if (mounted) {
                setToken(null);
                setUser(null);
              }
            } else {
              console.warn('Network/server error validating token — keeping stored token', err);
              try {
                const prev = await database.getFirstAsync<{ 
                  id?: number; 
                  nome?: string; 
                  email?: string; 
                  estabelecimentoId?: number | string; nomeEstabelecimento?: string 
                }>(`SELECT id, nome, email, estabelecimentoId, nomeEstabelecimento FROM TB_USUARIO LIMIT 1`).catch(() => null);
                if (prev && mounted) {
                  setUser({
                    id: prev.id,
                    nome: prev.nome,
                    email: prev.email,
                    estabelecimentoId: prev.estabelecimentoId,
                  });
                }
              } catch (e) {
                console.warn('Failed to load local TB_USUARIO after network error', e);
              }
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

        // Destructive swap logic:
        // - If no previous user in TB_USUARIO => insert current user (same as before)
        // - If previous user exists and estabelecimentoId differs => delete product-related tables and replace user
        // - If previous user exists and estabelecimentoId equals => replace only the user record
        const esc = (v: any) => (v === null || typeof v === 'undefined' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);

        try {
          const prev = await database.getFirstAsync<{ id?: number; email?: string; estabelecimentoId?: string }>(`SELECT id, email, estabelecimentoId FROM TB_USUARIO LIMIT 1`).catch(() => null);
          const meId = (me as any)?.id;
          const meEmail = (me as any)?.email ?? null;
          const meEstab = (me as any)?.estabelecimentoId ?? null;

          if (!prev) {
            // no previous user -> insert current
            await database.execAsync('DELETE FROM TB_USUARIO;');
            await database.execAsync(`INSERT INTO TB_USUARIO (nome, email, estabelecimentoId, nomeEstabelecimento) VALUES (${esc((me as any)?.nome)}, ${esc(meEmail)}, ${esc(meEstab)}, ${esc((me as any)?.nomeEstabelecimento)});`);
            await database.execAsync(`UPDATE TB_SCHEMA SET usuarioId = ${isNaN(Number(meId)) ? 'NULL' : Number(meId)}, estabelecimentoId = ${esc(meEstab)};`).catch(() => {});
            // seed default types for all users
            await seedTipoProduto(database).catch(() => {});
          } else {
            if (String(prev.estabelecimentoId) !== String(meEstab)) {
              // destructive: clear product-related tables and replace user
              try {
                await database.execAsync('BEGIN;');
                const deletes = [
                  'DELETE FROM RL_VENDA_PRODUTO;',
                  'DELETE FROM RL_PEDIDO_PRODUTO;',
                  'DELETE FROM TB_PRODUTOS;',
                  'DELETE FROM TB_TP_PRODUTO;',
                  'DELETE FROM TB_VENDAS;',
                  'DELETE FROM TB_PEDIDOS;',
                  'DELETE FROM TB_IMPRESSORAS;'
                ];
                for (const d of deletes) {
                  await database.execAsync(d).catch(() => {});
                }
                await database.execAsync('DELETE FROM TB_USUARIO;').catch(() => {});
                await database.execAsync(`INSERT INTO TB_USUARIO (nome, email, estabelecimentoId, nomeEstabelecimento) VALUES (${esc((me as any)?.nome)}, ${esc(meEmail)}, ${esc(meEstab)}, ${esc((me as any)?.nomeEstabelecimento)});`).catch(() => {});
                await database.execAsync(`UPDATE TB_SCHEMA SET usuarioId = ${isNaN(Number(meId)) ? 'NULL' : Number(meId)}, estabelecimentoId = ${esc(meEstab)};`).catch(() => {});
                await database.execAsync('COMMIT;');
              } catch (err) {
                await database.execAsync('ROLLBACK;').catch(() => {});
                console.warn('Failed during destructive swap; rolled back', err);
              }

                // reseed default types for all users
                await seedTipoProduto(database).catch(() => {});
            } else {
              // same estabelecimento: replace only user
              await database.execAsync('DELETE FROM TB_USUARIO;').catch(() => {});
              await database.execAsync(`INSERT INTO TB_USUARIO (nome, email, estabelecimentoId, nomeEstabelecimento) VALUES (${esc((me as any)?.nome)}, ${esc(meEmail)}, ${esc(meEstab)}, ${esc((me as any)?.nomeEstabelecimento)});`).catch(() => {});
              await database.execAsync(`UPDATE TB_SCHEMA SET usuarioId = ${isNaN(Number(meId)) ? 'NULL' : Number(meId)};`).catch(() => {});
            }
          }
        } catch (err) {
          console.warn('Failed to check/replace TB_USUARIO on login', err);
        }
        // After user and local DB have been updated, synchronize with server
        try {
          if (t) {
            const res = await runWithLock(() => sincronizarComServidor(database, t)).catch((e) => {
              console.warn('sync after login failed', e);
              return null;
            });
            if (res === null) {
              console.log('[sync] skipped login-triggered sync; another sync is in progress');
            }
          }
        } catch (err) {
          console.warn('Synchronization after login failed', err);
        }
        
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
