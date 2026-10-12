// SSR da página de cada fotografia — /foto/:slug e /en/foto/:slug (rewrite no vercel.json).
// Monta no servidor: título, metas, OG (a própria foto), canonical, hreflang, JSON-LD (VisualArtwork/Photograph)
// e todo o conteúdo — foto grande, legenda/local/ano, temas, comprar (WhatsApp), atalhos do Provador,
// fotolivros e posts do Diário relacionados, anterior/próxima. O foto.html só cuida do menu/ícones no navegador.
import fs from 'fs';
import path from 'path';

export const config = { maxDuration: 30 };

const SITE = 'https://www.hugocarmo.com.br';
const CONTENT_URL = process.env.CONTENT_URL
  || 'https://gobslzsggskllmhzasti.supabase.co/storage/v1/object/public/photos/content.json';

// slug da foto = path sem extensão (mesma regra do api/mockup.js → mockups-v2/<slug>__<variante>.jpg)
export const fotoSlug = p => String(p || '').replace(/\.[a-z0-9]+$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');

const TX = {
  pt: {
    home: 'Início', gallery: 'Fotografias', temas: 'Temas', serie: 'Série', year: 'Ano', place: 'Local',
    prev: 'Anterior', next: 'Próxima', all: 'Ver todas as fotografias', of: 'de',
    from: 'A partir de', price: 'R$ 150,00', buy: 'Comprar', shop: 'Ver na loja',
    buyTitle: 'Leve esta obra para casa', buyText: 'Print fine art ou quadro com moldura, em tamanho personalizado. Pedido direto com o artista pelo WhatsApp.',
    waMsg: 'Olá, tenho interesse no print: ',
    provTitle: 'Provador IA', provSub: 'Veja esta foto na blusa, no quadro, na bandeira, na prancha ou num ambiente — a obra original, sem alteração.', provCta: 'Experimentar',
    books: 'Fotolivros com esta série', bookCta: 'Ver fotolivro', posts: 'No Diário de viagem', read: 'Ler →',
    notfound: 'Foto não encontrada', backlink: 'Voltar para as fotografias',
    artform: 'Fotografia', medium: 'Impressão fine art',
    desc: (cap, tema) => `${cap} — fotografia fine art de Hugo Carmo${tema ? ` (tema ${tema})` : ''}. Print ou quadro com moldura em tamanho personalizado, a partir de R$ 150 — e no Provador IA: blusa, quadro, bandeira, prancha e ambientes.`,
    lead: (loc, year) => loc
      ? `Fotografia de Hugo Carmo feita em ${loc}${year ? `, em ${year}` : ''}, durante as ciclo-viagens do artista pelo Brasil e além.`
      : `Fotografia de Hugo Carmo, do acervo das ciclo-viagens do artista pelo Brasil e além.`,
    nTitle: n => `nº ${n}`,
  },
  en: {
    home: 'Home', gallery: 'Photography', temas: 'Themes', serie: 'Series', year: 'Year', place: 'Place',
    prev: 'Previous', next: 'Next', all: 'See all photographs', of: 'of',
    from: 'From', price: 'R$ 150', buy: 'Buy', shop: 'See in the shop',
    buyTitle: 'Take this artwork home', buyText: 'Fine-art print or framed artwork in a custom size. Order directly from the artist on WhatsApp.',
    waMsg: 'Hi, I\'m interested in the print: ',
    provTitle: 'AI try-on', provSub: 'See this photo on a tee, a framed print, a flag, a surfboard or in a room — the original artwork, untouched.', provCta: 'Try it',
    books: 'Photo books with this series', bookCta: 'See photo book', posts: 'In the Travel diary', read: 'Read →',
    notfound: 'Photo not found', backlink: 'Back to the photographs',
    artform: 'Photography', medium: 'Fine-art print',
    desc: (cap, tema) => `${cap} — fine-art photograph by Hugo Carmo${tema ? ` (theme: ${tema})` : ''}. Print or framed artwork in custom sizes, from R$ 150 — and in the AI try-on: tee, print, flag, surfboard and rooms.`,
    lead: (loc, year) => loc
      ? `Photograph by Hugo Carmo taken in ${loc}${year ? ` in ${year}` : ''}, on the artist's bike journeys across Brazil and beyond.`
      : `Photograph by Hugo Carmo, from the archive of the artist's bike journeys across Brazil and beyond.`,
    nTitle: n => `no. ${n}`,
  }
};

// Atalhos do Provador (mesmos tipos do provador.html); `mk` = nome do mockup em cache (mockups-v2/<slug>__<mk>.jpg)
const PROV = [
  { tipo: 'blusa', icon: 'shirt', pt: 'Roupas e boné', en: 'Apparel & cap', mk: null },
  { tipo: 'print', icon: 'frame', pt: 'Quadro', en: 'Framed print', mk: 'print' },
  { tipo: 'bandeira', icon: 'flag', pt: 'Bandeira', en: 'Flag', mk: 'bandeira' },
  { tipo: 'prancha', icon: 'waves', pt: 'Prancha', en: 'Surfboard', mk: 'prancha' },
  { tipo: 'ambiente', icon: 'sofa', pt: 'Ambientes', en: 'Rooms', mk: 'ambiente-sala' },
];

// Palavras-chave por tema (para achar posts do Diário quando a legenda não traz lugar)
const TEMA_KW = {
  aguas: ['rio', 'agua', 'travessia', 'mar'],
  litoral: ['litoral', 'praia', 'mar', 'alagoas'],
  sertao: ['sertao', 'natureza', 'paisagem'],
  gente: ['cotidiano', 'documental', 'pescador'],
  abstrato: ['abstrat', 'detalhe', 'textura', 'preto e branco'],
  urbano: ['urbano', 'cidade', 'escombros', 'concreto'],
};
const STOP = new Set(['para', 'pelo', 'pela', 'entre', 'sobre', 'com', 'sem', 'como', 'dos', 'das', 'nas', 'nos', 'uma', 'umas', 'que']);

const esc = s => (s == null ? '' : String(s))
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
const slugify = s => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const count = (hay, needle) => { if (!needle) return 0; let n = 0, i = -1; while ((i = hay.indexOf(needle, i + 1)) !== -1) n++; return n; };
// casa no começo da palavra ("rio" acha "rio são francisco", mas não "aniversário")
const hasWord = (hay, w) => new RegExp('(^|[^a-z0-9])' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(hay);

// "3 irmãos, Rio de Janeiro, 2015" → { loc:'Rio de Janeiro', year:'2015' }; "Pescador de tarrafa" → { loc:'' }
function parseCaption(cap) {
  const parts = String(cap || '').split(',').map(x => x.trim()).filter(Boolean);
  let year = '';
  if (parts.length && /^\d{4}$/.test(parts[parts.length - 1])) year = parts.pop();
  const loc = (year && parts.length) ? parts[parts.length - 1] : '';
  return { loc, year };
}
// palavras significativas da legenda (fora o lugar), ex.: "pescador", "tarrafa", "bicicleta"
const capWords = (cap, loc) => {
  const locN = norm(loc);
  return [...new Set(norm(cap).replace(/[^a-z0-9 ]+/g, ' ').split(' ')
    .filter(w => w.length >= 5 && !STOP.has(w) && !/^\d+$/.test(w) && !locN.includes(w)))];
};

async function loadTemplate() {
  // foto.html é incluído no bundle da função via vercel.json > functions.includeFiles
  try {
    return fs.readFileSync(path.join(process.cwd(), 'foto.html'), 'utf8');
  } catch {
    const r = await fetch((process.env.TEMPLATE_URL_FOTO || `${SITE}/foto`));
    if (!r.ok) throw new Error('template ' + r.status);
    return r.text();
  }
}

const setAttr = (html, id, attr, value) =>
  html.replace(new RegExp(`(id="${id}"[^>]*${attr}=")[^"]*(")`), `$1${value.replace(/\$/g, '$$$$')}$2`);
const put = (html, re, str) => html.replace(re, () => str);

// ---------- relacionados ----------
// Pontuação simples: capa = esta foto (forte) · lugar da legenda no título/keywords (forte) ou no texto (fraco)
// · capa do post/livro é do mesmo lugar · palavras da legenda · tema. Mostra só o que passa do corte.
function relatedPosts(c, ph, info, byPath) {
  const loc = norm(info.loc), words = capWords(ph.caption, info.loc), temas = ph.temas || [];
  const out = [];
  for (const p of (c.blog && c.blog.posts) || []) {
    if (p.published === false || !p.slug) continue;
    const head = norm(`${p.title} ${p.keywords || ''} ${p.excerpt || ''}`), body = norm(p.body);
    let s = 0;
    if (p.cover === ph.path) s += 10;
    if (p.body && p.body.includes(ph.path)) s += 10;
    if (loc) { if (head.includes(loc)) s += 6; s += Math.min(3, count(body, loc)); }
    const cov = byPath[p.cover];
    if (cov && cov.path !== ph.path) {
      if (loc && norm(parseCaption(cov.caption).loc) === loc) s += 3;
      if ((cov.temas || []).some(t => temas.includes(t))) s += 1;
    }
    for (const w of words) { if (hasWord(head, w)) s += 3; else if (hasWord(body, w)) s += 1; }
    for (const t of temas) for (const k of TEMA_KW[t] || []) if (hasWord(head, k)) { s += 1; break; }
    if (s >= 4) out.push({ p, s });
  }
  return out.sort((a, b) => b.s - a.s || String(b.p.date || '').localeCompare(String(a.p.date || ''))).slice(0, 3).map(x => x.p);
}

function relatedBooks(c, ph, info, byPath) {
  const loc = norm(info.loc), words = capWords(ph.caption, info.loc), temas = ph.temas || [];
  const out = [];
  ((c.fotolivros && c.fotolivros.items) || []).forEach((it, i) => {
    const txt = norm(`${it.title} ${it.subtitle || ''} ${it.desc || it.description || ''}`);
    let s = 0;
    if (it.cover === ph.path) s += 10;
    if (Array.isArray(it.photos) && it.photos.includes(ph.path)) s += 10; // se um dia o admin listar as fotos do livro
    if (Array.isArray(it.temas) && it.temas.some(t => temas.includes(t))) s += 3;
    if (loc && txt.includes(loc)) s += 6;
    const cov = byPath[it.cover];
    if (loc && cov && cov.path !== ph.path && norm(parseCaption(cov.caption).loc) === loc) s += 4;
    for (const w of words) if (hasWord(txt, w)) s += 3;
    if (s >= 3) out.push({ it, i, s });
  });
  return out.sort((a, b) => b.s - a.s).slice(0, 3);
}

export default async function handler(req, res) {
  try {
    const u = new URL(req.url, 'http://local');
    const slug = (u.searchParams.get('slug') || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
    const lang = u.searchParams.get('lang') === 'en' ? 'en' : 'pt';
    const T = TX[lang], EN = lang === 'en';
    const PRE = EN ? '/en' : '';
    const HOME = EN ? '/en' : '/';

    const [template, contentRes] = await Promise.all([
      loadTemplate(),
      fetch(`${CONTENT_URL}?v=${Date.now()}`, { cache: 'no-store' })
    ]);
    if (!contentRes.ok) throw new Error('content.json ' + contentRes.status);
    const c = await contentRes.json();
    const en = c.en || {};

    const fts = (c.photos || []).filter(p => p.section === 'fotografias' && p.path).sort((a, b) => (a.order || 0) - (b.order || 0));
    const byPath = Object.fromEntries((c.photos || []).map(p => [p.path, p]));
    const idx = fts.findIndex(p => fotoSlug(p.path) === slug);
    let html = template;
    if (EN) html = html.replace('<html lang="pt-BR">', '<html lang="en">');
    const contact = { whatsapp: c.contact?.whatsapp || '', instagram_url: c.contact?.instagram_url || '' };

    if (idx < 0) {
      html = put(html, /<title id="t">[^<]*<\/title>/, `<title id="t">${esc(T.notfound)} — Hugo Carmo</title>`);
      html = put(html, /<main id="foto"[^>]*>[\s\S]*?<\/main>/,
        `<main id="foto" class="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-8 py-24 text-center"><h1 class="text-2xl font-semibold mb-3">${esc(T.notfound)}</h1><p class="text-white/60"><a href="${HOME}#galeria" class="underline">${esc(T.backlink)}</a></p></main>`);
      html = put(html, '<script>window.__FOTO=null;</script>', `<script>window.__FOTO=${JSON.stringify({ lang, contact, alt: EN ? '/' : '/en' }).replace(/</g, '\\u003c')};</script>`);
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(html);
    }

    const ph = fts[idx];
    const prev = fts[(idx - 1 + fts.length) % fts.length], next = fts[(idx + 1) % fts.length];
    const capOf = p => (EN && p.caption_en) ? p.caption_en : (p.caption || '');
    const cap = capOf(ph) || (EN ? 'Photograph' : 'Fotografia');
    const info = parseCaption(ph.caption);
    const bucket = c.bucket_base;
    const render = bucket.replace('/object/public/', '/render/image/public/');
    const full = `${bucket}/${ph.path}`;
    const thumb = (p, w = 600) => /^https?:\/\//.test(p) ? p : `${render}/${p}?width=${w}&quality=70`;
    const pageUrl = s => `${SITE}${PRE}/foto/${s}`;
    const url = pageUrl(slug);
    const temas = (c.temas || []).filter(t => (ph.temas || []).includes(t.slug));
    const temaLabel = t => EN ? (t.en || t.pt) : t.pt;
    // legendas repetidas ("Alagoas, 2015") ganham o nº na galeria para o título não se repetir
    const dup = fts.filter(p => capOf(p) === capOf(ph)).length > 1;
    const h1 = cap;
    const titleBase = dup ? `${cap} · ${T.nTitle(idx + 1)}` : cap;
    const title = `${titleBase} — ${EN ? 'Photograph by' : 'Fotografia de'} Hugo Carmo`;
    const desc = T.desc(cap, temas.map(temaLabel).join(', '));
    const col = info.loc ? (c.collections || []).find(x => x.visible !== false && x.slug === slugify(info.loc)) : null;

    // <head>
    html = put(html, /<title id="t">[^<]*<\/title>/, `<title id="t">${esc(title)}</title>`);
    html = setAttr(html, 'meta-desc', 'content', esc(desc));
    html = setAttr(html, 'robots', 'content', 'index, follow, max-image-preview:large');
    html = setAttr(html, 'canonical', 'href', url);
    html = setAttr(html, 'og-locale', 'content', EN ? 'en_US' : 'pt_BR');
    html = setAttr(html, 'og-title', 'content', esc(titleBase + ' — Hugo Carmo'));
    html = setAttr(html, 'og-desc', 'content', esc(desc));
    html = setAttr(html, 'og-url', 'content', url);
    html = setAttr(html, 'og-image', 'content', esc(full));
    html = setAttr(html, 'og-image-alt', 'content', esc(cap));
    html = setAttr(html, 'tw-title', 'content', esc(titleBase + ' — Hugo Carmo'));
    html = setAttr(html, 'tw-image', 'content', esc(full));
    const hreflang = [['pt-BR', `${SITE}/foto/${slug}`], ['en', `${SITE}/en/foto/${slug}`], ['x-default', `${SITE}/foto/${slug}`]]
      .map(([h, href]) => `  <link rel="alternate" hreflang="${h}" href="${href}">`).join('\n');
    html = html.replace('</head>', `${hreflang}\n  <link rel="preload" as="image" href="${esc(full)}" fetchpriority="high">\n</head>`);

    // JSON-LD: obra (VisualArtwork + Photograph) + breadcrumb
    const ld = [{
      '@context': 'https://schema.org', '@type': ['VisualArtwork', 'Photograph'],
      '@id': url + '#obra', name: titleBase, description: desc, url, image: full, thumbnailUrl: thumb(ph.path, 600),
      inLanguage: EN ? 'en' : 'pt-BR', artform: T.artform, artMedium: T.medium,
      ...(info.year ? { dateCreated: info.year } : {}),
      ...(info.loc ? { contentLocation: { '@type': 'Place', name: info.loc } } : {}),
      ...(temas.length ? { keywords: temas.map(temaLabel).join(', ') } : {}),
      creator: { '@type': 'Person', name: 'Hugo Carmo', url: `${SITE}/sobre` },
      copyrightHolder: { '@type': 'Person', name: 'Hugo Carmo' },
      mainEntityOfPage: { '@type': 'WebPage', '@id': url }
    }, {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: T.home, item: `${SITE}${HOME}` },
        { '@type': 'ListItem', position: 2, name: T.gallery, item: `${SITE}${HOME}#galeria` },
        { '@type': 'ListItem', position: 3, name: titleBase, item: url }
      ]
    }];
    html = put(html, /<script type="application\/ld\+json" id="ld-foto"><\/script>/,
      `<script type="application/ld+json" id="ld-foto">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`);

    // ---------- conteúdo ----------
    const wa = c.contact?.whatsapp || '';
    const waLink = 'https://api.whatsapp.com/send/?phone=' + wa + '&text=' + encodeURIComponent(`${T.waMsg}${cap} (${url})`) + '&type=phone_number&app_absent=0';
    const prov = `${PRE}/provador?foto=${encodeURIComponent(ph.path)}`;
    const mkBase = `${render}/mockups-v2/${fotoSlug(ph.path)}__`;
    const navA = (p, id, dir) => `<a id="${id}" href="${PRE}/foto/${fotoSlug(p.path)}" aria-label="${esc(dir === 'l' ? T.prev : T.next)}: ${esc(capOf(p))}" class="hidden md:flex absolute top-1/2 -translate-y-1/2 ${dir === 'l' ? 'left-3 lg:left-6' : 'right-3 lg:right-6'} w-12 h-12 rounded-full items-center justify-center bg-black/40 border border-white/15 backdrop-blur hover:bg-white/15 transition"><i data-lucide="${dir === 'l' ? 'chevron-left' : 'chevron-right'}" class="w-6 h-6"></i></a>`;
    const chip = (href, label, icon) => `<a href="${href}" class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-white/20 text-sm text-white/85 hover:bg-white/10 transition">${icon ? `<i data-lucide="${icon}" class="w-3.5 h-3.5"></i>` : ''}${esc(label)}</a>`;

    const meta = [
      info.loc ? `<div><dt class="text-[11px] uppercase tracking-widest text-white/40">${T.place}</dt><dd class="text-white/85">${esc(info.loc)}</dd></div>` : '',
      info.year ? `<div><dt class="text-[11px] uppercase tracking-widest text-white/40">${T.year}</dt><dd class="text-white/85">${esc(info.year)}</dd></div>` : '',
      `<div><dt class="text-[11px] uppercase tracking-widest text-white/40">nº</dt><dd class="text-white/85">${idx + 1} ${T.of} ${fts.length}</dd></div>`
    ].join('');

    const provCards = PROV.map(pv => `<a href="${prov}&tipo=${pv.tipo}" data-ev="foto_provador" data-tipo="${pv.tipo}" class="group relative block rounded-xl overflow-hidden border border-white/10 bg-gradient-to-br from-white/[.07] to-white/[.02] hover:border-white/30 transition aspect-[4/3]${pv.tipo === 'blusa' ? ' col-span-2 aspect-[8/3]' : ''}">
          <img src="${esc(thumb(ph.path, 500))}" alt="" loading="lazy" class="absolute inset-0 w-full h-full object-cover opacity-25 group-hover:opacity-40 transition">
          ${pv.mk ? `<img src="${esc(mkBase + pv.mk + '.jpg?width=420&quality=65')}" alt="" loading="lazy" class="mk-img absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105">` : ''}
          <span class="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent"></span>
          <span class="absolute left-3 bottom-2.5 right-3 flex items-center gap-2 text-sm font-medium"><i data-lucide="${pv.icon}" class="w-4 h-4 shrink-0"></i>${esc(EN ? pv.en : pv.pt)}</span>
        </a>`).join('');

    const books = relatedBooks(c, ph, info, byPath).map(({ it, i }) => {
      const t = (EN && en.fotolivros && Array.isArray(en.fotolivros.items) && en.fotolivros.items[i]) ? { ...it, ...en.fotolivros.items[i] } : it;
      return `<a href="${PRE}/fotolivros" class="group flex gap-4 items-center rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition p-3">
          ${t.cover ? `<img src="${esc(thumb(t.cover, 300))}" alt="${esc(t.title)}" loading="lazy" class="w-24 h-24 sm:w-28 sm:h-28 rounded-xl object-cover shrink-0">` : ''}
          <span class="flex-1 min-w-0"><span class="block text-[11px] uppercase tracking-wider text-white/40 mb-1">${EN ? 'Photo book' : 'Fotolivro'}</span>
            <span class="block text-lg font-semibold leading-snug">${esc(t.title)}</span>
            ${t.subtitle ? `<span class="block text-white/55 text-sm">${esc(t.subtitle)}</span>` : ''}
            <span class="mt-2 flex items-center gap-3 text-sm">${t.price ? `<span class="text-white/80">${esc(t.price)}</span>` : ''}<span class="font-semibold group-hover:underline">${T.bookCta} →</span></span></span>
        </a>`;
    }).join('');

    const posts = relatedPosts(c, ph, info, byPath).map(p => {
      const tp = (EN && p.en) ? { ...p, ...p.en } : p;
      return `<a href="${PRE}/blog/${esc(p.slug)}" class="group block rounded-2xl overflow-hidden border border-white/10 bg-white/5 hover:bg-white/10 transition">
          ${p.cover ? `<div class="aspect-[16/10] overflow-hidden"><img src="${esc(thumb(p.cover, 640))}" alt="${esc(tp.title)}" loading="lazy" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"></div>` : ''}
          <div class="p-5"><h3 class="font-semibold leading-snug mb-2">${esc(tp.title)}</h3>${tp.excerpt ? `<p class="text-white/60 text-sm line-clamp-3 mb-3">${esc(tp.excerpt)}</p>` : ''}<span class="text-sm font-medium">${T.read}</span></div>
        </a>`;
    }).join('');

    const pn = (p, label, align) => `<a href="${PRE}/foto/${fotoSlug(p.path)}" class="group flex items-center gap-3 ${align === 'r' ? 'flex-row-reverse text-right' : ''} rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition p-3">
          <img src="${esc(thumb(p.path, 240))}" alt="${esc(capOf(p))}" loading="lazy" class="w-16 h-16 rounded-lg object-cover shrink-0">
          <span class="min-w-0"><span class="block text-[11px] uppercase tracking-widest text-white/40">${align === 'r' ? T.next + ' →' : '← ' + T.prev}</span><span class="block text-sm text-white/85 truncate">${esc(capOf(p))}</span></span>
        </a>`;

    const main = `<main id="foto" class="flex-1 w-full">
    <section class="relative w-full bg-black">
      <figure class="w-full flex items-center justify-center px-2 sm:px-6 pt-4 sm:pt-8 pb-2 sm:min-h-[60vh]">
        <img id="foto-img" src="${esc(full)}" alt="${esc(cap)}${info.loc ? '' : ' — Hugo Carmo'}" fetchpriority="high" class="max-h-[84vh] w-auto max-w-full object-contain rounded-md shadow-[0_30px_80px_rgba(0,0,0,.8)]">
      </figure>
      ${navA(prev, 'prev-link', 'l')}${navA(next, 'next-link', 'r')}
    </section>

    <div class="w-full max-w-6xl mx-auto px-4 sm:px-8 pt-8 pb-14 grid lg:grid-cols-[1fr_400px] gap-10 lg:gap-14">
      <div>
        <nav class="text-xs text-white/40 mb-5"><a href="${HOME}" class="hover:text-white">${T.home}</a> › <a href="${HOME}#galeria" class="hover:text-white">${T.gallery}</a> › <span class="text-white/60">${esc(titleBase)}</span></nav>
        <h1 class="text-3xl md:text-5xl font-semibold tracking-tight leading-tight mb-4">${esc(h1)}</h1>
        <p class="text-white/65 leading-relaxed mb-6 max-w-xl">${esc(T.lead(info.loc, info.year))}</p>
        <dl class="flex flex-wrap gap-x-10 gap-y-3 mb-6">${meta}</dl>
        <div class="flex flex-wrap gap-2 mb-8">
          ${temas.map(t => chip(`${HOME}?tema=${encodeURIComponent(t.slug)}`, temaLabel(t), 'tag')).join('')}
          ${col ? chip(`${PRE}/viagem/${col.slug}`, `${T.serie}: ${EN && col.title_en ? col.title_en : col.title}`, 'bike') : ''}
          ${chip(`${PRE}/temas`, T.temas, 'layout-grid')}
        </div>
        <div class="rounded-2xl border border-white/15 bg-gradient-to-br from-white/[.08] via-white/[.03] to-transparent p-6">
          <div class="text-xl font-semibold mb-1.5">${T.buyTitle}</div>
          <p class="text-white/65 text-sm leading-relaxed mb-5">${T.buyText}</p>
          <div class="flex flex-wrap items-center gap-4">
            <span class="flex flex-col leading-tight mr-2"><span class="text-[11px] text-white/45">${T.from}</span><span class="text-xl font-semibold">${T.price}</span></span>
            <a href="${waLink}" target="_blank" rel="noopener" data-ev="foto_comprar" class="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-white text-black font-semibold hover:bg-white/90"><i data-lucide="message-circle" class="w-4 h-4"></i> ${T.buy}</a>
            <a href="${PRE}/loja?tipo=print" class="text-sm text-white/70 hover:text-white underline underline-offset-4">${T.shop}</a>
          </div>
        </div>
      </div>

      <aside id="provador-foto" class="lg:pt-10">
        <div class="flex items-center gap-2 mb-1.5"><i data-lucide="sparkles" class="w-5 h-5"></i><h2 class="text-xl font-semibold">${T.provTitle}</h2></div>
        <p class="text-white/60 text-sm leading-relaxed mb-4">${T.provSub}</p>
        <div class="grid grid-cols-2 gap-3">${provCards}</div>
        <a href="${prov}" data-ev="foto_provador" class="mt-4 inline-flex items-center gap-2 text-sm font-semibold hover:underline">${T.provCta} →</a>
      </aside>
    </div>

    ${books ? `<section class="w-full max-w-6xl mx-auto px-4 sm:px-8 pb-14">
      <h2 class="text-2xl md:text-3xl font-semibold tracking-tight mb-5">${T.books}</h2>
      <div class="grid sm:grid-cols-2 gap-4">${books}</div>
    </section>` : ''}

    ${posts ? `<section class="w-full max-w-6xl mx-auto px-4 sm:px-8 pb-14">
      <h2 class="text-2xl md:text-3xl font-semibold tracking-tight mb-5">${T.posts}</h2>
      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">${posts}</div>
    </section>` : ''}

    <section class="w-full max-w-6xl mx-auto px-4 sm:px-8 pb-16">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">${pn(prev, T.prev, 'l')}${pn(next, T.next, 'r')}</div>
      <div class="text-center mt-8"><a href="${HOME}#galeria" class="inline-block px-6 py-3 rounded-lg border border-white/20 hover:bg-white/10 transition text-sm font-medium">${T.all}</a></div>
    </section>
  </main>`;
    html = put(html, /<main id="foto"[^>]*>[\s\S]*?<\/main>/, main);
    html = put(html, '<script>window.__FOTO=null;</script>',
      `<script>window.__FOTO=${JSON.stringify({ lang, path: ph.path, slug, contact, alt: EN ? `/foto/${slug}` : `/en/foto/${slug}` }).replace(/</g, '\\u003c')};</script>`);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
    res.end(html);
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Erro ao renderizar foto: ' + e.message);
  }
}
