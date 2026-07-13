// Fallback = produção. Para dev/homolog, defina EXPO_PUBLIC_API_URL no .env (ver .env.example).
export const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://api.tozzo.uk';

async function handleJsonResponse(res: Response) {
  const txt = await res.text();
  try {
    return txt ? JSON.parse(txt) : {};
  } catch (err) {
    return txt;
  }
}

export async function login(email: string, senha: string) {
  const url = `${BASE_URL}/auth/login`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email, senha }),
    });

    if (!res.ok) {
      const errBody = await handleJsonResponse(res).catch(() => null);
      const message = (errBody && (errBody.message || JSON.stringify(errBody))) || `HTTP ${res.status}`;
      console.error('API login error:', url, message);
      throw new Error(message);
    }

    return handleJsonResponse(res);
  } catch (err: any) {
    console.error('Network/login request failed', url, err?.message ?? err);
    throw err;
  }
}

export async function getMe(token: string) {
  const url = `${BASE_URL}/usuarios/me`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });

    if (!res.ok) {
      const errBody = await handleJsonResponse(res).catch(() => null);
      const message = (errBody && (errBody.message || JSON.stringify(errBody))) || `HTTP ${res.status}`;
      console.error('API getMe error:', url, message);
      throw new Error(message);
    }

    return handleJsonResponse(res);
  } catch (err: any) {
    console.error('Network/getMe request failed', url, err?.message ?? err);
    throw err;
  }
}

export async function sincronizar(token: string, payload: any) {
  const url = `${BASE_URL}/sincronizacao/push`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Accept: 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errBody = await handleJsonResponse(res).catch(() => null);
      const message = (errBody && (errBody.message || JSON.stringify(errBody))) || `HTTP ${res.status}`;
      console.error('API sincronizar error:', url, message);
      throw new Error(message);
    }

    return handleJsonResponse(res);
  } catch (err: any) {
    console.error('Network/sincronizar request failed', url, err?.message ?? err);
    throw err;
  }
}

export async function getChanges(token: string, since?: string | null) {
  let url = `${BASE_URL}/sincronizacao/pull`;
  if (since) {
    const q = encodeURIComponent(String(since));
    url = `${url}?since=${q}`;
  }
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });

    if (!res.ok) {
      const errBody = await handleJsonResponse(res).catch(() => null);
      const message = (errBody && (errBody.message || JSON.stringify(errBody))) || `HTTP ${res.status}`;
      console.error('API getChanges error:', url, message);
      throw new Error(message);
    }

    return handleJsonResponse(res);
  } catch (err: any) {
    console.error('Network/getChanges request failed', url, err?.message ?? err);
    throw err;
  }
}
