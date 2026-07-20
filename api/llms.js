// llms.txt dinâmico — base institucional + posts do blog gerados do content.json.
// Exposto como /llms.txt via rewrite no vercel.json; posts novos entram sozinhos.

export const config = { maxDuration: 30 };

const SITE = 'https://hugocarmo.com.br';
const CONTENT_URL = process.env.CONTENT_URL
  || 'https://gobslzsggskllmhzasti.supabase.co/storage/v1/object/public/photos/content.json';

const BASE = `# Hugo Carmo

> Artista visual e fotógrafo brasileiro. Registra a natureza e o cotidiano do Brasil em ciclo-viagens. Vende prints e quadros com moldura, em tamanho personalizado.

Hugo Carmo é um artista visual e fotógrafo do Rio de Janeiro, Brasil. Através da fotografia, busca capturar momentos e transmitir emoções, com olhar voltado para a beleza da natureza e o cotidiano urbano. Suas obras já foram expostas na Áustria, na Alemanha e no Brasil.

## Obras e preços

- Prints e quadros com moldura, em **tamanho personalizado**, a partir de **R$ 150,00**.
- Tipos de impressão e moldura: **Fine Art com moldura BOX preta**, **moldura BOX madeira**, **canvas** e **metacrilato**.
- As obras retratam paisagens e cenas de Alagoas, do Rio São Francisco, do Rio de Janeiro, de Pernambuco e do Uruguai, além da série "Escombros" (Rio de Janeiro).

## Compra e entrega

- Pedidos pelo WhatsApp: +55 21 99986-9645.
- Prazo de entrega no Rio de Janeiro: 15 dias úteis a partir do pedido.
- Prazo em outras cidades: 25 dias úteis a partir do pedido.
- O frete não está incluso no valor da obra; é calculado à parte conforme a cidade.

## Exposições

- Exposição Raiding Project — Raiding, Áustria (2017)
- Exposição Artlab Munich — Munique, Alemanha (2017)
- Ocupação EAV — Escola de Artes Visuais, Rio de Janeiro (2022, curadoria Denise Cathilina)
- Primeiro Salão de Fotografia — Museu de Arte Moderna de Resende (2023)`;

export default async function handler(req, res) {
  try {
    const r = await fetch(`${CONTENT_URL}?v=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) throw new Error('content.json ' + r.status);
    const c = await r.json();

    const parts = [BASE];

    const posts = ((c.blog && c.blog.posts) || []).filter(p => p.published !== false && p.slug);
    if (posts.length) {
      parts.push('\n## Diário de viagem (blog)\n');
      parts.push('Artigos sobre fotografia fine art, decoração com fotografia e viagens fotográficas:\n');
      for (const p of posts) {
        parts.push(`- [${p.title}](${SITE}/blog/${p.slug}): ${p.excerpt || ''}`);
      }
    }

    const cols = (c.collections || []).filter(x => x.visible !== false && x.slug);
    if (cols.length) {
      parts.push('\n## Séries de viagem\n');
      for (const col of cols) {
        parts.push(`- [${col.title}](${SITE}/viagem/${col.slug})`);
      }
    }

    parts.push(`\n## Links

- Site: ${SITE}/
- Loja de obras: ${SITE}/loja
- Provador virtual (visualize o quadro na sua parede): ${SITE}/provador
- Instagram: https://www.instagram.com/kina.com.br/`);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    res.end(parts.join('\n') + '\n');
  } catch (e) {
    // Fallback: serve a base estática (nunca deixa o llms.txt fora do ar)
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(BASE + '\n');
  }
}
