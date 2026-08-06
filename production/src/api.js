import { json, body, cleanPhone, token, hash, cookieToken, uid, now } from './utils.js';
import { currentUser, requireRole, audit } from './auth.js';
import { totals } from './finance.js';
export async function api(req, env, path) {
  if (req.method === 'GET' && path === '/api/health') return json({ ok: true, environment: env.APP_ENV || 'unknown', time: now() });
  if (req.method === 'POST' && path === '/api/auth/login') {
    const b = await body(req), phone = cleanPhone(b.phone);
    if ((env.APP_ENV || 'demo') !== 'demo' || String(b.code) !== '123456') return json({ error: 'التفعيل الحقيقي سيُربط قبل إدخال بيانات الملاك' }, 401);
    const user = await env.DB.prepare('SELECT * FROM users WHERE phone=? AND active=1').bind(phone).first();
    if (!user) return json({ error: 'رقم الموبايل غير موجود' }, 401);
    const raw = token(), hours = Math.min(168, Math.max(1, Number(env.SESSION_HOURS || 24)));
    await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,datetime('now','+'||?||' hours'),datetime('now'))").bind(await hash(raw, env.SESSION_PEPPER || ''), user.id, String(hours)).run();
    await audit(env, user, 'login', 'session');
    return json({ ok: true }, 200, { 'set-cookie': `qa_session=${raw}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${hours * 3600}` });
  }
  if (req.method === 'POST' && path === '/api/auth/logout') {
    const raw = cookieToken(req); if (raw) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hash(raw, env.SESSION_PEPPER || '')).run();
    return json({ ok: true }, 200, { 'set-cookie': 'qa_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0' });
  }
  const user = await currentUser(req, env); if (!user) return json({ error: 'لازم تسجل دخول الأول' }, 401);
  if (req.method === 'GET' && path === '/api/me') return json({ id: user.id, name: user.name_ar, role: user.role, phone: user.phone.replace(/(\d{3})\d+(\d{2})/, '$1••••••$2') });
  if (req.method === 'GET' && path === '/api/dashboard') {
    const units = (await env.DB.prepare('SELECT id,building_no,unit_no,annual_due_piastres FROM units WHERE owner_id=? ORDER BY building_no,unit_no').bind(user.id).all()).results;
    const announcements = (await env.DB.prepare('SELECT id,title_ar,body_ar,pinned,created_at FROM announcements WHERE published=1 ORDER BY pinned DESC,created_at DESC LIMIT 5').all()).results;
    return json({ ...(await totals(env)), units, myDue: units.reduce((s, x) => s + x.annual_due_piastres, 0), announcements });
  }
  if (req.method === 'GET' && path === '/api/payments') {
    let q = 'SELECT p.*,c.name_ar category_name,un.building_no,un.unit_no FROM payments p JOIN payment_categories c ON c.id=p.category_id JOIN units un ON un.id=p.unit_id', args = [];
    if (user.role === 'owner') { q += ' WHERE un.owner_id=?'; args = [user.id]; }
    q += ' ORDER BY p.created_at DESC LIMIT 100'; return json((await env.DB.prepare(q).bind(...args).all()).results);
  }
  if (req.method === 'POST' && path === '/api/payments') {
    const b = await body(req); if (!Number.isInteger(b.amountPiastres) || b.amountPiastres <= 0) return json({ error: 'المبلغ غير صحيح' }, 400);
    const unit = await env.DB.prepare('SELECT * FROM units WHERE id=?').bind(b.unitId).first(); if (!unit || (user.role === 'owner' && unit.owner_id !== user.id)) return json({ error: 'الوحدة غير مسموحة' }, 403);
    if (b.receiptData && (!String(b.receiptData).startsWith('data:image/') || String(b.receiptData).length > 250000)) return json({ error: 'صورة الإيصال غير مقبولة أو كبيرة' }, 400);
    const id = uid('PAY'); await env.DB.prepare('INSERT INTO payments(id,unit_id,category_id,amount_piastres,method,transfer_date,reference_no,note_ar,receipt_data,status,submitted_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,b.unitId,b.categoryId,b.amountPiastres,String(b.method||''),b.transferDate||now().slice(0,10),b.referenceNo||null,b.noteAr||null,b.receiptData||null,'submitted',user.id,now()).run();
    await audit(env,user,'payment_submit','payment',id,{amount:b.amountPiastres}); return json({id},201);
  }
  if (req.method === 'GET' && path === '/api/finance') return json({ ...(await totals(env)), expenses: (await env.DB.prepare("SELECT id,title_ar,amount_piastres,expense_date FROM expenses WHERE status='approved' ORDER BY expense_date DESC LIMIT 50").all()).results });
  if (req.method === 'GET' && path === '/api/announcements') return json((await env.DB.prepare('SELECT * FROM announcements WHERE published=1 ORDER BY pinned DESC,created_at DESC').all()).results);
  if (req.method === 'GET' && path === '/api/admin/review') { const denied=requireRole(user,['admin','operator','auditor']); if(denied)return denied; return json((await env.DB.prepare("SELECT p.*,us.name_ar owner_name,un.building_no,un.unit_no FROM payments p JOIN units un ON un.id=p.unit_id JOIN users us ON us.id=un.owner_id WHERE p.status IN('submitted','in_review','needs_info') ORDER BY p.created_at").all()).results); }
  const match = path.match(/^\/api\/admin\/payments\/([^/]+)$/);
  if (req.method === 'POST' && match) {
    const denied=requireRole(user,['admin','auditor']); if(denied)return denied; const b=await body(req), pay=await env.DB.prepare('SELECT p.*,c.kind FROM payments p JOIN payment_categories c ON c.id=p.category_id WHERE p.id=?').bind(match[1]).first();
    if(!pay)return json({error:'الإيصال غير موجود'},404); if(pay.submitted_by===user.id)return json({error:'لا يمكن اعتماد إيصال رفعته بنفسك'},409); if(!['approved','rejected','needs_info'].includes(b.status))return json({error:'الحالة غير صحيحة'},400); if(b.status!=='approved'&&!String(b.reason||'').trim())return json({error:'سبب القرار مطلوب'},400);
    await env.DB.prepare('UPDATE payments SET status=?,reviewed_by=?,review_reason=?,reviewed_at=? WHERE id=?').bind(b.status,user.id,b.reason||null,now(),pay.id).run();
    if(b.status==='approved'){const fund=pay.kind==='deposit'?'deposit':'operating',account=pay.kind==='deposit'?'deposits_held':'income';await env.DB.prepare('INSERT INTO ledger_entries(id,source_type,source_id,account,amount_piastres,fund,created_at) VALUES(?,?,?,?,?,?,?)').bind(uid('LED'),'payment',pay.id,account,pay.amount_piastres,fund,now()).run();}
    await audit(env,user,'payment_review','payment',pay.id,{status:b.status,reason:b.reason||null}); return json({ok:true});
  }
  if (req.method === 'POST' && path === '/api/admin/announcements') { const denied=requireRole(user,['admin','operator']); if(denied)return denied; const b=await body(req); if(!String(b.title||'').trim()||!String(b.body||'').trim())return json({error:'العنوان والتفاصيل مطلوبان'},400); const id=uid('ANN'); await env.DB.prepare('INSERT INTO announcements(id,title_ar,body_ar,pinned,published,created_by,created_at) VALUES(?,?,?,0,1,?,?)').bind(id,String(b.title).trim(),String(b.body).trim(),user.id,now()).run(); await audit(env,user,'announcement_create','announcement',id); return json({id},201); }
  return json({ error: 'المسار غير موجود' }, 404);
}
