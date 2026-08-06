const enc = new TextEncoder();
export const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
export const now = () => new Date().toISOString();
export const uid = p => `${p}-${crypto.randomUUID()}`;
export const cleanPhone = v => String(v || '').replace(/\D/g, '');
export const body = async req => { try { return await req.json(); } catch { return {}; } };
export const token = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const hash = async (value, pepper = '') => {
  const out = await crypto.subtle.digest('SHA-256', enc.encode(value + pepper));
  return btoa(String.fromCharCode(...new Uint8Array(out))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
export const cookieToken = req => /(?:^|;\s*)qa_session=([^;]+)/.exec(req.headers.get('cookie') || '')?.[1] || null;
export const secureHeaders = res => {
  const h = new Headers(res.headers);
  h.set('x-content-type-options', 'nosniff'); h.set('referrer-policy', 'same-origin');
  h.set('permissions-policy', 'camera=(),microphone=(),geolocation=()');
  h.set('content-security-policy', "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
};
