// SSR dos posts do blog — /blog/:slug e /en/blog/:slug (rewrite no vercel.json).
// Injeta título, metas, OG, canonical, hreflang, JSON-LD e o CONTEÚDO COMPLETO
// do artigo no HTML servido — crawlers de IA (que não executam JavaScript) e
// scrapers de redes sociais passam a ver tudo. O JS do post.html continua
// rodando no navegador e re-renderiza o mesmo conteúdo (sem diferença visual).
import fs from 'fs';
import path from 'path';

export const config = { maxDuration: 30 };

const SITE = 'https://hugocarmo.com.br';
const CONTENT_URL = process.env.CONTENT_URL
  || 'https://gobslzsggskllmhzasti.supabase.co/storage/v1/object/public/photos/content.json';

const TX = {
  pt: { home: 'Início', diary: 'Diário de viagem', ctaTitle: 'Quer uma obra dessas na sua parede?', ctaText: 'Prints e quadros fine art em tamanho personalizado.', ctaBtn: 'Ver as obras', notfound: 'Post não encontrado', backlink: 'Voltar para o Diário de viagem' },
  en: { home: 'Home', diary: 'Travel diary', ctaTitle: 'Want an artwork like this on your wall?', ctaText: 'Fine-art prints and framed artworks in custom sizes.', ctaBtn: 'See the artworks', notfound: 'Post not found', backlink: 'Back to the Travel diary' }
};
const MESES_PT = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const MESES_EN = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const esc = s => (s == null ? '' : String(s))
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Espelho exato do mdLite do post.html
function mdLite(text) {
  const inline = t => esc(t)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((\/[^)\s]*|https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
  return String(text || '').split(/\n{2,}/).map(b => {
    b = b.trim();
    if (b.startsWith('### ')) return `<h3>${inline(b.slice(4))}</h3>`;
    if (b.startsWith('## ')) return `<h2>${inline(b.slice(3))}</h2>`;
    return `<p>${inline(b).replace(/\n/g, '<br>')}</p>`;
  }).join('');
}

function fmtDate(d, lang) {
  const p = String(d || '').split('-');
  if (!(p[2] && p[1] && p[0])) return '';
  const m = (lang === 'en' ? MESES_EN : MESES_PT)[parseInt(p[1], 10) - 1];
  return lang === 'en' ? `${m} ${parseInt(p[2], 10)}, ${p[0]}` : `${parseInt(p[2], 10)} de ${m} de ${p[0]}`;
}

async function loadTemplate() {
  // post.html é incluído no bundle da função via vercel.json > functions.includeFiles
  try {
    return fs.readFileSync(path.join(process.cwd(), 'post.html'), 'utf8');
  } catch {
    const r = await fetch((process.env.TEMPLATE_URL || `${SITE}/post`));
    if (!r.ok) throw new Error('template ' + r.status);
    return r.text();
  }
}

const setAttr = (html, id, attr, value) =>
  html.replace(new RegExp(`(id="${id}"[^>]*${attr}=")[^"]*(")`), `$1${value.replace(/\$/g, '$$$$')}$2`);

export default async function handler(req, res) {
  try {
    const u = new URL(req.url, 'http://local');
    const slug = (u.searchParams.get('slug') || '').replace(/[^a-z0-9-]/gi, '');
    const lang = u.searchParams.get('lang') === 'en' ? 'en' : 'pt';
    const T = TX[lang];
    const BLOGBASE = lang === 'en' ? '/en/blog' : '/blog';
    const HOMEBASE = lang === 'en' ? '/en' : '/';

    const [template, contentRes] = await Promise.all([
      loadTemplate(),
      fetch(`${CONTENT_URL}?v=${Date.now()}`, { cache: 'no-store' })
    ]);
    if (!contentRes.ok) throw new Error('content.json ' + contentRes.status);
    const c = await contentRes.json();

    const post = ((c.blog && c.blog.posts) || []).find(p => p.slug === slug && p.published !== false);
    let html = template;

    if (!post) {
      html = html.replace(/<title id="t">[^<]*<\/title>/, `<title id="t">${esc(T.notfound)} — Hugo Carmo</title>`);
      html = html.replace(
        /<article id="article">[\s\S]*?<\/article>/,
        `<article id="article"><h1 class="text-2xl font-semibold mb-3">${esc(T.notfound)}</h1><p class="text-white/60"><a href="${BLOGBASE}" class="underline">${esc(T.backlink)}</a></p></article>`
      );
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(html);
    }

    const t = (lang === 'en' && post.en) ? post.en : post;
    const url = `${SITE}${BLOGBASE}/${post.slug}`;
    const imgUrl = p => /^https?:\/\//.test(p) ? p : `${c.bucket_base}/${p}`;
    const cover = imgUrl(post.cover);
    const desc = t.excerpt || '';
    const title = `${t.title} — Hugo Carmo`;

    // <head>: título, metas, canonical, OG, twitter
    html = html.replace(/<title id="t">[^<]*<\/title>/, `<title id="t">${esc(title)}</title>`);
    html = setAttr(html, 'meta-desc', 'content', esc(desc));
    html = setAttr(html, 'meta-kw', 'content', esc(t.keywords || ''));
    html = setAttr(html, 'canonical', 'href', url);
    html = setAttr(html, 'og-title', 'content', esc(t.title));
    html = setAttr(html, 'og-desc', 'content', esc(desc));
    html = setAttr(html, 'og-url', 'content', url);
    html = setAttr(html, 'og-image', 'content', esc(cover));
    html = setAttr(html, 'tw-image', 'content', esc(cover));

    // JSON-LD BlogPosting (mesmo shape do client)
    const ld = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'BlogPosting',
      headline: t.title, description: desc, image: cover,
      inLanguage: lang === 'en' ? 'en' : 'pt-BR',
      datePublished: post.date, dateModified: post.date,
      author: { '@type': 'Person', name: 'Hugo Carmo', url: `${SITE}/` },
      publisher: { '@type': 'Person', name: 'Hugo Carmo' },
      mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      keywords: t.keywords || ''
    });
    html = html.replace(
      /<script type="application\/ld\+json" id="ld-article"><\/script>/,
      `<script type="application/ld+json" id="ld-article">${ld.replace(/</g, '\\u003c')}</script>`
    );

    // hreflang
    const hreflang = [['pt-br', '/blog/'], ['en', '/en/blog/'], ['x-default', '/blog/']]
      .map(([h, b]) => `  <link rel="alternate" hreflang="${h}" href="${SITE}${b}${post.slug}">`)
      .join('\n');
    html = html.replace('</head>', `${hreflang}\n</head>`);

    if (lang === 'en') html = html.replace('<html lang="pt-BR">', '<html lang="en">');

    // Artigo completo renderizado no servidor (o client re-renderiza igual)
    const article = `<article id="article">
        <nav class="text-xs text-white/40 mb-6"><a href="${HOMEBASE}" class="hover:text-white">${esc(T.home)}</a> › <a href="${BLOGBASE}" class="hover:text-white">${esc(T.diary)}</a></nav>
        <h1 class="text-3xl md:text-5xl font-semibold tracking-tight leading-tight mb-3">${esc(t.title)}</h1>
        <div class="text-white/50 text-sm mb-8">${esc(fmtDate(post.date, lang))}</div>
        <img src="${esc(cover)}" alt="${esc(t.title)}" class="w-full rounded-2xl mb-10 object-cover">
        <div class="prose-art text-lg">${mdLite(t.body)}</div>
        <div class="mt-12 rounded-2xl border border-white/15 bg-white/5 p-6 text-center">
          <div class="text-xl font-semibold mb-2">${esc(T.ctaTitle)}</div>
          <p class="text-white/65 mb-4">${esc(T.ctaText)}</p>
          <a href="${HOMEBASE}#comprar-obras" class="inline-block px-6 py-3 rounded-lg bg-white text-black font-medium hover:bg-white/90">${esc(T.ctaBtn)}</a>
        </div></article>`;
    html = html.replace(/<article id="article">[\s\S]*?<\/article>/, article);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
    res.end(html);
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Erro ao renderizar post: ' + e.message);
  }
}
