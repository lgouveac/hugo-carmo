import { env, makeToken, readRawBody, json, safeEqual } from './_lib.js';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido' });
  try {
    const { pass } = env();
    const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const raw = await readRawBody(req);
    let body = {};
    try { body = raw.length ? JSON.parse(raw.toString()) : {}; } catch { return json(res, 400, { error: 'JSON inválido' }); }

    const okPass = safeEqual(body.password || '', pass);
    // Email só é exigido se ADMIN_EMAIL estiver configurado.
    const okEmail = !adminEmail || (String(body.email || '').trim().toLowerCase() === adminEmail);
    if (!okPass || !okEmail) return json(res, 401, { error: 'Email ou senha incorretos' });

    return json(res, 200, { token: makeToken() });
  } catch (e) {
    return json(res, e.status || 500, { error: e.message });
  }
}
