// Radar semanal de editais de fotografia — roda via Vercel Cron (seg 08h BRT).
// Cura oportunidades GRATUITAS via OpenAI (web_search) e envia ao Hugo pelo Resend.
// Fallback: se a IA falhar, envia um e-mail com os portais perenes (Hugo nunca fica sem).
export const config = { maxDuration: 300 };

const PORTAIS = [
  ['PhMuseum Awards', 'https://phmuseum.com/awards'],
  ['LensCulture', 'https://www.lensculture.com/competitions'],
  ['Lenscratch', 'https://lenscratch.com/resources/callsforentry/'],
  ['Booooooom', 'https://www.booooooom.com/open-calls/'],
  ['All About Photo', 'https://www.all-about-photo.com/photo-contests'],
  ['Photo Contest Calendar', 'https://www.photocontestcalendar.com/'],
];

const PROMPT = `Você é um radar semanal de oportunidades para o fotógrafo brasileiro Hugo Carmo (Rio de Janeiro; trabalho de viagem/ciclo-viagens, natureza, paisagem e documental, P&B e cor; série "Escombros" sobre ruínas). Hoje é ${new Date().toISOString().slice(0,10)}.

Pesquise na web editais, concursos, grants e chamadas de EXPOSIÇÃO de fotografia que estejam ABERTOS AGORA, com INSCRIÇÃO 100% GRATUITA (sem taxa) e prazo NO FUTURO. Fontes boas: phmuseum.com/awards, lensculture.com/competitions, lenscratch.com, booooooom.com/open-calls, all-about-photo.com, theartlist.com, photocontestcalendar.com. Faça buscas como "free photography open call ${new Date().getFullYear()} no entry fee".

Selecione de 3 a 6 melhores que sejam: (a) TOTALMENTE GRATUITAS (regra obrigatória — na dúvida, não inclua); (b) abertas a fotógrafos internacionais/brasileiros (exclua as restritas a um único país); (c) relevantes aos temas do Hugo (viagem, natureza, paisagem, documental, ruínas, tema livre). Para cada, confirme na página oficial que o prazo é futuro E que é gratuita.

REGRAS RÍGIDAS (obrigatórias):
- NUNCA inclua edital com prazo já passado, encerrado ou marcado como "expirado". Se não conseguir CONFIRMAR que o prazo é depois de hoje, NÃO inclua.
- Use SEMPRE a URL oficial da organização/plataforma de inscrição (ex.: site do prêmio, phmuseum.com, picter.com), NUNCA um artigo de notícia/blog de terceiros.
- NÃO invente prazos nem URLs. Melhor trazer 3 confiáveis do que 6 duvidosos.

Responda APENAS com um array JSON válido (sem markdown, sem texto fora do array), no formato:
[{"name":"...","deadline":"prazo em pt-BR, ex: 11 de setembro de 2026","url":"https://pagina-oficial","local":"linha curta, ex: Online · Vogue","desc":"1-2 frases em pt-BR do que oferece","why":"1 frase em pt-BR de por que combina com o Hugo","urgent":true_se_o_prazo_está_muito_próximo}]`;

async function curate(OAI) {
  // guarda de 45s: se a IA demorar, aborta pra caber no timeout de 60s e cair no fallback
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 45000);
  let j;
  try {
    const r = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', signal: ctrl.signal,
      headers: { Authorization: `Bearer ${OAI}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4.1', tools: [{ type: 'web_search' }], input: PROMPT }),
    });
    j = await r.json();
    if (!r.ok) throw new Error('OpenAI ' + (j.error?.message || r.status));
  } finally { clearTimeout(t); }
  let txt = j.output_text;
  if (!txt && Array.isArray(j.output)) {
    txt = j.output.filter(o => o.type === 'message').flatMap(o => (o.content || [])).filter(c => c.type === 'output_text').map(c => c.text).join('\n');
  }
  const m = String(txt || '').match(/\[[\s\S]*\]/);
  if (!m) throw new Error('sem JSON');
  const arr = JSON.parse(m[0]);
  if (!Array.isArray(arr)) return [];
  // filtro de segurança: descarta expirados / URLs não-oficiais / campos faltando
  return arr.filter(o => o && o.name && o.deadline && /^https?:\/\//.test(o.url || '')
    && !/expir|encerr|passad|closed|ended|vencid/i.test(o.deadline)).slice(0, 6);
}

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function card(o) {
  const [bg, tc] = o.urgent ? ['#fee2e2', '#991b1b'] : ['#dcfce7', '#166534'];
  const pill = (t, b, c) => `<span style="display:inline-block;background:${b};color:${c};font-size:12px;font-weight:600;padding:3px 10px;border-radius:999px;margin:0 6px 6px 0;">${esc(t)}</span>`;
  const loc = o.local ? `<span style="display:inline-block;color:#71717a;font-size:12px;padding:3px 0;margin:0 6px 6px 0;">${esc(o.local)}</span>` : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e4e4e7;border-radius:12px;margin:0 0 14px;"><tr><td style="padding:18px;">${pill('Prazo: ' + o.deadline, bg, tc)}${pill('Gratuito', '#dcfce7', '#166534')}${loc}<div style="font-size:17px;font-weight:700;color:#0a0a0a;margin:6px 0 6px;">${esc(o.name)}</div><div style="font-size:14px;color:#3f3f46;line-height:1.55;margin:0 0 6px;">${esc(o.desc)}</div>${o.why ? `<div style="font-size:13px;color:#52525b;line-height:1.5;margin:0 0 14px;"><strong>Por que combina:</strong> ${esc(o.why)}</div>` : ''}<a href="${esc(o.url)}" style="display:inline-block;background:#0a0a0a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:9px 16px;border-radius:8px;">Ver edital →</a></td></tr></table>`;
}

function buildHtml(opps) {
  const cards = opps.map(card).join('');
  const portais = `<div style="margin:22px 0 4px;font-size:15px;font-weight:700;color:#0a0a0a;">📌 Portais pra ficar de olho (sempre atualizados)</div><div style="font-size:13px;color:#3f3f46;line-height:1.9;">${PORTAIS.map(([n, u]) => `<a href="${u}" style="color:#0a0a0a;">${n}</a>`).join(' · ')}</div>`;
  const intro = opps.length
    ? `Oi Hugo! Separei oportunidades <strong>abertas agora</strong> e <strong>100% gratuitas</strong> (sem taxa de inscrição), pensando no seu trabalho de viagem, paisagem e documental. Confirme prazo e regras na página oficial antes de aplicar.`
    : `Oi Hugo! Esta semana não consegui confirmar novas chamadas gratuitas com segurança, mas deixo os portais sempre atualizados abaixo — vale uma passada de olho.`;
  const sub = opps.length ? `${opps.length} oportunidade(s) aberta(s) e 100% gratuita(s)` : 'portais de oportunidades';
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f5;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px;"><tr><td align="center"><table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e4e4e7;border-radius:16px;overflow:hidden;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;"><tr><td style="background:#0a0a0a;padding:26px 26px 22px;"><div style="font-size:11px;letter-spacing:2px;color:#a1a1aa;text-transform:uppercase;">Radar de oportunidades</div><div style="font-size:24px;font-weight:700;color:#ffffff;margin:8px 0 4px;line-height:1.25;">Editais gratuitos de fotografia &amp; exposições</div><div style="font-size:13px;color:#a1a1aa;">${sub}</div></td></tr><tr><td style="padding:24px 26px 8px;"><p style="font-size:14px;color:#3f3f46;line-height:1.6;margin:0 0 18px;">${intro}</p>${cards}${portais}<p style="font-size:12px;color:#a1a1aa;line-height:1.6;margin:22px 0 2px;border-top:1px solid #f0f0f1;padding-top:16px;">Curadoria de oportunidades gratuitas para Hugo Carmo · enviado por flowcode. As datas são informativas — confirme prazo e regras na página oficial de cada edital antes de aplicar.</p></td></tr></table></td></tr></table></body></html>`;
}

function buildText(opps) {
  let t = 'Radar de oportunidades — editais gratuitos de fotografia\n\nOi Hugo!\n\n';
  for (const o of opps) t += `- ${o.name}\n  Prazo: ${o.deadline} | Gratuito\n  ${o.desc || ''}\n  ${o.url}\n\n`;
  t += 'Portais: ' + PORTAIS.map(([n, u]) => `${n} (${u})`).join(', ') + '\n\nConfirme prazo e regras na página oficial antes de aplicar. — flowcode';
  return t;
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ error: 'CRON_SECRET não configurada' });
  const provided = (req.query && req.query.secret) || (req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  if (provided !== secret) return res.status(401).json({ error: 'unauthorized' });

  const RESEND = process.env.RESEND_API_KEY;
  const OAI = process.env.OPENAI_API_KEY;
  if (!RESEND) return res.status(500).json({ error: 'RESEND_API_KEY não configurada' });

  let opps = [], mode = 'fallback', curateErr = null;
  if (OAI) { try { opps = await curate(OAI); mode = opps.length ? 'curated' : 'fallback'; } catch (e) { curateErr = String(e.message || e); } }

  // dry-run: cura mas NÃO envia (pra testar sem incomodar o Hugo)
  if (req.query && req.query.dry) return res.status(200).json({ dry: true, mode, count: opps.length, curateErr, opps });

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Radar Hugo Carmo <arte@flowcode.cc>', to: ['hugo.gcarmo@gmail.com'], reply_to: 'arte@flowcode.cc',
      subject: 'Radar de oportunidades — editais gratuitos de fotografia',
      html: buildHtml(opps), text: buildText(opps),
    }),
  });
  const j = await r.json().catch(() => ({}));
  return res.status(r.ok ? 200 : 502).json({ sent: r.ok, id: j.id, count: opps.length, mode, curateErr });
}
