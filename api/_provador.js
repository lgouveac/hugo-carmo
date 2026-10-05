// Provador: a IA só desenha o CENÁRIO (uma vez), com um placeholder magenta liso.
// A foto do Hugo é colada depois, pixel a pixel, com sharp — a obra nunca é redesenhada.
import sharp from 'sharp';

const MAG = 'filled with a perfectly flat, uniform, solid pure magenta color (#FF00FF) — no texture, no gradient, no reflection, no glare, no shadow, no text; it is an empty placeholder';
const FRONT = 'Shot perfectly straight-on and centered, camera parallel to it, so its edges are perfectly horizontal and vertical with no perspective distortion';
export const ROOMS = {
  sala: 'a bright contemporary living room, the frame hanging above a linen sofa with a wooden coffee table and plants',
  quarto: 'a calm minimalist bedroom, the frame hanging above a bed with neutral linen bedding and two bedside lamps',
  escritorio: 'a modern home office, the frame hanging above a wooden desk with a designer chair and bookshelves',
  jantar: 'an elegant dining room, the frame hanging above a wooden dining table with chairs and a pendant light',
  hotel: 'a sophisticated hotel lobby lounge with designer furniture and warm ambient lighting, the frame on the main wall',
};
const ratio = o => (o === 'h' ? 'landscape 3:2' : 'portrait 2:3');
const frame = o => `one large picture frame (thin black frame) whose entire inner picture area has a ${ratio(o)} aspect ratio and is ${MAG}`;

// kind: como a foto entra — 'mat' (passe-partout branco), 'shirt' (estampa na cor do tecido),
// 'fabric' (bandeira), 'shape' (preenche a forma da prancha). v = versão do cenário (subir pra regerar).
export const TEMPLATES = {};
for (const o of ['h', 'v']) {
  TEMPLATES[`print-${o}`] = { v: 1, kind: 'mat', size: '1536x1024', prompt: `Photorealistic photo of a clean, softly lit light-grey gallery wall with ${frame(o)} hanging in the center, a minimalist bench below for scale. ${FRONT}. Elegant, natural daylight.` };
  for (const [r, d] of Object.entries(ROOMS))
    TEMPLATES[`ambiente-${r}-${o}`] = { v: 1, kind: 'mat', size: '1536x1024', prompt: `Photorealistic professional architectural interior photograph of ${d}. On the wall hangs ${frame(o)}. The frame faces the camera directly — ${FRONT}. Natural light, interior-design magazine quality.` };
  TEMPLATES[`blusa-${o}`] = { v: 1, kind: 'shirt', size: '1024x1024', prompt: `Photorealistic e-commerce flat-lay photo of a plain white cotton t-shirt seen from directly above, centered on a soft neutral light background. On the chest there is one printed ${ratio(o)} rectangle that is ${MAG}. The shirt lies flat and smooth. ${FRONT}. Soft studio lighting.` };
  TEMPLATES[`bandeira-${o}`] = { v: 1, kind: 'fabric', size: '1024x1024', prompt: `Photorealistic photo of one ${ratio(o)} rectangular fabric banner hanging taut and completely flat (no folds, no waves) from a thin wooden rod on a clean white wall. The entire fabric surface is ${MAG}. ${FRONT}. Soft natural daylight.` };
}
TEMPLATES.prancha = { v: 1, kind: 'shape', size: '1024x1536', prompt: `Photorealistic product photo of one surfboard standing perfectly upright on light sand at the beach, its top deck facing the camera, nose up. The entire deck surface inside the white rails is ${MAG}. ${FRONT}. Soft golden daylight, the ocean softly blurred behind.` };

export const fileOf = name => `templates/${name}.v${TEMPLATES[name].v}.png`;

// Acha o placeholder: maior região conexa de pixels magenta → caixa + máscara.
export async function detect(buf) {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, N = W * H;
  const m = new Uint8Array(N);
  for (let i = 0, p = 0; i < N; i++, p += 3) {
    const r = data[p], g = data[p + 1], b = data[p + 2];
    if (r > 150 && b > 150 && r - g > 90 && b - g > 90) m[i] = 1;
  }
  const lab = new Int32Array(N); let best = { n: 0 }, id = 0;
  const st = new Int32Array(N);
  for (let s = 0; s < N; s++) {
    if (!m[s] || lab[s]) continue;
    id++; let top = 0; st[top++] = s; lab[s] = id;
    let n = 0, x0 = W, y0 = H, x1 = 0, y1 = 0;
    while (top) {
      const k = st[--top], x = k % W, y = (k / W) | 0; n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x > 0 && m[k - 1] && !lab[k - 1]) { lab[k - 1] = id; st[top++] = k - 1; }
      if (x < W - 1 && m[k + 1] && !lab[k + 1]) { lab[k + 1] = id; st[top++] = k + 1; }
      if (y > 0 && m[k - W] && !lab[k - W]) { lab[k - W] = id; st[top++] = k - W; }
      if (y < H - 1 && m[k + W] && !lab[k + W]) { lab[k + W] = id; st[top++] = k + W; }
    }
    if (n > best.n) best = { n, id, x0, y0, x1, y1 };
  }
  if (best.n < N * 0.01) throw new Error('placeholder não encontrado no cenário');
  const box = { x: best.x0, y: best.y0, w: best.x1 - best.x0 + 1, h: best.y1 - best.y0 + 1 };
  // cor ao redor da caixa (tecido da blusa / parede)
  let sr = 0, sg = 0, sb = 0, sn = 0;
  const ring = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const p = (y * W + x) * 3; sr += data[p]; sg += data[p + 1]; sb += data[p + 2]; sn++; };
  for (let x = box.x; x < box.x + box.w; x += 4) { ring(x, box.y - 8); ring(x, box.y + box.h + 8); }
  for (let y = box.y; y < box.y + box.h; y += 4) { ring(box.x - 8, y); ring(box.x + box.w + 8, y); }
  const around = { r: Math.round(sr / sn), g: Math.round(sg / sn), b: Math.round(sb / sn) };
  return { W, H, box, fill: best.n / (box.w * box.h), around, lab, id: best.id };
}

// Cola a foto ORIGINAL no cenário. Nada da foto é alterado (só redimensionada);
// exceto a prancha, onde a foto preenche a forma do deck (inevitável cortar as bordas).
export async function composite(tplBuf, photoBuf, kind) {
  const d = await detect(tplBuf);
  const { W, H, box } = d;
  const pad = 2; // cobre a franja antisserrilhada do magenta
  const B = { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), w: Math.min(W, box.x + box.w + pad) - Math.max(0, box.x - pad), h: Math.min(H, box.y + box.h + pad) - Math.max(0, box.y - pad) };
  const photo = sharp(photoBuf).rotate().toColourspace('srgb'); // respeita EXIF; P&B vira RGB sem mudar os tons
  const layers = [];

  if (kind === 'shape') {
    const mask = Buffer.alloc(W * H);
    for (let i = 0; i < W * H; i++) mask[i] = d.lab[i] === d.id ? 255 : 0;
    // máscara do deck um pouco expandida (blur + ganho) pra cobrir a borda antisserrilhada
    const a = await sharp(mask, { raw: { width: W, height: H, channels: 1 } })
      .blur(1.5).linear(2.5, 0).extract({ left: B.x, top: B.y, width: B.w, height: B.h }).extractChannel(0).raw().toBuffer();
    const rgb = await photo.resize(B.w, B.h, { fit: 'cover', position: sharp.strategy.attention }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const c = rgb.info.channels, n = B.w * B.h, rgba = Buffer.alloc(n * 4);
    for (let i = 0; i < n; i++) {
      rgba[i * 4] = rgb.data[i * c]; rgba[i * 4 + 1] = rgb.data[i * c + (c > 1 ? 1 : 0)]; rgba[i * 4 + 2] = rgb.data[i * c + (c > 2 ? 2 : 0)]; rgba[i * 4 + 3] = a[i];
    }
    layers.push({ input: rgba, raw: { width: B.w, height: B.h, channels: 4 }, left: B.x, top: B.y });
  } else {
    const bg = kind === 'mat' ? { r: 246, g: 245, b: 241 } : kind === 'fabric' ? { r: 244, g: 243, b: 239 } : d.around;
    const margin = kind === 'mat' ? Math.round(Math.min(B.w, B.h) * 0.07) : kind === 'fabric' ? Math.round(Math.min(B.w, B.h) * 0.03) : 0;
    const iw = B.w - 2 * margin, ih = B.h - 2 * margin;
    const img = await photo.resize(iw, ih, { fit: 'inside' }).toBuffer({ resolveWithObject: true });
    layers.push({ input: { create: { width: B.w, height: B.h, channels: 3, background: bg } }, left: B.x, top: B.y });
    layers.push({ input: img.data, left: B.x + Math.round((B.w - img.info.width) / 2), top: B.y + Math.round((B.h - img.info.height) / 2) });
    if (kind === 'mat') { // sombra interna leve do passe-partout, pra não parecer recortado
      const s = Math.max(3, Math.round(B.w * 0.006));
      const svg = `<svg width="${B.w}" height="${B.h}"><defs><linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".18"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient><linearGradient id="l" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient></defs><rect width="${B.w}" height="${s}" fill="url(#t)"/><rect width="${s}" height="${B.h}" fill="url(#l)"/></svg>`;
      layers.push({ input: Buffer.from(svg), left: B.x, top: B.y });
    }
  }
  return sharp(tplBuf).removeAlpha().composite(layers).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
}
