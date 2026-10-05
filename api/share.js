// /p/:id → página de compartilhamento de uma criação do Provador.
// Serve as meta tags Open Graph com a imagem gerada (preview no WhatsApp/Instagram/X)
// e redireciona o visitante para o Provador já mostrando a criação.
const BASE = 'https://gobslzsggskllmhzasti.supabase.co/storage/v1/object/public/photos/mockups';
const SITE = 'https://www.hugocarmo.com.br';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const LABEL = {
  pt: { blusa: 'Blusa', print: 'Quadro', bandeira: 'Bandeira', prancha: 'Prancha de surf', ambiente: 'Quadro no ambiente' },
  en: { blusa: 'Tee', print: 'Print', bandeira: 'Flag', prancha: 'Surfboard', ambiente: 'Print in a room' },
};

export default function handler(req, res) {
  const id = String((req.query && req.query.id) || '');
  const en = String((req.query && req.query.lang) || '') === 'en';
  if (!/^[a-z0-9-]+__[a-z0-9-]+$/.test(id)) { res.statusCode = 302; res.setHeader('Location', en ? '/en/provador' : '/provador'); return res.end(); }

  const variant = id.split('__')[1];
  const kind = variant.startsWith('ambiente-') ? 'ambiente' : variant;
  const L = en ? LABEL.en : LABEL.pt;
  const img = `${BASE}/${id}.png`;
  const dest = `${en ? '/en' : ''}/provador?m=${id}`;
  const title = en ? `${L[kind] || 'Creation'} with a photo by Hugo Carmo` : `${L[kind] || 'Criação'} com foto de Hugo Carmo`;
  const desc = en ? 'Created with the AI try-on — choose a photo and see it on a tee, print, flag or surfboard.'
                  : 'Criado no Provador IA — escolha uma foto e veja na blusa, quadro, bandeira ou prancha.';

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400');
  res.end(`<!doctype html><html lang="${en ? 'en' : 'pt-BR'}"><head><meta charset="utf-8">
<title>${esc(title)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<link rel="canonical" href="${SITE}${dest}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Hugo Carmo">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${SITE}/p/${id}">
<meta property="og:image" content="${img}">
<meta property="og:image:width" content="1024"><meta property="og:image:height" content="1024">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}"><meta name="twitter:image" content="${img}">
<meta http-equiv="refresh" content="0;url=${dest}">
<script>location.replace(${JSON.stringify(dest)});</script>
</head><body style="background:#000;color:#fff;font-family:system-ui;text-align:center;padding:40px">
<img src="${img}" alt="" style="max-width:min(90vw,520px);border-radius:12px"><p><a href="${dest}" style="color:#fff">${en ? 'Open in the AI try-on' : 'Abrir no Provador IA'} →</a></p>
</body></html>`);
}
