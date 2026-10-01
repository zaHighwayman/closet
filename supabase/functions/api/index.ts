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
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: 'Not signed in' }, 401);
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Bad JSON' }, 400); }

  // ---- account deletion
  if (body.action === 'delete_account') {
    const { data: files } = await admin.storage.from('closet').list(user.id, { limit: 1000 });
    if (files?.length) await admin.storage.from('closet').remove(files.map((f) => `${user.id}/${f.name}`));
    const { error } = await admin.auth.admin.deleteUser(user.id);
    return error ? json({ error: error.message }, 500) : json({ ok: true });
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
