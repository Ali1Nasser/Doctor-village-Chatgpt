import { api } from './api.js';
import { json, secureHeaders } from './utils.js';
export default { async fetch(req, env) { try { const path = new URL(req.url).pathname; const res = path.startsWith('/api/') ? await api(req, env, path) : await env.ASSETS.fetch(req); return secureHeaders(res); } catch (e) { console.error(e); return secureHeaders(json({ error: 'حصل خطأ غير متوقع. حاول مرة تانية.' }, 500)); } } };
