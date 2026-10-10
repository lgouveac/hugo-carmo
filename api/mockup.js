import sharp from 'sharp';
import { readRawBody, json } from './_lib.js';
import { ROOMS, TEMPLATES, GARMENTS, COLORS, fileOf, partOf, composite, renderShirt, shirtDefaults } from './_provador.js';

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
    // blusa: peça + cor + posição/tamanho da estampa (vindos do editor) entram no nome → cada criação é única
    let variant = tipo === 'ambiente' ? `ambiente-${room}` : tipo, shirt = null;
    if (tipo === 'blusa') {
      const g = String(body.garment || 'camiseta'), cor = String(body.color || 'branco');
      if (!GARMENTS[g] || !COLORS[cor]) return json(res, 400, { error: 'Peça ou cor inválida' });
      const n = (v, lo, hi) => (v === undefined || v === null || v === '' || !Number.isFinite(+v)) ? null : Math.min(hi, Math.max(lo, Math.round(+v)));
      shirt = { g, cor, cx: n(body.cx, 0, 1024), cy: n(body.cy, 0, 1024), w: n(body.w, 40, 2400), mode: body.mode === 'cheia' ? 'cheia' : 'peito' };
      if (shirt.cx !== null && shirt.cy !== null && shirt.w !== null) variant = `blusa-${g}-${cor}-${shirt.cx}-${shirt.cy}-${shirt.w}`;
    }

    const base = `${SUPA}/storage/v1/object/public/photos`;
    const save = async (file, out) => {
      const up = await fetch(`${SUPA}/storage/v1/object/photos/${file}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, apikey: KEY, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
        body: out,
      });
      if (!up.ok) { const t = await up.text(); return json(res, 502, { error: 'Falha ao salvar mockup: ' + t.slice(0, 200) }); }
      return json(res, 200, { url: `${base}/${file}`, cached: false });
    };
    const slug = path.replace(/\.[a-z0-9]+$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const outName = `mockups-v2/${slug}__${variant}.jpg`;
    const outUrl = `${base}/${outName}`;

    if (variant !== 'blusa') { // blusa sem posição só sabe o nome depois de calcular o padrão
      const cached = await fetch(outUrl, { method: 'HEAD' });
      if (cached.ok) return json(res, 200, { url: outUrl, cached: true });
    }

    const src = await fetch(`${base}/${path}`);
    if (!src.ok) return json(res, 404, { error: 'Foto não encontrada no acervo' });
    const srcBuf = Buffer.from(await src.arrayBuffer());

    if (shirt) {
      const name = `peca-${shirt.g}`;
      const parts = await Promise.all(['mask', 'shade', 'shadow'].map(k => fetch(`${base}/${partOf(name, k)}`).then(r => r.ok ? r.arrayBuffer() : null)));
      if (parts.some(p => !p)) return json(res, 503, { error: 'Peça ainda não disponível' });
      const [mask, shade, shadow] = parts.map(p => Buffer.from(p));
      let { cx, cy, w } = shirt;
      if (cx === null || cy === null || w === null) { // sem posição → padrão (peito/cheia)
        const { data: A, info } = await sharp(mask).extractChannel(3).raw().toBuffer({ resolveWithObject: true });
        const m = await sharp(srcBuf).rotate().metadata();
        const asp = (m.orientation || 1) >= 5 ? m.height / m.width : m.width / m.height;
        ({ cx, cy, w } = shirtDefaults(A, info.width, info.height, shirt.mode, asp));
        variant = `blusa-${shirt.g}-${shirt.cor}-${cx}-${cy}-${w}`;
        const hit = await fetch(`${base}/mockups-v2/${slug}__${variant}.jpg`, { method: 'HEAD' });
        if (hit.ok) return json(res, 200, { url: `${base}/mockups-v2/${slug}__${variant}.jpg`, cached: true });
      }
      const out = await renderShirt({ mask, shade, shadow, photo: srcBuf, color: COLORS[shirt.cor], cx, cy, w });
      return save(`mockups-v2/${slug}__${variant}.jpg`, out);
    }

    // cenário horizontal ou vertical conforme a foto (a prancha é sempre vertical)
    const meta = await sharp(srcBuf).rotate().metadata();
    const [w, h] = (meta.orientation || 1) >= 5 ? [meta.height, meta.width] : [meta.width, meta.height];
    const name = tipo === 'prancha' ? 'prancha' : `${variant}-${w >= h ? 'h' : 'v'}`;
    const tpl = await fetch(`${base}/${fileOf(name)}`);
    if (!tpl.ok) return json(res, 503, { error: 'Cenário ainda não disponível' });
    const out = await composite(Buffer.from(await tpl.arrayBuffer()), srcBuf, TEMPLATES[name].kind);

    return save(outName, out);
  } catch (e) {
    return json(res, e.status || 500, { error: String(e.message || e) });
  }
}
