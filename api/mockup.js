import { readRawBody, json } from './_lib.js';

export const config = { api: { bodyParser: false }, maxDuration: 60 };

// Prompts por tipo de produto — a foto entra como "image" (base) e vira a estampa.
const PROMPTS = {
  blusa: "Create a realistic e-commerce product photo: a plain white cotton t-shirt laid flat (flat-lay) on a soft neutral background, with the provided photograph printed as a large rectangular graphic centered on the chest. Natural studio lighting, soft shadows, the print subtly following the fabric folds. Preserve the photograph's exact content, framing and tones — do not crop or alter it.",
  print: "Create a realistic interior photo: the provided photograph as a framed fine-art print with a thin black frame and white mat, hanging on a clean light-grey living-room wall, soft natural daylight, a hint of minimalist furniture below for scale. Preserve the photograph's exact content, framing and tones — do not crop or alter it.",
  bandeira: "Create a realistic photo of the provided image printed on a rectangular fabric flag/banner, hung and gently waving outdoors with soft daylight and subtle fabric wrinkles and folds. Preserve the photograph's exact content, framing and tones — do not crop or alter it.",
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido' });
  try {
    const SUPA = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
    const KEY = process.env.SUPABASE_SERVICE_ROLE;
    const OAI = process.env.OPENAI_API_KEY;
    if (!SUPA || !KEY) return json(res, 500, { error: 'Config Supabase faltando' });
    if (!OAI) return json(res, 500, { error: 'OPENAI_API_KEY não configurada na Vercel' });

    let body = {};
    try { const raw = await readRawBody(req); body = raw.length ? JSON.parse(raw.toString()) : {}; } catch { return json(res, 400, { error: 'JSON inválido' }); }
    const tipo = String(body.tipo || '');
    const path = String(body.path || '');
    if (!PROMPTS[tipo]) return json(res, 400, { error: 'Tipo inválido (blusa, print ou bandeira)' });
    if (!/^[a-z0-9._-]+\.(jpe?g|png|webp)$/i.test(path)) return json(res, 400, { error: 'Foto inválida' });

    const base = `${SUPA}/storage/v1/object/public/photos`;
    const slug = path.replace(/\.[a-z0-9]+$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const outName = `mockups/${slug}__${tipo}.png`;
    const outUrl = `${base}/${outName}`;

    // 1) cache: se já existe, devolve na hora (custo zero)
    const cached = await fetch(outUrl, { method: 'HEAD' });
    if (cached.ok) return json(res, 200, { url: outUrl, cached: true });

    // 2) busca a foto original do acervo
    const src = await fetch(`${base}/${path}`);
    if (!src.ok) return json(res, 404, { error: 'Foto não encontrada no acervo' });
    const srcBuf = Buffer.from(await src.arrayBuffer());

    // 3) gera o mockup com OpenAI gpt-image-1 (edits = imagem + prompt)
    const form = new FormData();
    form.append('model', 'gpt-image-1');
    form.append('image', new Blob([srcBuf], { type: 'image/jpeg' }), 'foto.jpg');
    form.append('prompt', PROMPTS[tipo]);
    form.append('size', '1024x1024');
    form.append('quality', 'low');
    form.append('n', '1');
    const ai = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST', headers: { Authorization: `Bearer ${OAI}` }, body: form,
    });
    const aij = await ai.json().catch(() => ({}));
    if (!ai.ok) return json(res, 502, { error: 'IA falhou: ' + (aij?.error?.message || JSON.stringify(aij)).slice(0, 240) });
    const b64 = aij?.data?.[0]?.b64_json;
    if (!b64) return json(res, 502, { error: 'IA não retornou imagem' });
    const outBuf = Buffer.from(b64, 'base64');

    // 4) salva no Supabase (cache permanente) e devolve a URL
    const up = await fetch(`${SUPA}/storage/v1/object/photos/${outName}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, apikey: KEY, 'Content-Type': 'image/png', 'x-upsert': 'true' },
      body: outBuf,
    });
    if (!up.ok) { const t = await up.text(); return json(res, 502, { error: 'Falha ao salvar mockup: ' + t.slice(0, 200) }); }
    return json(res, 200, { url: outUrl, cached: false });
  } catch (e) {
    return json(res, e.status || 500, { error: String(e.message || e) });
  }
}
