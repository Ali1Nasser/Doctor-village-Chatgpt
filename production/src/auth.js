import { hash, cookieToken, json, now } from './utils.js';
export async function currentUser(req, env) {
  const t = cookieToken(req); if (!t) return null;
  return env.DB.prepare(`SELECT u.id,u.phone,u.name_ar,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>datetime('now') AND u.active=1`).bind(await hash(t, env.SESSION_PEPPER || '')).first();
}
export function requireRole(user, roles) {
  if (!user) return json({ error: 'لازم تسجل دخول الأول' }, 401);
  if (!roles.includes(user.role)) return json({ error: 'مش مسموح لك تعمل العملية دي' }, 403);
  return null;
}
export async function audit(env, user, action, entityType, entityId = null, details = {}) {
  await env.DB.prepare('INSERT INTO audit_log(actor_id,action,entity_type,entity_id,details_json,created_at) VALUES(?,?,?,?,?,?)').bind(user?.id || null, action, entityType, entityId, JSON.stringify(details), now()).run();
}
