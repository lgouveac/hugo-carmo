// GET /api/template            → lista os cenários do Provador
// GET /api/template?name=<n>   → gera o cenário com IA se ainda não existir (nunca sobrescreve;
//                                pra refazer, sobe o `v` dele em _provador.js) e devolve a caixa detectada.
import { json } from './_lib.js';
import { TEMPLATES, fileOf, partOf, detect, garmentAssets } from './_provador.js';

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  const name = String((req.query && req.query.name) || '');
  if (!name) return json(res, 200, { templates: Object.keys(TEMPLATES) });
  const t = TEMPLATES[name];
  if (!t) return json(res, 400, { error: 'Cenário desconhecido' });
  try {
    const SUPA = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
    const KEY = process.env.SUPABASE_SERVICE_ROLE;
    const OAI = process.env.OPENAI_API_KEY;
    if (!SUPA || !KEY || !OAI) return json(res, 500, { error: 'Config faltando' });
    const url = `${SUPA}/storage/v1/object/public/photos/${fileOf(name)}`;

    let buf, created = false;
    const ex = await fetch(url);
    if (ex.ok) buf = Buffer.from(await ex.arrayBuffer());
    else {
      const ai = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST', headers: { Authorization: `Bearer ${OAI}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-image-1', prompt: t.prompt, size: t.size, quality: 'high', n: 1 }),
      });
      const aij = await ai.json().catch(() => ({}));
      if (!ai.ok) return json(res, 502, { error: 'IA falhou: ' + (aij?.error?.message || ai.status) });
      buf = Buffer.from(aij.data[0].b64_json, 'base64');
      const up = await fetch(`${SUPA}/storage/v1/object/photos/${fileOf(name)}`, {
        method: 'POST', headers: { Authorization: `Bearer ${KEY}`, apikey: KEY, 'Content-Type': 'image/png' }, body: buf,
      });
      if (!up.ok) return json(res, 502, { error: 'Falha ao salvar: ' + (await up.text()).slice(0, 200) });
      created = true;
    }
    const put = (file, body) => fetch(`${SUPA}/storage/v1/object/photos/${file}`, {
      method: 'POST', headers: { Authorization: `Bearer ${KEY}`, apikey: KEY, 'Content-Type': 'image/png', 'x-upsert': 'true' }, body,
    });
    if (t.kind === 'garment') { // peça lisa → máscara, dobras e sombra (pro editor e pro render)
      const pub = `${SUPA}/storage/v1/object/public/photos/`;
      if (created || !(await fetch(pub + partOf(name, 'mask'), { method: 'HEAD' })).ok) {
        const g = await garmentAssets(buf);
        await Promise.all(['mask', 'shade', 'shadow'].map(k => put(partOf(name, k), g[k])));
      }
      return json(res, 200, { name, url, created, parts: ['mask', 'shade', 'shadow'].map(k => pub + partOf(name, k)) });
    }
    let det = null;
    try { const d = await detect(buf); det = { box: d.box, fill: +d.fill.toFixed(3), ratio: +(d.box.w / d.box.h).toFixed(2) }; }
    catch (e) { det = { error: e.message }; }
    return json(res, 200, { name, url, created, ...det });
  } catch (e) {
    return json(res, 500, { error: String(e.message || e) });
  }
}
