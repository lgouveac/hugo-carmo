import { env, requireAuth, readRawBody, json } from './_lib.js';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido' });
  try {
    requireAuth(req);
    const { url, key } = env();
    const raw = await readRawBody(req);
    let path;
    try { ({ path } = JSON.parse(raw.toString() || '{}')); } catch { return json(res, 400, { error: 'JSON inválido' }); }
    if (!path || typeof path !== 'string' || path.includes('/') || path === 'content.json') {
      return json(res, 400, { error: 'Caminho inválido' });
    }
    const del = await fetch(`${url}/storage/v1/object/photos/${encodeURIComponent(path)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${key}`, apikey: key },
    });
    // 200 = removido, 404 = já não existia — ambos OK para o cliente.
    if (!del.ok && del.status !== 404) { const t = await del.text(); return json(res, 502, { error: 'Falha ao apagar: ' + t }); }
    return json(res, 200, { ok: true });
  } catch (e) {
    return json(res, e.status || 500, { error: e.message });
  }
}
