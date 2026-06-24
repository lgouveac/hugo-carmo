import { readRawBody, json } from './_lib.js';

export const config = { api: { bodyParser: false } };

// Salva inscritos da newsletter em um bucket PRIVADO do Supabase (não exposto publicamente).
export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido' });
  try {
    const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
    const key = process.env.SUPABASE_SERVICE_ROLE;
    if (!url || !key) return json(res, 500, { error: 'Configuração faltando (SUPABASE_URL/SERVICE_ROLE)' });

    const raw = await readRawBody(req);
    let body = {};
    try { body = JSON.parse(raw.toString() || '{}'); } catch { return json(res, 400, { error: 'JSON inválido' }); }
    const email = String(body.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 120) return json(res, 400, { error: 'E-mail inválido' });

    const obj = `${url}/storage/v1/object/private/subscribers.json`;
    const auth = { Authorization: `Bearer ${key}`, apikey: key };

    let list = [];
    const g = await fetch(obj, { headers: auth });
    if (g.ok) { try { const j = JSON.parse(await g.text()); if (Array.isArray(j)) list = j; } catch {} }

    if (list.some(s => s.email === email)) return json(res, 200, { ok: true, already: true });
    list.push({ email, lang: body.lang === 'en' ? 'en' : 'pt', date: new Date().toISOString() });

    const up = await fetch(obj, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json', 'x-upsert': 'true', 'Cache-Control': 'no-cache' },
      body: JSON.stringify(list),
    });
    if (!up.ok) { const t = await up.text(); return json(res, 502, { error: 'Falha ao salvar: ' + t }); }
    return json(res, 200, { ok: true, count: list.length });
  } catch (e) {
    return json(res, e.status || 500, { error: e.message });
  }
}
