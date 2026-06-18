// Shared helpers for the Hugo Carmo CMS serverless functions.
// Files prefixed with "_" are NOT exposed as routes by Vercel.
import crypto from 'crypto';

export function env() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;
  const pass = process.env.ADMIN_PASSWORD;
  if (!url || !key || !pass) {
    const e = new Error('Variáveis de ambiente faltando: SUPABASE_URL, SUPABASE_SERVICE_ROLE, ADMIN_PASSWORD');
    e.status = 500;
    throw e;
  }
  return { url: url.replace(/\/+$/, ''), key, pass };
}

const secret = () => (process.env.ADMIN_PASSWORD || '') + '|hugo-carmo-cms';

export function makeToken(ttlMs = 1000 * 60 * 60 * 12) {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + ttlMs })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  return payload + '.' + sig;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string') return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  const expected = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return typeof exp === 'number' && exp > Date.now();
  } catch { return false; }
}

export function requireAuth(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!verifyToken(token)) { const e = new Error('Não autorizado'); e.status = 401; throw e; }
}

export function safeEqual(a, b) {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

export async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}

export { crypto };
