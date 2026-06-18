import { env, requireAuth, readRawBody, json } from './_lib.js';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido' });
  try {
    requireAuth(req);
    const { url, key } = env();
    const raw = await readRawBody(req);
    let content;
    try { content = JSON.parse(raw.toString()); } catch { return json(res, 400, { error: 'JSON inválido' }); }
    if (!content || typeof content !== 'object' || !Array.isArray(content.photos) || !Array.isArray(content.products)) {
      return json(res, 400, { error: 'Estrutura de conteúdo inválida' });
    }
    content.version = (Number(content.version) || 0) + 1;
    content.updated_at = new Date().toISOString();

    const up = await fetch(`${url}/storage/v1/object/photos/content.json`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`, apikey: key,
        'Content-Type': 'application/json', 'x-upsert': 'true', 'Cache-Control': 'no-cache, max-age=0',
      },
      body: JSON.stringify(content),
    });
    if (!up.ok) { const t = await up.text(); return json(res, 502, { error: 'Falha ao salvar no Supabase: ' + t }); }
    return json(res, 200, { ok: true, version: content.version });
  } catch (e) {
    return json(res, e.status || 500, { error: e.message });
  }
}
