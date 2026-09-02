import { getStoredSession, persistSession } from '../session';

async function tryRefreshToken(baseUrl) {
  const url = String(baseUrl).replace(/\/$/, '');
  const current = getStoredSession();
  const rt = current?.refreshToken;
  if (!rt) return null;
  const res = await fetch(`${url}/api/token/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: rt })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.token) return null;
  const next = { ...(current || {}), token: data.token, refreshToken: data.refresh_token || current.refreshToken };
  persistSession(next);
  return next.token;
}

export function createApi({ baseUrl, token }) {
    const url = String(baseUrl).replace(/\/$/, '');

    async function request(path, { method = 'GET', body, headers = {} } = {}) {
        const isFormData = body instanceof FormData;
        const current = getStoredSession();
        const bearer = (current?.token) || token || null;
        let opts = {
            method,
            headers: {
                ...(!isFormData && body ? { 'Content-Type': 'application/json' } : {}),
                ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
                ...headers,
            },
            ...(body ? { body: isFormData ? body : JSON.stringify(body) } : {}),
        };

        let res = await fetch(`${url}${path}`, opts);
        const text = await res.text();
        let data = {};
        try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

        if (!res.ok) {
            if (res.status === 423) {
                const msg = data?.message || data?.error || 'Acción inhabilitada por Modo Solo Lectura';
                const err = new Error(msg);
                err.status = 423;
                err.code = data?.code || 'read_only';
                err.data = data;
                throw err;
            }
            if (res.status === 401) {
                const newToken = await tryRefreshToken(url).catch(() => null);
                if (newToken) {
                    opts = { ...opts, headers: { ...opts.headers, Authorization: `Bearer ${newToken}` } };
                    res = await fetch(`${url}${path}`, opts);
                    const retryText = await res.text();
                    let retryData = {};
                    try { retryData = retryText ? JSON.parse(retryText) : {}; } catch { retryData = { raw: retryText }; }
                    if (!res.ok) {
                        const msg2 = retryData?.error || retryData?.message || `HTTP ${res.status}`;
                        const err2 = new Error(msg2);
                        err2.status = res.status;
                        err2.data = retryData;
                        throw err2;
                    }
                    return retryData;
                }
                window.dispatchEvent(new CustomEvent('spectra:session-expired'));
            }
            const msg = data?.error || data?.message || `HTTP ${res.status}`;
            const err = new Error(msg);
            err.status = res.status;
            err.data = data;
            throw err;
        }
        return data;
    }

    return {
        get: (p) => request(p),
        post: (p, b) => request(p, { method: 'POST', body: b }),
        put: (p, b) => request(p, { method: 'PUT', body: b }),
        patch: (p, b) => request(p, { method: 'PATCH', body: b }),
        del: (p, b) => request(p, { method: 'DELETE', body: b }),
        delete: (p, b) => request(p, { method: 'DELETE', body: b }),
    };
}


export async function apiFetch(apiUrl, path, { token, method = 'GET', body, params } = {}) {
  const url = new URL(apiUrl.replace(/\/$/, '') + path);

  if (params && typeof params === 'object') {
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '') return;
      url.searchParams.set(k, String(v));
    });
  }

  const headers = { Accept: 'application/json' };
  const current = getStoredSession();
  const bearer = (current?.token) || token || null;
  if (bearer) headers.Authorization = `Bearer ${bearer}`;

  let payloadBody = undefined;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payloadBody = JSON.stringify(body);
  }

  let res = await fetch(url.toString(), { method, headers, body: payloadBody });
  let data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (res.status === 423) {
      const msg = data?.message || data?.error || 'Acción inhabilitada por Modo Solo Lectura';
      const err = new Error(msg);
      err.status = 423;
      err.code = data?.code || 'read_only';
      err.data = data;
      throw err;
    }
    if (res.status === 401) {
      const newToken = await tryRefreshToken(apiUrl).catch(() => null);
      if (newToken) {
        const retryHeaders = { ...headers, Authorization: `Bearer ${newToken}` };
        res = await fetch(url.toString(), { method, headers: retryHeaders, body: payloadBody });
        data = await res.json().catch(() => ({}));
        if (res.ok) return data;
      }
      window.dispatchEvent(new CustomEvent('spectra:session-expired'));
    }
    const msg = data?.message || data?.error || data?.details?.message || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

export function resolveApiUrl() {
  if (import.meta.env.VITE_API_URL) {
      return import.meta.env.VITE_API_URL.replace(/\/$/, '');
  }
  return 'https://apispectraerp.nextboostperu.com/public';
}
