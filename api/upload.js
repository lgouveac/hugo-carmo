import { env, requireAuth, readRawBody, json, crypto } from './_lib.js';

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido' });
  try {
    requireAuth(req);
    const { url, key } = env();
    const ct = (req.headers['content-type'] || '').split(';')[0].trim();
    if (!/^image\/(jpeg|png|webp)$/.test(ct)) return json(res, 400, { error: 'Tipo não permitido (use JPG, PNG ou WEBP)' });
    const raw = await readRawBody(req);
    if (!raw.length) return json(res, 400, { error: 'Arquivo vazio' });
    if (raw.length > 15 * 1024 * 1024) return json(res, 413, { error: 'Imagem muito grande (máx. 15MB)' });

    const ext = ct === 'image/png' ? 'png' : ct === 'image/webp' ? 'webp' : 'jpg';
    const base = (req.headers['x-filename'] || 'foto').toString().toLowerCase()
      .normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'foto';
    const name = `up-${base}-${crypto.randomBytes(4).toString('hex')}.${ext}`;

    const up = await fetch(`${url}/storage/v1/object/photos/${name}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': ct, 'x-upsert': 'true' },
      body: raw,
    });
    if (!up.ok) { const t = await up.text(); return json(res, 502, { error: 'Upload falhou: ' + t }); }
    return json(res, 200, { path: name, url: `${url}/storage/v1/object/public/photos/${name}` });
  } catch (e) {
    return json(res, e.status || 500, { error: e.message });
  }
}
