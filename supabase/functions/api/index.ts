// Supabase Edge Function "api": Groq proxy (keeps the key secret, rate-limits per user)
// plus account deletion. Deploy from the Supabase dashboard (Edge Functions → Deploy new
// function → name it "api" → paste this file) and set the GROQ_API_KEY secret.
import { createClient } from 'npm:@supabase/supabase-js@2';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODELS: Record<string, string> = {
  vision: Deno.env.get('GROQ_VISION_MODEL') ?? 'qwen/qwen3.8-27b',
  text: Deno.env.get('GROQ_TEXT_MODEL') ?? 'openai/gpt-oss-120b',
  fast: Deno.env.get('GROQ_FAST_MODEL') ?? 'llama-3.1-8b-instant',
};
const FALLBACK: Record<string, string> = {
  vision: 'meta-llama/llama-4-scout-17b-16e-instruct',
  text: 'llama-3.3-70b-versatile',
  fast: 'llama-3.3-70b-versatile',
};
const DAILY_LIMIT = Number(Deno.env.get('AI_DAILY_LIMIT') ?? 200);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// New-style projects expose keys as a JSON object, e.g. {"default": "sb_secret_…"}
function firstKey(envName: string): string | undefined {
  try { return Object.values(JSON.parse(Deno.env.get(envName) ?? '{}'))[0] as string | undefined; } catch { return undefined; }
}

// ---------------------------------------------------------------- shop scout
// Searches clothing brands' own Shopify stores through their public storefront endpoints.
// Polite: follows each store's robots.txt, identifies itself, caches, small result sizes.
const UA = 'Mozilla/5.0 (compatible; ClosetApp/1.0; personal wardrobe inspiration; +https://github.com/zaHighwayman/closet)';
const cache = new Map<string, { t: number; v: unknown }>();
async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return hit.v as T;
  const v = await fn();
  cache.set(key, { t: Date.now(), v });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return v;
}
function okHost(h: string) {
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(h) && !/^(localhost|.*\.local|.*\.internal)$/i.test(h) && !/^\d+\.\d+\.\d+\.\d+$/.test(h);
}
async function fetchText(u: string, ms = 8000) {
  const r = await fetch(u, { headers: { 'User-Agent': UA, Accept: 'application/json,text/plain,*/*' }, signal: AbortSignal.timeout(ms), redirect: 'follow' });
  if (!r.ok) throw new Error(`${r.status}`);
  const len = Number(r.headers.get('content-length') || 0);
  if (len > 8_000_000) throw new Error('too large');
  return await r.text();
}
async function robots(host: string) {
  return cached(`robots:${host}`, 6 * 3600e3, async () => {
    const rules: string[] = [];
    try {
      let on = false;
      for (const line of (await fetchText(`https://${host}/robots.txt`, 5000)).split('\n')) {
        const l = line.split('#')[0].trim();
        const i = l.indexOf(':');
        if (i < 0) continue;
        const k = l.slice(0, i).trim().toLowerCase(), v = l.slice(i + 1).trim();
        if (k === 'user-agent') on = v === '*';
        else if (on && k === 'disallow' && v) rules.push(v);
      }
    } catch { /* no robots.txt: allowed */ }
    return rules;
  });
}
const allowed = (rules: string[], path: string) => !rules.some((r) => {
  const re = new RegExp('^' + r.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
  return re.test(path);
});
async function storeMeta(host: string) {
  return cached(`meta:${host}`, 24 * 3600e3, async () => {
    try { const m = JSON.parse(await fetchText(`https://${host}/meta.json`, 5000)); return { name: m.name || host, currency: m.currency || null }; }
    catch { return { name: host, currency: null }; }
  });
}
const img = (u: string | null | undefined, w = 900) => (!u ? null : (u.startsWith('//') ? 'https:' + u : u).replace(/([?&])width=\d+/, '$1') + (u.includes('?') ? '&' : '?') + `width=${w}`);

type Product = { store: string; brand: string; title: string; handle: string; url: string; image: string | null; images?: string[]; price: number | null; currency: string | null; type: string; tags: string[] };

async function searchStore(host: string, q: string, limit: number): Promise<Product[]> {
  const [rules, meta] = await Promise.all([robots(host), storeMeta(host)]);
  const map = (p: any, images?: string[]): Product => ({
    store: host, brand: p.vendor || meta.name, title: String(p.title || '').slice(0, 140), handle: p.handle,
    url: `https://${host}/products/${p.handle}`, image: img(p.image || p.featured_image?.url || p.images?.[0]?.src),
    images: images?.slice(0, 6), price: p.price != null ? Number(p.price) : p.variants?.[0]?.price != null ? Number(p.variants[0].price) : null,
    currency: meta.currency, type: String(p.type || p.product_type || ''), tags: (Array.isArray(p.tags) ? p.tags : String(p.tags || '').split(',')).map((t: string) => t.trim()).filter(Boolean).slice(0, 12),
  });
  const suggest = '/search/suggest.json';
  if (allowed(rules, suggest)) {
    const u = `https://${host}${suggest}?q=${encodeURIComponent(q)}&resources[type]=product&resources[limit]=${limit}`;
    const d = JSON.parse(await fetchText(u));
    return (d.resources?.results?.products || []).filter((p: any) => p.available !== false).map((p: any) => map(p));
  }
  if (!allowed(rules, '/products.json')) return [];
  // store forbids bots on search: read its public product list instead and match locally
  const list: any[] = await cached(`products:${host}`, 3600e3, async () => JSON.parse(await fetchText(`https://${host}/products.json?limit=250`, 12000)).products || []);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  return list.filter((p) => {
    const hay = `${p.title} ${p.product_type} ${(p.tags || []).join(' ')}`.toLowerCase();
    return words.every((w) => hay.includes(w)) && p.variants?.some((v: any) => v.available !== false);
  }).slice(0, limit).map((p) => map(p, (p.images || []).map((i: any) => img(i.src))));
}

async function productImages(host: string, handle: string) {
  const rules = await robots(host);
  if (!allowed(rules, `/products/${handle}.json`)) return [];
  const d = JSON.parse(await fetchText(`https://${host}/products/${encodeURIComponent(handle)}.json`));
  return (d.product?.images || []).slice(0, 8).map((i: any) => img(i.src));
}

async function groq(model: string, body: Record<string, unknown>) {
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('GROQ_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, model }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const publicKey = Deno.env.get('SUPABASE_ANON_KEY') || firstKey('SUPABASE_PUBLISHABLE_KEYS');
  const adminKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || firstKey('SUPABASE_SECRET_KEYS');
  if (!publicKey || !adminKey) return json({ error: 'Supabase keys missing in function environment' }, 500);
  // verify the caller ourselves (works with legacy and new JWT signing keys)
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const userClient = createClient(url, publicKey);
  const { data: { user } } = token ? await userClient.auth.getUser(token) : { data: { user: null } };
  if (!user) return json({ error: 'Not signed in' }, 401);
  const admin = createClient(url, adminKey);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Bad JSON' }, 400); }

  // ---- account deletion
  if (body.action === 'delete_account') {
    const { data: files } = await admin.storage.from('closet').list(user.id, { limit: 1000 });
    if (files?.length) await admin.storage.from('closet').remove(files.map((f) => `${user.id}/${f.name}`));
    const { error } = await admin.auth.admin.deleteUser(user.id);
    return error ? json({ error: error.message }, 500) : json({ ok: true });
  }

  // ---- shop scout: search brand stores
  if (body.action === 'shop_search') {
    const q = String(body.query || '').slice(0, 80).trim();
    const hosts: string[] = (Array.isArray(body.stores) ? body.stores : []).map((h: string) => String(h).toLowerCase().replace(/^https?:\/\//, '').split('/')[0]).filter(okHost).slice(0, 8);
    if (!q || !hosts.length) return json({ error: 'query and stores required' }, 400);
    const limit = Math.min(Number(body.limit) || 6, 12);
    const results = await Promise.allSettled(hosts.map((h) => searchStore(h, q, limit)));
    const products = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    const errors = results.map((r, i) => (r.status === 'rejected' ? `${hosts[i]}: ${String(r.reason).slice(0, 80)}` : null)).filter(Boolean);
    return json({ products, errors });
  }
  if (body.action === 'shop_product') {
    const host = String(body.store || '').toLowerCase();
    if (!okHost(host) || !body.handle) return json({ error: 'store and handle required' }, 400);
    try { return json({ images: await productImages(host, String(body.handle)) }); } catch (e) { return json({ images: [], error: String(e) }); }
  }

  // ---- AI chat completion
  if (!Deno.env.get('GROQ_API_KEY')) return json({ error: 'GROQ_API_KEY secret is not set on the server' }, 500);
  const kind = ['vision', 'text', 'fast'].includes(body.kind) ? body.kind : 'text';
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const size = JSON.stringify(messages).length;
  const images = JSON.stringify(messages).split('"image_url"').length - 1;
  if (!messages.length || messages.length > 40) return json({ error: 'Bad messages' }, 400);
  if (kind !== 'vision' && size > 80_000) return json({ error: 'Request too large' }, 413);
  if (kind === 'vision' && (images > 3 || size > 6_000_000)) return json({ error: 'Too many / too large images' }, 413);

  const { data: count, error: rlErr } = await admin.rpc('bump_ai_usage', { uid: user.id });
  if (rlErr) return json({ error: 'Rate limiter failed: ' + rlErr.message }, 500);
  if (count > DAILY_LIMIT) return json({ error: `Daily AI limit reached (${DAILY_LIMIT}). Resets at midnight UTC.` }, 429);

  const req2: Record<string, unknown> = {
    messages,
    temperature: typeof body.temperature === 'number' ? Math.max(0, Math.min(1.5, body.temperature)) : 0.4,
    max_completion_tokens: Math.min(Number(body.max_tokens) || 1200, 3000),
  };
  if (body.json) req2.response_format = { type: 'json_object' };

  let model = MODELS[kind];
  let r = await groq(model, model.startsWith('openai/gpt-oss') ? { ...req2, reasoning_effort: 'low' } : req2);
  if (!r.ok && [400, 404, 503].includes(r.status) && FALLBACK[kind] !== model) {
    model = FALLBACK[kind];
    r = await groq(model, req2);
  }
  if (!r.ok) return json({ error: r.data?.error?.message || `Groq error ${r.status}` }, r.status === 429 ? 429 : 502);

  let content: string = r.data.choices?.[0]?.message?.content ?? '';
  content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  return json({ content, model, remaining: Math.max(0, DAILY_LIMIT - count) });
});
