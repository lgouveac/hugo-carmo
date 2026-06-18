# Hugo Carmo — Site + CMS

Site de portfólio e venda de obras do artista visual **Hugo Carmo**, com um **painel de administração** (CMS) próprio.

- **Site público** (`index.html`): hero, fotografias, sugestões de montagem, loja, sobre, exposições e contato. Todo o conteúdo é carregado dinamicamente do Supabase.
- **Painel admin** (`admin.html`, acessível em `/admin`): login por senha onde o Hugo edita textos, sobe/reordena/apaga fotos, gerencia produtos, exposições e contato.

## Como funciona

```
Navegador (site público)  ──lê──►  content.json (público no Supabase Storage)
Navegador (/admin) ──login──►  /api/login ──►  token (HMAC, 12h)
            └──salvar/upload──►  /api/save · /api/upload  ──(service_role no servidor)──►  Supabase
```

- O conteúdo fica em **`content.json`** no bucket público `photos` do Supabase. O site lê esse arquivo direto (sem nenhuma chave).
- As gravações passam por **funções serverless** (`/api/*`) na Vercel, que usam a chave `service_role` **guardada no servidor** (variável de ambiente). A chave nunca vai para o navegador nem para o Git.
- O login do painel é protegido pela senha `ADMIN_PASSWORD`.

## Stack
HTML estático + [Tailwind](https://tailwindcss.com) (CDN), [GSAP](https://gsap.com), [Lucide](https://lucide.dev). Backend em funções serverless Node (sem dependências). Armazenamento no [Supabase Storage](https://supabase.com/storage).

## Estrutura
```
index.html        # site público (dinâmico)
admin.html        # painel /admin
api/
  _lib.js         # helpers (auth/token, env)
  login.js        # POST /api/login   → valida senha, devolve token
  save.js         # POST /api/save    → grava content.json (requer token)
  upload.js       # POST /api/upload  → sobe imagem (requer token)
  delete.js       # POST /api/delete  → apaga imagem do bucket (requer token)
content.json      # cópia-semente do conteúdo (o "ao vivo" fica no Supabase)
images/           # backup das fotos otimizadas (também já no Supabase)
vercel.json       # cleanUrls (faz /admin servir admin.html)
```

## Deploy na Vercel

1. Importe este repositório na Vercel (New Project → import `lgouveac/hugo-carmo`).
2. Em **Settings → Environment Variables**, crie:
   | Variável | Valor |
   |---|---|
   | `SUPABASE_URL` | `https://gobslzsggskllmhzasti.supabase.co` |
   | `SUPABASE_SERVICE_ROLE` | a chave **service_role** do Supabase (Settings → API) |
   | `ADMIN_PASSWORD` | a senha que o Hugo vai usar no `/admin` |
3. Deploy. O site fica na URL da Vercel e o painel em **`/admin`**.

> Sem framework — a Vercel detecta os arquivos estáticos na raiz e transforma a pasta `api/` em funções automaticamente.

## Usando o painel (Hugo)
Acesse `seu-site.com/admin`, entre com a senha e edite:
- **Textos** — títulos, subtítulos, sobre, CTA.
- **Fotografias / Montagens** — adicionar (upload), legenda, reordenar (↑ ↓), remover.
- **Produtos** — título, preço, estoque, trocar imagem.
- **Exposições** e **Contato** (WhatsApp, Instagram).

Clique em **Salvar alterações** — o site atualiza na hora.

## Segurança
- A `service_role` fica **só** nas variáveis de ambiente da Vercel — nunca no navegador nem no Git.
- O `.gitignore` ignora `.env`. Use `.env.example` como modelo (sem valores reais).
- Recomendado **rotacionar a chave `service_role`** no Supabase periodicamente (Settings → API).

## Rodar localmente
O site público funciona com qualquer servidor estático (lê o Supabase remoto):
```bash
python3 -m http.server 8000   # http://localhost:8000
```
O painel `/admin` precisa das funções serverless — rode com a Vercel CLI:
```bash
npm i -g vercel
vercel dev    # cria um .env local com as 3 variáveis acima
```
