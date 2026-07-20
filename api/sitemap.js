// Sitemap dinâmico — gerado a partir do content.json do Supabase Storage.
// Assim, posts novos publicados pelo admin (ou pelo agente SEO) entram no
// sitemap automaticamente, sem precisar de commit/redeploy.
// Exposto como /sitemap.xml via rewrite no vercel.json.

const SITE = 'https://hugocarmo.com.br';
const CONTENT_URL = 'https://gobslzsggskllmhzasti.supabase.co/storage/v1/object/public/photos/content.json';

const STATIC_PAGES = [
  { path: '/', priority: '1.0' },
  { path: '/loja', priority: '0.9' },
  { path: '/blog', priority: '0.8' },
  { path: '/temas', priority: '0.8' },
  { path: '/provador', priority: '0.7' },
  { path: '/cicloviagens', priority: '0.7' },
  { path: '/fotolivros', priority: '0.7' },
  { path: '/sobre', priority: '0.6' },
  { path: '/faq', priority: '0.5' },
];

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export default async function handler(req, res) {
  try {
    const r = await fetch(`${CONTENT_URL}?v=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) throw new Error('content.json ' + r.status);
    const c = await r.json();

    const today = new Date().toISOString().slice(0, 10);
    const urls = [];

    for (const p of STATIC_PAGES) {
      urls.push({ loc: SITE + p.path, lastmod: today, priority: p.priority });
    }

    for (const post of (c.blog && c.blog.posts) || []) {
      if (!post.published || !post.slug) continue;
      urls.push({
        loc: `${SITE}/blog/${post.slug}`,
        lastmod: post.date || today,
        priority: '0.7',
      });
    }

    for (const col of c.collections || []) {
      if (col.visible === false || !col.slug) continue;
      urls.push({ loc: `${SITE}/viagem/${col.slug}`, lastmod: today, priority: '0.6' });
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${esc(u.loc)}</loc>
    <lastmod>${esc(u.lastmod)}</lastmod>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>
`;

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.end(xml);
  } catch (e) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Erro ao gerar sitemap: ' + e.message);
  }
}
