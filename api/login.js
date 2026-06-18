import { env, makeToken, readRawBody, json, safeEqual } from './_lib.js';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido' });
  try {
    const { pass } = env();
    const raw = await readRawBody(req);
    let body = {};
    try { body = raw.length ? JSON.parse(raw.toString()) : {}; } catch { return json(res, 400, { error: 'JSON inválido' }); }
    if (!safeEqual(body.password || '', pass)) return json(res, 401, { error: 'Senha incorreta' });
    return json(res, 200, { token: makeToken() });
  } catch (e) {
    return json(res, e.status || 500, { error: e.message });
  }
}
