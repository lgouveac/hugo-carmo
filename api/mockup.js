import sharp from 'sharp';
import { readRawBody, json } from './_lib.js';
import { ROOMS, TEMPLATES, fileOf, composite } from './_provador.js';

export const config = { api: { bodyParser: false }, maxDuration: 60 };

// Provador: cola a foto ORIGINAL do acervo num cenário pronto (gerado uma vez com IA em /api/template).
// A obra não passa pela IA — fica idêntica. Resultado em cache permanente no Supabase.
const TIPOS = ['blusa', 'print', 'bandeira', 'prancha', 'ambiente'];

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido' });
  try {
    const SUPA = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
    const KEY = process.env.SUPABASE_SERVICE_ROLE;
    if (!SUPA || !KEY) return json(res, 500, { error: 'Config Supabase faltando' });

    let body = {};
    try { const raw = await readRawBody(req); body = raw.length ? JSON.parse(raw.toString()) : {}; } catch { return json(res, 400, { error: 'JSON inválido' }); }
    const tipo = String(body.tipo || '');
    const path = String(body.path || '');
    const room = String(body.room || 'sala');
    if (!TIPOS.includes(tipo)) return json(res, 400, { error: 'Tipo inválido' });
    if (tipo === 'ambiente' && !ROOMS[room]) return json(res, 400, { error: 'Cômodo inválido' });
    if (!/^[a-z0-9._-]+\.(jpe?g|png|webp)$/i.test(path)) return json(res, 400, { error: 'Foto inválida' });
    const variant = tipo === 'ambiente' ? `ambiente-${room}` : tipo;

    const base = `${SUPA}/storage/v1/object/public/photos`;
    const slug = path.replace(/\.[a-z0-9]+$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const outName = `mockups-v2/${slug}__${variant}.jpg`;
    const outUrl = `${base}/${outName}`;

    const cached = await fetch(outUrl, { method: 'HEAD' });
    if (cached.ok) return json(res, 200, { url: outUrl, cached: true });

    const src = await fetch(`${base}/${path}`);
    if (!src.ok) return json(res, 404, { error: 'Foto não encontrada no acervo' });
    const srcBuf = Buffer.from(await src.arrayBuffer());

    // cenário horizontal ou vertical conforme a foto (a prancha é sempre vertical)
    const meta = await sharp(srcBuf).rotate().metadata();
    const [w, h] = (meta.orientation || 1) >= 5 ? [meta.height, meta.width] : [meta.width, meta.height];
    const name = tipo === 'prancha' ? 'prancha' : `${variant}-${w >= h ? 'h' : 'v'}`;
    const tpl = await fetch(`${base}/${fileOf(name)}`);
    if (!tpl.ok) return json(res, 503, { error: 'Cenário ainda não disponível' });
    const out = await composite(Buffer.from(await tpl.arrayBuffer()), srcBuf, TEMPLATES[name].kind);

    const up = await fetch(`${SUPA}/storage/v1/object/photos/${outName}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, apikey: KEY, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
      body: out,
    });
    if (!up.ok) { const t = await up.text(); return json(res, 502, { error: 'Falha ao salvar mockup: ' + t.slice(0, 200) }); }
    return json(res, 200, { url: outUrl, cached: false });
  } catch (e) {
    return json(res, e.status || 500, { error: String(e.message || e) });
  }
}
