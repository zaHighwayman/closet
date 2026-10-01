// AI features (Groq). In account mode requests go through the Supabase "api" function so the
// key stays secret. In offline demo mode you can paste your own free Groq key in Settings.
import * as db from './db.js';
import { FUNCTION_NAME } from '../config.js';
import { SUBCATEGORIES, PATTERNS, PATTERN_SCALES, TEXTURES, FITS, SEASONS, STYLE_TAGS, NECKLINES, OCCASIONS } from '../styling/taxonomy.js';
import { describe } from '../styling/layering.js';

const LOCAL_KEY = 'closet.groqKey';
const LOCAL_MODELS = { vision: 'qwen/qwen3.8-27b', text: 'openai/gpt-oss-120b', fast: 'llama-3.1-8b-instant' };

export const localGroqKey = {
  get: () => { try { return localStorage.getItem(LOCAL_KEY) || ''; } catch { return ''; } },
  set: (k) => { try { k ? localStorage.setItem(LOCAL_KEY, k) : localStorage.removeItem(LOCAL_KEY); } catch {} },
};
export const aiAvailable = () => !db.isLocal || !!localGroqKey.get();

async function complete({ kind = 'text', messages, json = false, max_tokens = 1200, temperature = 0.4 }) {
  if (!db.isLocal) {
    const r = await db.invokeFunction(FUNCTION_NAME, { kind, messages, json, max_tokens, temperature });
    return r.content;
  }
  const key = localGroqKey.get();
  if (!key) throw new Error('AI is off in demo mode. Add a free Groq key in Settings, or connect Supabase.');
  const body = { model: LOCAL_MODELS[kind], messages, temperature, max_completion_tokens: max_tokens };
  if (json) body.response_format = { type: 'json_object' };
  if (body.model.startsWith('openai/gpt-oss')) body.reasoning_effort = 'low';
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Groq error ${res.status}`);
  return (data.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

function parseJSON(text) {
  try { return JSON.parse(text); } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  if (m) try { return JSON.parse(m[0]); } catch {}
  throw new Error('The AI returned something unreadable — try again.');
}

// ------------------------------------------------------------------ tag a clothing photo
export async function tagItem(imageDataUrl) {
  const sys = `You are a fashion cataloguer. Look at ONE clothing item photo and return JSON describing it precisely.
Use exactly these fields:
{"name": short name e.g. "navy merino crewneck",
 "subcategory": one of ${JSON.stringify(Object.keys(SUBCATEGORIES))},
 "colors": [{"name": plain colour name, "share": 0-1}] (1-3 main colours, largest first),
 "pattern": one of ${JSON.stringify(PATTERNS)}, "pattern_scale": one of ${JSON.stringify(PATTERN_SCALES)},
 "material": one of ${JSON.stringify(TEXTURES)},
 "formality": 0-5 (0 gym/lounge, 1 casual, 2.5 smart casual, 4 business, 5 black tie),
 "warmth": 0-6 (tee 1, sweater 3, wool coat 5, puffer 6),
 "thickness": 1-5 (fabric bulk),
 "fit": one of ${JSON.stringify(FITS)},
 "neckline": one of ${JSON.stringify(NECKLINES)} ("open" for blazers/coats, "none" for bottoms/shoes),
 "sleeve": "none"|"short"|"long", "hem_length": "cropped"|"regular"|"long",
 "seasons": subset of ${JSON.stringify(SEASONS)},
 "style_tags": 1-3 of ${JSON.stringify(STYLE_TAGS)},
 "brand": brand if a logo/label is clearly visible else null,
 "description": one sentence a stylist could use to picture it (colour, fabric, details like buttons, collar, logo, wash)}`;
  const text = await complete({
    kind: 'vision', json: true, max_tokens: 700, temperature: 0.1,
    messages: [{ role: 'system', content: sys }, { role: 'user', content: [{ type: 'text', text: 'Describe this item.' }, { type: 'image_url', image_url: { url: imageDataUrl } }] }],
  });
  const t = parseJSON(text);
  if (t.subcategory && !SUBCATEGORIES[t.subcategory]) t.subcategory = null;
  if (t.subcategory) t.category = SUBCATEGORIES[t.subcategory].category;
  return t;
}

// ------------------------------------------------------------------ inspiration photo → pieces
export async function describeLook(imageDataUrl) {
  const sys = `You are a stylist. Break the outfit in this photo into its pieces. Return JSON:
{"summary": one sentence on the look's vibe and colour story,
 "occasion": one of ${JSON.stringify(Object.keys(OCCASIONS))},
 "style_tags": 1-3 of ${JSON.stringify(STYLE_TAGS)},
 "pieces": [{"subcategory": one of ${JSON.stringify(Object.keys(SUBCATEGORIES))}, "color": {"name": colour name, "hex": "#rrggbb"}, "note": short detail}]}
List each visible garment once, including layers under others (e.g. a collar peeking out of a sweater) and shoes.`;
  const text = await complete({
    kind: 'vision', json: true, max_tokens: 900, temperature: 0.2,
    messages: [{ role: 'system', content: sys }, { role: 'user', content: [{ type: 'text', text: 'What is this outfit made of?' }, { type: 'image_url', image_url: { url: imageDataUrl } }] }],
  });
  const r = parseJSON(text);
  r.pieces = (r.pieces || []).filter((p) => SUBCATEGORIES[p.subcategory]).map((p) => ({ ...p, category: SUBCATEGORIES[p.subcategory].category }));
  return r;
}

// ------------------------------------------------------------------ stylist chat
export const itemLine = (it) => {
  const bits = [describe(it), it.material, it.pattern !== 'solid' ? `${it.pattern_scale} ${it.pattern}` : null, it.fit,
    `formality ${it.formality}`, it.layer_roles?.length ? `layers: ${it.layer_roles.join('/')}` : null, it.neckline !== 'none' ? `neck: ${it.neckline}` : null,
    it.status !== 'clean' ? it.status.toUpperCase() : null].filter(Boolean);
  return `[${it.id}] ${it.name || ''} — ${bits.join(', ')}${it.description ? ` — ${it.description}` : ''}`;
};

/** Step 1: understand what the user is asking for. */
export async function parseIntent(history, ctxText) {
  const sys = `Extract the user's styling request as JSON. ${ctxText}
Return {"wants_outfits": bool (true if they want outfit suggestions), "occasion": one of ${JSON.stringify(Object.keys(OCCASIONS))} or null,
"setting": "inside" | "outside" | "mixed" | null (where they'll spend the day, if they said),
"must_include": [item ids they want to wear], "exclude": [item ids they don't want], "notes": short summary of other wishes}`;
  const text = await complete({ kind: 'fast', json: true, max_tokens: 300, temperature: 0, messages: [{ role: 'system', content: sys }, ...history.slice(-6)] });
  return parseJSON(text);
}

/** Step 2: answer, choosing only from engine-validated candidates. */
export async function stylistReply(history, { closetText, contextText, candidates }) {
  const cand = candidates.map((c, i) => `#${i}: ${c.itemIds.map((id) => c.lookup(id)).join(' + ')} | score ${c.rating}/10 | why: ${c.reasons.slice(0, 3).map((r) => r.text).join('; ')}${c.warnings.length ? ' | watch: ' + c.warnings.slice(0, 2).map((w) => w.text).join('; ') : ''}${c.commute ? ` | commute layer: ${c.lookup(c.commute.id)}` : ''}`).join('\n');
  const sys = `You are a warm, knowledgeable personal stylist inside a wardrobe app. You know colour theory (neutrals, analogous, complementary, 60-30-10), proportion, formality, pattern mixing, texture and layering (e.g. a collared shirt under a crewneck knit with the collar out; hoodies don't go under collared shirts; thin layers under thick ones).
The user's closet (DIRTY / IN_WASH items are unavailable until washed):
${closetText}

${contextText}

Outfit candidates already checked by the style engine (only clean clothes, valid layering):
${cand || '(none — the request may not need outfits, or the closet lacks pieces)'}

Reply as JSON: {"reply": your message (concise, friendly, specific — name pieces by colour and type, explain layering like where the collar sits, max ~120 words; use plain text, no markdown tables), "outfits": [candidate numbers you recommend, best first, 0-3 of them]}.
Only recommend outfits from the candidate list. If they ask about an item that's dirty, say it's in the laundry. If something is missing from their closet, you may suggest what to buy.`;
  const text = await complete({ kind: 'text', json: true, max_tokens: 1500, temperature: 0.6, messages: [{ role: 'system', content: sys }, ...history.slice(-10)] });
  const r = parseJSON(text);
  return { reply: String(r.reply || ''), outfits: (r.outfits || []).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < candidates.length) };
}

/** Optional re-rank of engine candidates for the generator. */
export async function pickBest(candidates, { occasion, notes, lookup }) {
  const list = candidates.map((c, i) => `#${i}: ${c.itemIds.map(lookup).join(' + ')} (score ${c.rating})`).join('\n');
  const sys = `You are a stylist. From these pre-validated outfits for "${occasion}", pick the best 3 and explain each in one sentence (mention colour, layering, proportion). ${notes || ''}
${list}
Return JSON {"picks": [{"n": number, "why": sentence}]}`;
  const r = parseJSON(await complete({ kind: 'text', json: true, max_tokens: 700, messages: [{ role: 'system', content: sys }, { role: 'user', content: 'Pick the best three.' }] }));
  return (r.picks || []).filter((p) => candidates[p.n]);
}
