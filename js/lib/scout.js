// The scout: while the app is open it quietly works out which pieces would unlock the best
// outfits for your closet, searches brand stores for real products, cuts the photos out and
// caches them on this device. Really good finds light up a dot on Discover.
import * as db from './db.js';
import { FUNCTION_NAME } from '../config.js';
import { getState, setState, settings } from './store.js';
import { cutoutProduct, toAiDataUrl } from './images.js';
import { checkProductPhoto, aiAvailable } from './ai.js';
import { STORES } from '../styling/stores.js';
import { classify } from '../styling/classify.js';
import { buildCatalog, discoverBatch } from '../styling/catalog.js';
const SEASON_TEMP = { winter: 0, autumn: 10, spring: 13, summer: 22 };
const seasonWeather = (season) => ({ mode: 'weather', dayProfile: 'outside', forecast: { temp: SEASON_TEMP[season], feelsLike: SEASON_TEMP[season], code: 2 } });
import { generate } from '../styling/engine.js';
import { normalizeItem, seasonFor, SUBCATEGORIES } from '../styling/taxonomy.js';
import { colorName, hexToHsl, hueDistance, isNeutral } from '../styling/color.js';

const TICK_MS = 45_000, FIRST_MS = 8_000, SESSION_CAP = 30, MAX_KEPT = 150;
const QUERY_WORD = {
  't-shirt': 'tee', 'long-sleeve tee': 'long sleeve tee', 'crewneck sweater': 'sweater', 'v-neck sweater': 'v-neck sweater', 'quarter-zip': 'quarter zip',
  'casual shirt': 'shirt', 'oxford shirt': 'oxford shirt', 'dress shirt': 'dress shirt', 'short-sleeve shirt': 'short sleeve shirt', 'chinos': 'chino',
  'trousers': 'trouser', 'cargo pants': 'cargo pant', 'joggers': 'sweatpant', 'wool coat': 'coat', 'puffer jacket': 'puffer', 'chore jacket': 'chore jacket',
  'chelsea boots': 'chelsea boot', 'sneakers': 'sneaker', 'loafers': 'loafer', 'boots': 'boot',
};

// ------------------------------------------------------------------ cache (IndexedDB, this device)
let dbp = null;
function idb() {
  dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open('closet-scout', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('found', { keyPath: 'id' });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return dbp;
}
const tx = async (mode) => (await idb()).transaction('found', mode).objectStore('found');
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

async function loadFound() {
  const rows = (await req((await tx('readonly')).getAll())).sort((a, b) => b.found - a.found);
  return rows;
}
async function saveFound(row) {
  await req((await tx('readwrite')).put(row));
  const all = await loadFound();
  for (const old of all.slice(MAX_KEPT)) if (!old.keep) await req((await tx('readwrite')).delete(old.id));
}
export async function markSeen() {
  const rows = await loadFound();
  for (const r of rows.filter((x) => x.hot && !x.seen)) { r.seen = true; await req((await tx('readwrite')).put(r)); }
  publish(await loadFound());
}
export async function clearFound() {
  await req((await tx('readwrite')).clear());
  publish([]);
}

/** Cached products as engine items (pieces you don't own, with real photos). */
export const toItem = (r) => normalizeItem({
  id: r.id, virtual: true, real: true, status: 'clean', name: r.title, subcategory: r.subcategory, category: r.category,
  colors: r.colors, style_tags: r.style_tags, material: r.material, image_url: r.image, aspect: r.aspect,
  brand: r.brand, price: r.price, currency: r.currency, url: r.url, store: r.store, orig: r.orig, hot: r.hot, found: r.found,
});

function publish(rows) {
  setState({ scoutFound: rows.map(toItem), scoutHot: rows.filter((r) => r.hot && !r.seen).length });
}
const status = (text) => setState({ scoutStatus: text });

// ------------------------------------------------------------------ what to look for
export const prefs = () => ({ brands: [], keywords: '', shopFor: 'auto', ...(settings().scout || {}) });

function shopFor(items) {
  const p = prefs().shopFor;
  if (p !== 'auto') return p;
  return items.some((i) => ['skirt', 'dress', 'heels', 'blouse', 'jumpsuit'].includes(i.subcategory)) ? 'all' : 'men';
}

function pickStores(items, n = 5) {
  const p = prefs();
  if (p.brands.length) return STORES.filter((s) => p.brands.includes(s.domain)).map((s) => s.domain).sort(() => Math.random() - 0.5).slice(0, 8);
  const who = shopFor(items);
  const profile = new Set(getState().profile?.style_profile || []);
  return STORES.filter((s) => who === 'all' || s.gender === 'unisex' || s.gender === who)
    .map((s) => ({ s, w: Math.random() + s.styles.filter((t) => profile.has(t)).length }))
    .sort((a, b) => b.w - a.w).slice(0, n).map((x) => x.s.domain);
}

/** The pieces that would unlock the most outfits, as search queries. */
function wants(items) {
  const p = prefs();
  const kw = p.keywords.trim();
  const season = seasonFor(new Date(), settings().location?.lat ?? 60);
  const catalog = buildCatalog(items, { season });
  const counts = new Map();
  const seen = new Set(), featured = new Map();
  for (let seed = 1; seed <= 6; seed++) {
    for (const d of discoverBatch(items, catalog, { occasion: ['casual', 'smart casual', 'date'][seed % 3], season, weather: seasonWeather(season), styleProfile: getState().profile?.style_profile || [] }, { seed: seed * 7907, seen, featured, size: 8 })) {
      for (const m of d.missing) {
        const k = `${m.colors[0].name}|${m.subcategory}`;
        counts.set(k, (counts.get(k) || 0) + 1 + (d.missing.length === 1 ? 1 : 0));
      }
    }
  }
  const list = [...counts].sort((a, b) => b[1] - a[1]).map(([k]) => {
    const [color, sub] = k.split('|');
    return { sub, color, query: `${kw ? kw + ' ' : ''}${color} ${QUERY_WORD[sub] || sub}` };
  });
  if (kw) list.unshift({ sub: null, color: null, query: kw }); // your own search words first
  return list;
}

// ------------------------------------------------------------------ searching
const recent = () => { try { return JSON.parse(localStorage.getItem('closet.scout.q') || '{}'); } catch { return {}; } };
const remember = (q) => { const r = recent(); r[q] = Date.now(); try { localStorage.setItem('closet.scout.q', JSON.stringify(r)); } catch {} };

async function call(body) {
  try {
    const r = await db.invokeFunction(FUNCTION_NAME, body);
    if (r?.content !== undefined) throw new Error('outdated-function');
    return r;
  } catch (e) {
    // the old version of the function doesn't know shop_search and answers "Bad messages"
    if (/bad messages/i.test(e.message)) throw new Error('outdated-function');
    throw e;
  }
}

const nearColor = (a, b) => {
  if (!a || !b) return true;
  if (isNeutral(a) !== isNeutral(b)) return false;
  return isNeutral(a) ? Math.abs(hexToHsl(a.hex).l - hexToHsl(b.hex).l) < 0.25 : hueDistance(hexToHsl(a.hex).h, hexToHsl(b.hex).h) < 35;
};
const MATERIALS = ['cashmere', 'merino', 'wool', 'linen', 'denim', 'corduroy', 'leather', 'suede', 'fleece', 'nylon', 'canvas', 'flannel', 'cotton', 'jersey'];

async function processProduct(p, want, items) {
  const c = classify(p);
  if (!c.subcategory || !['top', 'outerwear', 'bottom', 'one_piece', 'shoes'].includes(c.category)) return null;
  const id = `p:${p.store}:${p.handle}`;
  status(`Getting photos of ${p.brand} ${p.title}…`);
  let images = p.images?.length ? p.images : [p.image];
  if (images.length < 2) { try { images = [p.image, ...((await call({ action: 'shop_product', store: p.store, handle: p.handle })).images || [])]; } catch {} }
  const cut = await cutoutProduct([...new Set(images)], (s) => status(s));
  if (!cut) return null;
  let tags = [], ai = null;
  if (aiAvailable()) {
    try {
      ai = await checkProductPhoto(await toAiDataUrl(cut.blob, 384), { onWait: (s) => status(s ? `AI busy — checking again in ${s}s…` : 'Checking the photo…') });
      if (ai.garment_only === false) return null;
      tags = ai.style_tags || [];
    } catch { /* AI unavailable: keep the photo */ }
  }
  const sub = SUBCATEGORIES[ai?.subcategory]?.category === c.category ? ai.subcategory : c.subcategory;
  const palette = cut.palette.length ? cut.palette : [{ hex: c.color?.hex || '#808080', share: 1 }];
  const colors = palette.map((x, i) => ({ ...x, name: i === 0 ? (c.color?.name || ai?.color || colorName(x.hex)) : colorName(x.hex) }));
  const image = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(cut.blob); });
  const lower = p.title.toLowerCase();
  const store = STORES.find((s) => s.domain === p.store);
  const row = {
    id, store: p.store, brand: store?.brand || p.brand, title: p.title, url: p.url, price: p.price, currency: p.currency, orig: cut.source,
    subcategory: sub, category: SUBCATEGORIES[sub].category, colors, material: MATERIALS.find((m) => lower.includes(m))?.replace('merino', 'wool') || null,
    style_tags: [...new Set([...tags, ...(store?.styles || []).slice(0, 1)])], image, aspect: cut.width / cut.height, found: Date.now(), query: want?.query,
  };
  // really good = makes an outfit rated 8.8+ where it's the only piece you're missing
  const it = toItem(row);
  const season = seasonFor(new Date(), settings().location?.lat ?? 60);
  const best = generate([...items, it], { occasion: settings().occasion || 'casual', mustInclude: [id], count: 1, includeDirty: true, weather: seasonWeather(season), season,
    styleProfile: getState().profile?.style_profile || [] })[0];
  row.score = best?.rating || 0;
  row.hot = !!best && best.rating >= 8.8 && best.itemIds.filter((x) => x.startsWith('p:') || x.startsWith('v:')).length === 1;
  return row;
}

/** One round: pick a want, search a few stores, keep up to `keep` new real products. */
export async function scoutOnce({ query = null, keep = 2 } = {}) {
  const st = getState();
  const items = st.items || [];
  if (items.length < 3) return 0;
  const have = new Set((await loadFound()).map((r) => r.id));
  const r = recent();
  const want = query ? { sub: null, color: null, query } : wants(items).find((w) => !r[w.query] || Date.now() - r[w.query] > 12 * 3600e3);
  if (!want) { status('Nothing new to look for right now'); return 0; }
  remember(want.query);
  const stores = pickStores(items);
  status(`Searching ${stores.length} stores for “${want.query}”…`);
  const res = await call({ action: 'shop_search', query: want.query, stores, limit: 6 });
  const who = shopFor(items);
  const owned = items.map((i) => ({ sub: i.subcategory, c: i.colors?.[0] }));
  const cands = (res.products || []).filter((p) => p.image && !have.has(`p:${p.store}:${p.handle}`)).map((p) => ({ p, c: classify(p) }))
    .filter(({ c }) => c.subcategory && !(who === 'men' && c.women) && !(who === 'women' && c.men && !c.women))
    .filter(({ c }) => !owned.some((o) => o.sub === c.subcategory && c.color && o.c && nearColor(o.c, c.color) && colorName(o.c.hex) === colorName(c.color.hex)))
    .sort((a, b) => ((b.c.subcategory === want.sub) - (a.c.subcategory === want.sub)) || ((b.c.color?.name === want.color) - (a.c.color?.name === want.color)));
  let kept = 0;
  for (const { p } of cands) {
    if (kept >= keep) break;
    try {
      const row = await processProduct(p, want, items);
      if (row) { await saveFound(row); kept++; publish(await loadFound()); }
    } catch (e) { console.warn('scout', p.title, e); }
  }
  status(kept ? `Found ${kept} new piece${kept > 1 ? 's' : ''} for “${want.query}”` : `Nothing new for “${want.query}”`);
  return kept;
}

// ------------------------------------------------------------------ background loop
let timer = null, busy = false, done = 0;
export async function startScout() {
  if (timer) return;
  publish(await loadFound()); // show what's already cached, even offline / in demo mode
  if (db.isLocal) return;
  const tick = async () => {
    timer = setTimeout(tick, TICK_MS);
    if (busy || document.hidden || !navigator.onLine || done >= SESSION_CAP || settings().scout?.paused) return;
    busy = true;
    try { done += await scoutOnce(); }
    catch (e) {
      if (e.message === 'outdated-function') { status('Update your Supabase function to turn on the scout (see README)'); clearTimeout(timer); timer = null; }
      else status('Scout paused: ' + e.message);
    }
    busy = false;
  };
  timer = setTimeout(tick, FIRST_MS);
}
export const scoutBusy = () => busy;
/** Search right now (your own search words). */
export async function searchNow(query) {
  if (db.isLocal) throw new Error('The scout needs accounts (Supabase) — it searches stores from the server.');
  while (busy) await new Promise((r) => setTimeout(r, 500));
  busy = true;
  try { return await scoutOnce({ query, keep: 4 }); } finally { busy = false; }
}
