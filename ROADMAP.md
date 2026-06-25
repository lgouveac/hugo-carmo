# Roadmap — Acervo & Navegação por temas

Objetivo: reformular o site para navegação por **produtos (foco em fotos)** e **categorias/temas**, alimentado pelo acervo real do Hugo no Google Drive.

## ✅ Feito
- **Motor de navegação por temas**: taxonomia de 6 temas (`content.temas`) + filtro na galeria + tag `temas[]` por foto + campo de edição no CMS (aba Fotografias).
- **Home reformulada (imersiva)**: home = só mosaico full-bleed + filtro expansível (Tema/Produto/Ver na sua casa); menu hambúrguer (drawer direito) que surge no 1º scroll; cada categoria virou página própria (`/cicloviagens`, `/fotolivros`, `/sobre`, `/faq`, além de `/loja` e `/blog`).
- **Curadoria do acervo (45 fotos)** baixadas do Drive, otimizadas (≤1600px), somadas via API — `fotografias` 34 → **79**. Distribuição equilibrada: litoral 27 · urbano 13 · sertão 12 · águas 11 · abstrato 8 · gente 8.
  - Fontes usadas: `retratos`, `brasil`, `TATUA`, `museu nacional`, `baixão+rumo`, `textura`, `areia`, `zig zag`.

## 🎯 Temas (6 eixos) e cobertura atual
| Tema | slug | Status | Onde buscar mais |
|---|---|---|---|
| Gente & Cotidiano | gente | bom | retratos (resto), marielle, ricardo, matheus, cris |
| Litoral & Mar | litoral | bom | TATUA (resto), fotos pro rio |
| Águas & Travessias | aguas | ok | cicloviagens, rios, sinestesia (água) |
| Abstrato & Detalhe | abstrato | fraco | **sinestesia/2.0**, **textura/1/2**, **areia**, zig zag |
| Sertão & Terra | sertao | **fraco** | brasil (resto), baixão + rumo, terra (sinestesia) |
| Urbano & Escombros | urbano | fraco | **museu nacional**, muros urbanos, som |

## 📋 Próximos passos (ordem sugerida)
1. ✅ **Loja filtrável por Tipo + Tema** — FEITO. `/loja` modular: Print (as 79 fotos por tema) + Blusa + Bandeira + Fotolivro, filtro Tipo×Tema, deep-link `?tipo=&tema=`. Home liga Blusa/Bandeira à loja filtrada.
2. ✅ **Hub "Explorar por tema"** — FEITO. Página `/temas` (6 cards com capa+contagem → `/?tema=<slug>` que filtra a galeria da home); item "Temas" no menu de todas as páginas.
3. **CMS edita EN** dos temas/captions (hoje EN é mantido manualmente).
4. **Refino do Hugo**: revisar captions/temas das 45 fotos no CMS; trocar placeholders de Blusas/Bandeiras por fotos reais; (opcional) importar `fotos pro rio`/`DNA`/`sinestesia2.0` (esta é `.psd` pesado — flatten antes).

## ⚠️ Notas do acervo (Drive "HUGOCARMO.COM.BR")
- Pasta **pública**, 40 subpastas (séries autorais + clientes + exposições + workflow). Acessar pelo **navegador** — o conector de Drive não indexa essa árvore. (Detalhes em memória `hugo-carmo-acervo-drive`.)
- **Muitas duplicatas** (pares quase idênticos) dentro das pastas — sempre dedup na curadoria.
- `convertidos site ok` = vídeos teaser `.mov` (não fotos).
- Pastas de cliente/pessoa (alcir, digao, ttk, etc.) provavelmente **não** vão pro site.
